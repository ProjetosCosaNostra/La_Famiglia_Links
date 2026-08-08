from __future__ import annotations
import argparse, hashlib, json, os, shutil, subprocess, sys, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

PROJECT = "BlackGold Beauty Finds"
MARKET = "US"
HASH_FIELDS = (
    "schema", "proposal_id", "product_id", "program_id", "retailer", "network",
    "original_url", "affiliate_url", "final_destination", "last_verified_at", "country",
    "proposed_state", "verification_method", "saved_at"
)

def canonical_candidate(c: dict) -> bytes:
    body = {k: c.get(k) for k in HASH_FIELDS}
    return json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def candidate_hash(c: dict) -> str:
    return hashlib.sha256(canonical_candidate(c)).hexdigest()

def now():
    return datetime.now(timezone.utc)

def now_iso():
    return now().isoformat()

def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def atomic_json(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".bg46.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)

def parse_time(value):
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def age_hours(value):
    return (now() - parse_time(value).astimezone(timezone.utc)).total_seconds() / 3600

def age_days(value):
    return age_hours(value) / 24

def host(value):
    try:
        return (urlparse(str(value)).hostname or "").lower()
    except Exception:
        return ""

def https(value):
    try:
        return urlparse(str(value)).scheme == "https"
    except Exception:
        return False

def host_allowed(value, allowed):
    h = host(value)
    return h in allowed or any(h.endswith("." + x) for x in allowed)

def resolve_url(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 BlackGoldBeautyFinds-LinkVerifier/4.6",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
    }
    attempts = [
        urllib.request.Request(url, headers=headers, method="HEAD"),
        urllib.request.Request(url, headers={**headers, "Range": "bytes=0-0"}, method="GET"),
    ]
    last = None
    for req in attempts:
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return int(resp.status), str(resp.geturl())
        except urllib.error.HTTPError as exc:
            last = exc
            if req.get_method() == "HEAD" and exc.code in (403, 405):
                continue
            return int(exc.code), str(exc.geturl() or url)
        except Exception as exc:
            last = exc
    raise RuntimeError("network_verification_failed: " + str(last))

def copy_backup(src: Path, backup_dir: Path):
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / src.name
    shutil.copy2(src, target)
    return target

def fail(report, code, detail):
    report["blockers"].append({"code": code, "detail": detail})

def approval_valid(a, policy, report):
    checks = [
        (a.get("schema") == policy["approval_schema"], "approval_schema"),
        (a.get("project") == PROJECT, "approval_project"),
        (a.get("market") == MARKET, "approval_market"),
        (a.get("decision") == "approve", "approval_decision"),
        (a.get("explicit_confirmation") is True, "explicit_confirmation"),
        (bool(a.get("approval_id")), "approval_id"),
        (bool(a.get("proposal_id")), "proposal_id"),
        (bool(a.get("product_id")), "product_id"),
        (bool(a.get("program_id")), "program_id"),
        (len(str(a.get("candidate_sha256", ""))) == 64, "candidate_sha256"),
    ]
    for ok, code in checks:
        if not ok:
            fail(report, code, "Approval contract not satisfied.")
    try:
        h = age_hours(a.get("approved_at"))
        if h < 0 or h > float(policy["max_approval_age_hours"]):
            fail(report, "approval_age", f"Approval age {h:.2f}h is outside policy.")
    except Exception:
        fail(report, "approval_time", "approved_at is invalid.")

def candidate_valid(c, a, policy, programs, products, retailer_policy, report):
    if not c:
        fail(report, "candidate_missing", "No imported candidate matches proposal_id.")
        return
    stored_hash = str(c.get("candidate_sha256", ""))
    recomputed_hash = candidate_hash(c)
    if not stored_hash or stored_hash != recomputed_hash:
        fail(report, "candidate_integrity", "Candidate content no longer matches its imported SHA-256.")
    if str(a.get("candidate_sha256", "")) != stored_hash:
        fail(report, "approval_candidate_hash_mismatch", "Approval is not bound to this exact candidate payload.")
    if str(c.get("product_id")) != str(a.get("product_id")):
        fail(report, "candidate_product_mismatch", "Approval product_id does not match candidate.")
    if str(c.get("program_id")) != str(a.get("program_id")):
        fail(report, "candidate_program_mismatch", "Approval program_id does not match candidate.")
    if c.get("proposed_state") != policy["require_candidate_state"]:
        fail(report, "candidate_state", "Candidate is not in candidate state.")
    if c.get("activation_state", "candidate") != "candidate":
        fail(report, "candidate_already_consumed", "Candidate has already left candidate activation state.")
    if c.get("country") != MARKET:
        fail(report, "candidate_market", "Candidate is not US.")
    if str(c.get("product_id")) not in products:
        fail(report, "unknown_product", "Candidate product is not in product registry.")
    p = programs.get(str(c.get("program_id")))
    if not p:
        fail(report, "program_missing", "Program record is missing.")
    else:
        if p.get("program_status") != policy["require_program_status"]:
            fail(report, "program_status", "Affiliate program itself is not verified.")
        if p.get("application_status") != policy["require_application_status"]:
            fail(report, "publisher_account_not_approved",
                 "Program exists, but BlackGold publisher-account approval is not recorded as approved.")
    if not https(c.get("original_url")):
        fail(report, "original_url_https", "Original retailer URL must be HTTPS.")
    if not https(c.get("affiliate_url")):
        fail(report, "affiliate_url_https", "Affiliate URL must be HTTPS.")
    if not https(c.get("final_destination")):
        fail(report, "candidate_final_https", "Candidate final destination must be HTTPS.")
    allowed_r = {str(x).lower() for x in retailer_policy.get("allowed_retailer_hosts", [])}
    allowed_a = {str(x).lower() for x in retailer_policy.get("allowed_affiliate_hosts", [])}
    if not host_allowed(c.get("final_destination"), allowed_r):
        fail(report, "candidate_final_host", "Candidate final destination host is not approved.")
    if not host_allowed(c.get("affiliate_url"), allowed_a):
        fail(report, "candidate_affiliate_host", "Affiliate host is not approved by retailer policy.")
    if policy.get("require_exact_product_verification") and \
       not str(c.get("verification_method", "")).startswith("manual_exact_product"):
        fail(report, "exact_product_verification", "Exact-product verification method is missing.")
    if policy.get("require_network_generated_tracking") and "network" not in str(c.get("verification_method", "")):
        fail(report, "network_generated_tracking", "Candidate does not attest network-generated tracking.")
    try:
        d = age_days(c.get("last_verified_at"))
        if d < 0 or d > float(policy["max_candidate_verification_age_days"]):
            fail(report, "candidate_verification_age", f"Candidate verification age {d:.2f}d is outside policy.")
    except Exception:
        fail(report, "candidate_verification_time", "Candidate last_verified_at is invalid.")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--approval", default=".blackgold/inbox/affiliate-activation-approval.json")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    inbox = (root / ".blackgold/inbox").resolve()
    approval_path = (root / args.approval).resolve()
    try:
        approval_path.relative_to(inbox)
    except ValueError:
        raise SystemExit("approval must stay inside .blackgold/inbox")

    stage = root / ".blackgold/staging/experience-v2.9"
    policy = load(stage / "data/affiliate-activation-policy.json")
    report_path = root / ".blackgold/reports/affiliate-activation-v4.6-latest.json"
    report = {
        "schema": "blackgold.affiliate-activation-report/v4.6",
        "project": PROJECT,
        "started_at": now_iso(),
        "status": "blocked",
        "public_site_changes": False,
        "route_written": False,
        "blockers": [],
        "checks": []
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)

    if not approval_path.exists():
        fail(report, "approval_missing", str(approval_path))
        atomic_json(report_path, report)
        return 2

    approval_bytes = approval_path.read_bytes()
    approval = json.loads(approval_bytes.decode("utf-8-sig"))
    report["approval_sha256"] = hashlib.sha256(approval_bytes).hexdigest()
    report["approval_id"] = approval.get("approval_id")
    approval_valid(approval, policy, report)

    activations_dir = root / ".blackgold/commerce/activations"
    activations_dir.mkdir(parents=True, exist_ok=True)
    for rp in activations_dir.glob("*.json"):
        try:
            old = load(rp)
        except Exception:
            continue
        if str(old.get("activation_id")) == str(approval.get("approval_id")):
            fail(report, "approval_replay", "approval_id has already been used for an activation.")
        if str(old.get("proposal_id")) == str(approval.get("proposal_id")):
            fail(report, "proposal_replay", "proposal_id has already been activated.")
    if report["blockers"]:
        atomic_json(report_path, report)
        return 2

    candidate_store = root / policy["candidate_store"]
    if not candidate_store.exists():
        fail(report, "candidate_store_missing", str(candidate_store))
        atomic_json(report_path, report)
        return 2

    candidates_payload = load(candidate_store)
    if candidates_payload.get("schema") != "blackgold.retailer-link-candidates/v2":
        fail(report, "candidate_store_schema", "Candidate store must be V2; re-import proposals under V4.6.")
        atomic_json(report_path, report)
        return 2
    candidates = [
        x for x in candidates_payload.get("candidates", [])
        if isinstance(x, dict) and str(x.get("proposal_id")) == str(approval.get("proposal_id"))
    ]
    if len(candidates) != 1:
        fail(report, "candidate_cardinality", f"Expected exactly one candidate; found {len(candidates)}.")
        candidate = None
    else:
        candidate = candidates[0]

    products_payload = load(stage / "data/products.json")
    products_list = products_payload.get("products", [])
    products = {str(x.get("id")): x for x in products_list if isinstance(x, dict) and x.get("id")}
    program_payload = load(stage / "data/affiliate-programs.us.json")
    programs = {str(x.get("program_id")): x for x in program_payload.get("programs", [])
                if isinstance(x, dict) and x.get("program_id")}
    retailer_policy = load(stage / "retailer-policy.json")
    candidate_valid(candidate, approval, policy, programs, products, retailer_policy, report)

    if report["blockers"]:
        atomic_json(report_path, report)
        return 2

    status, resolved = resolve_url(str(candidate["affiliate_url"]))
    report["network_check"] = {"http_status": status, "resolved_final_destination": resolved}
    min_status = int(retailer_policy.get("allowed_http_status_min", 200))
    max_status = int(retailer_policy.get("allowed_http_status_max", 399))
    allowed_r = {str(x).lower() for x in retailer_policy.get("allowed_retailer_hosts", [])}
    if status < min_status or status > max_status:
        fail(report, "network_http_status", f"HTTP status {status} is outside retailer policy.")
    if not https(resolved) or not host_allowed(resolved, allowed_r):
        fail(report, "network_final_destination", "Resolved shopper destination is not an approved retailer host.")

    declared = urlparse(str(candidate["final_destination"]))
    actual = urlparse(resolved)
    if (declared.hostname or "").lower() != (actual.hostname or "").lower():
        fail(report, "network_destination_host_changed", "Resolved host differs from exact-product candidate host.")
    if declared.path.rstrip("/") and actual.path.rstrip("/") != declared.path.rstrip("/"):
        fail(report, "network_destination_path_changed",
             "Resolved destination path differs from exact-product candidate path; re-verification required.")

    if report["blockers"]:
        atomic_json(report_path, report)
        return 2

    registry_path = stage / "data/retailer-links.json"
    products_path = stage / "data/products.json"
    registry = load(registry_path)
    links = registry.get("links", [])
    indexes = [i for i,x in enumerate(links) if str(x.get("product_id")) == str(candidate["product_id"])]
    if len(indexes) != 1:
        fail(report, "live_registry_cardinality", f"Expected one live route record; found {len(indexes)}.")
        atomic_json(report_path, report)
        return 2
    current_route = links[indexes[0]]
    if current_route.get("public_state") != policy.get("require_live_route_state", "locked"):
        fail(report, "live_route_not_locked", "Activation refuses to overwrite an already active or non-locked route.")
        atomic_json(report_path, report)
        return 2

    stamp = now().strftime("%Y%m%d_%H%M%S")
    backup_dir = root / ".blackgold/backups" / f"affiliate-activation-v4.6-{stamp}"
    registry_backup = copy_backup(registry_path, backup_dir)
    products_backup = copy_backup(products_path, backup_dir)
    candidate_backup = copy_backup(candidate_store, backup_dir)
    report["backup"] = str(backup_dir)

    activation_id = str(approval["approval_id"])
    verified_at = now_iso()
    new_route = dict(links[indexes[0]])
    new_route.update({
        "retailer": candidate.get("retailer", new_route.get("retailer", "")),
        "country": MARKET,
        "original_url": candidate["original_url"],
        "affiliate_url": candidate["affiliate_url"],
        "last_verified_at": verified_at,
        "http_status": status,
        "final_destination": resolved,
        "public_state": "verified",
        "reason": "Activated from a hash-bound imported candidate after explicit approval and network re-verification.",
        "proposal_id": candidate["proposal_id"],
        "program_id": candidate["program_id"],
        "candidate_sha256": candidate["candidate_sha256"],
        "activation_receipt_id": activation_id,
        "activation_approved_at": approval["approved_at"]
    })
    links[indexes[0]] = new_route
    registry["links"] = links

    product = products[str(candidate["product_id"])]
    product["affiliate_ready"] = True
    product["affiliate_activation_id"] = activation_id
    product["affiliate_last_verified_at"] = verified_at
    products_payload["products"] = products_list

    try:
        atomic_json(registry_path, registry)
        atomic_json(products_path, products_payload)
        report["route_written"] = True

        gate = root / policy["release_gate"]
        if not gate.exists():
            raise RuntimeError("release gate missing after activation write")
        p = subprocess.run([sys.executable, str(gate), "--root", str(root)], cwd=str(root),
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=900, check=False)
        report["release_gate"] = {
            "exit_code": p.returncode,
            "stdout": p.stdout[-12000:],
            "stderr": p.stderr[-12000:]
        }
        if p.returncode:
            raise RuntimeError("release gate blocked activated route")

        receipt = {
            "schema": "blackgold.affiliate-activation-receipt/v4.6",
            "project": PROJECT,
            "activation_id": activation_id,
            "proposal_id": candidate["proposal_id"],
            "candidate_sha256": candidate["candidate_sha256"],
            "product_id": candidate["product_id"],
            "program_id": candidate["program_id"],
            "retailer": candidate.get("retailer"),
            "activated_at": verified_at,
            "approval_sha256": report["approval_sha256"],
            "affiliate_url_sha256": hashlib.sha256(candidate["affiliate_url"].encode()).hexdigest(),
            "final_destination": resolved,
            "http_status": status,
            "public_state": "verified",
            "public_site_changes": False
        }
        for item in candidates_payload.get("candidates", []):
            if str(item.get("proposal_id")) == str(candidate["proposal_id"]):
                item["activation_state"] = "activated"
                item["activation_id"] = activation_id
                item["activated_at"] = verified_at
        candidates_payload["updated_at"] = verified_at
        atomic_json(candidate_store, candidates_payload)

        receipt_path = root / ".blackgold/commerce/activations" / f"{activation_id}.json"
        atomic_json(receipt_path, receipt)
        report["activation_receipt"] = str(receipt_path)
        report["status"] = "activated"
        report["completed_at"] = now_iso()
        atomic_json(report_path, report)
        return 0
    except Exception as exc:
        shutil.copy2(registry_backup, registry_path)
        shutil.copy2(products_backup, products_path)
        shutil.copy2(candidate_backup, candidate_store)
        report["route_written"] = False
        report["rollback"] = "completed"
        fail(report, "activation_rollback", str(exc))
        report["failed_at"] = now_iso()
        atomic_json(report_path, report)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
