from __future__ import annotations
import argparse, hashlib, json, os, shutil, subprocess, sys, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

PROJECT = "BlackGold Beauty Finds"
MARKET = "US"

def now(): return datetime.now(timezone.utc)
def now_iso(): return now().isoformat()
def load(path): return json.loads(Path(path).read_text(encoding="utf-8-sig"))
def atomic_json(path, payload):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".bg45.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)
def parse_time(v):
    d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
def age_hours(v): return (now() - parse_time(v).astimezone(timezone.utc)).total_seconds() / 3600
def age_days(v): return age_hours(v) / 24
def https(v):
    try: return urlparse(str(v)).scheme == "https"
    except Exception: return False
def host(v):
    try: return (urlparse(str(v)).hostname or "").lower()
    except Exception: return ""
def allowed_host(v, allowed):
    h = host(v)
    return h in allowed or any(h.endswith("." + x) for x in allowed)
def block(report, code, detail): report["blockers"].append({"code": code, "detail": detail})

def resolve_url(url):
    headers = {"User-Agent": "Mozilla/5.0 BlackGoldBeautyFinds-LinkVerifier/4.5", "Accept": "text/html,*/*;q=0.8"}
    attempts = [
        urllib.request.Request(url, headers=headers, method="HEAD"),
        urllib.request.Request(url, headers={**headers, "Range": "bytes=0-0"}, method="GET")
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

def validate_approval(a, policy, report):
    checks = [
        (a.get("schema") == policy["approval_schema"], "approval_schema"),
        (a.get("project") == PROJECT, "approval_project"),
        (a.get("market") == MARKET, "approval_market"),
        (a.get("decision") == "approve", "approval_decision"),
        (a.get("explicit_confirmation") is True, "explicit_confirmation"),
        (bool(a.get("approval_id")), "approval_id"),
        (bool(a.get("proposal_id")), "proposal_id"),
        (bool(a.get("product_id")), "product_id"),
        (bool(a.get("program_id")), "program_id")
    ]
    for ok, code in checks:
        if not ok: block(report, code, "Approval contract not satisfied.")
    try:
        h = age_hours(a.get("approved_at"))
        if h < 0 or h > float(policy["max_approval_age_hours"]):
            block(report, "approval_age", f"Approval age {h:.2f}h is outside policy.")
    except Exception:
        block(report, "approval_time", "approved_at is invalid.")

def validate_candidate(c, a, policy, programs, products, retailer_policy, report):
    if not c:
        block(report, "candidate_missing", "No imported candidate matches proposal_id."); return
    if str(c.get("product_id")) != str(a.get("product_id")): block(report, "candidate_product_mismatch", "Approval product_id does not match candidate.")
    if str(c.get("program_id")) != str(a.get("program_id")): block(report, "candidate_program_mismatch", "Approval program_id does not match candidate.")
    if c.get("proposed_state") != policy["require_candidate_state"]: block(report, "candidate_state", "Candidate is not in candidate state.")
    if c.get("country") != MARKET: block(report, "candidate_market", "Candidate is not US.")
    if str(c.get("product_id")) not in products: block(report, "unknown_product", "Candidate product is not in product registry.")
    pr = programs.get(str(c.get("program_id")))
    if not pr:
        block(report, "program_missing", "Program record is missing.")
    else:
        if pr.get("program_status") != policy["require_program_status"]: block(report, "program_status", "Affiliate program itself is not verified.")
        if pr.get("application_status") != policy["require_application_status"]:
            block(report, "publisher_account_not_approved", "Program exists, but publisher-account approval is not recorded as approved.")
    if not https(c.get("original_url")): block(report, "original_url_https", "Original retailer URL must be HTTPS.")
    if not https(c.get("affiliate_url")): block(report, "affiliate_url_https", "Affiliate URL must be HTTPS.")
    if not https(c.get("final_destination")): block(report, "candidate_final_https", "Candidate final destination must be HTTPS.")
    allowed_r = {str(x).lower() for x in retailer_policy.get("allowed_retailer_hosts", [])}
    allowed_a = {str(x).lower() for x in retailer_policy.get("allowed_affiliate_hosts", [])}
    if not allowed_host(c.get("final_destination"), allowed_r): block(report, "candidate_final_host", "Candidate final destination host is not approved.")
    if not allowed_host(c.get("affiliate_url"), allowed_a): block(report, "candidate_affiliate_host", "Affiliate host is not approved by retailer policy.")
    method = str(c.get("verification_method", ""))
    if policy.get("require_exact_product_verification") and not method.startswith("manual_exact_product"):
        block(report, "exact_product_verification", "Exact-product verification method is missing.")
    if policy.get("require_network_generated_tracking") and "network" not in method:
        block(report, "network_generated_tracking", "Candidate does not attest network-generated tracking.")
    try:
        d = age_days(c.get("last_verified_at"))
        if d < 0 or d > float(policy["max_candidate_verification_age_days"]):
            block(report, "candidate_verification_age", f"Candidate verification age {d:.2f}d is outside policy.")
    except Exception:
        block(report, "candidate_verification_time", "Candidate last_verified_at is invalid.")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--root", required=True)
    ap.add_argument("--approval", default=".blackgold/inbox/affiliate-activation-approval.json")
    args = ap.parse_args(); root = Path(args.root).resolve()
    inbox = (root / ".blackgold/inbox").resolve(); approval_path = (root / args.approval).resolve()
    try: approval_path.relative_to(inbox)
    except ValueError: raise SystemExit("approval must stay inside .blackgold/inbox")
    stage = root / ".blackgold/staging/experience-v2.9"
    policy_path = stage / "data/affiliate-activation-policy.json"
    if not policy_path.exists():
        fallback = root / "tools/blackgold_affiliate_activation_v45/affiliate-activation-policy.json"
        if fallback.exists(): policy_path = fallback
    policy = load(policy_path)
    report_path = root / ".blackgold/reports/affiliate-activation-v4.5-latest.json"
    report = {"schema":"blackgold.affiliate-activation-report/v4.5","project":PROJECT,"started_at":now_iso(),"status":"blocked","public_site_changes":False,"route_written":False,"blockers":[]}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    if not approval_path.exists():
        block(report, "approval_missing", str(approval_path)); atomic_json(report_path, report); return 2
    raw = approval_path.read_bytes(); approval = json.loads(raw.decode("utf-8-sig"))
    report["approval_sha256"] = hashlib.sha256(raw).hexdigest(); report["approval_id"] = approval.get("approval_id")
    validate_approval(approval, policy, report)
    candidate_store = root / policy["candidate_store"]
    if not candidate_store.exists():
        block(report, "candidate_store_missing", str(candidate_store)); atomic_json(report_path, report); return 2
    cp = load(candidate_store)
    matches = [x for x in cp.get("candidates", []) if isinstance(x, dict) and str(x.get("proposal_id")) == str(approval.get("proposal_id"))]
    candidate = matches[0] if len(matches) == 1 else None
    if len(matches) != 1: block(report, "candidate_cardinality", f"Expected exactly one candidate; found {len(matches)}.")
    products_payload = load(stage / "data/products.json"); products_list = products_payload.get("products", [])
    products = {str(x.get("id")): x for x in products_list if isinstance(x, dict) and x.get("id")}
    programs_payload = load(stage / "data/affiliate-programs.us.json")
    programs = {str(x.get("program_id")): x for x in programs_payload.get("programs", []) if isinstance(x, dict) and x.get("program_id")}
    retailer_policy = load(stage / "retailer-policy.json")
    validate_candidate(candidate, approval, policy, programs, products, retailer_policy, report)
    if report["blockers"]: atomic_json(report_path, report); return 2
    status, resolved = resolve_url(str(candidate["affiliate_url"]))
    report["network_check"] = {"http_status":status,"resolved_final_destination":resolved}
    lo = int(retailer_policy.get("allowed_http_status_min", 200)); hi = int(retailer_policy.get("allowed_http_status_max", 399))
    allowed_r = {str(x).lower() for x in retailer_policy.get("allowed_retailer_hosts", [])}
    if status < lo or status > hi: block(report, "network_http_status", f"HTTP status {status} is outside retailer policy.")
    if not https(resolved) or not allowed_host(resolved, allowed_r): block(report, "network_final_destination", "Resolved shopper destination is not an approved retailer host.")
    declared = urlparse(str(candidate["final_destination"])); actual = urlparse(resolved)
    if (declared.hostname or "").lower() != (actual.hostname or "").lower(): block(report, "network_destination_host_changed", "Resolved host differs from exact-product candidate host.")
    if declared.path.rstrip("/") and actual.path.rstrip("/") != declared.path.rstrip("/"):
        block(report, "network_destination_path_changed", "Resolved destination path differs from exact-product candidate path; re-verification required.")
    if report["blockers"]: atomic_json(report_path, report); return 2
    registry_path = stage / "data/retailer-links.json"; products_path = stage / "data/products.json"
    registry = load(registry_path); links = registry.get("links", [])
    indexes = [i for i,x in enumerate(links) if str(x.get("product_id")) == str(candidate["product_id"])]
    if len(indexes) != 1:
        block(report, "live_registry_cardinality", f"Expected one live route record; found {len(indexes)}."); atomic_json(report_path, report); return 2
    stamp = now().strftime("%Y%m%d_%H%M%S"); backup = root / ".blackgold/backups" / f"affiliate-activation-v4.5-{stamp}"
    backup.mkdir(parents=True, exist_ok=True); rb = backup / registry_path.name; pb = backup / products_path.name
    shutil.copy2(registry_path, rb); shutil.copy2(products_path, pb); report["backup"] = str(backup)
    activation_id = str(approval["approval_id"]); verified_at = now_iso(); route = dict(links[indexes[0]])
    route.update({"retailer":candidate.get("retailer",route.get("retailer","")),"country":MARKET,"original_url":candidate["original_url"],"affiliate_url":candidate["affiliate_url"],"last_verified_at":verified_at,"http_status":status,"final_destination":resolved,"public_state":"verified","reason":"Activated from an imported candidate after explicit approval and network re-verification.","proposal_id":candidate["proposal_id"],"program_id":candidate["program_id"],"activation_receipt_id":activation_id,"activation_approved_at":approval["approved_at"]})
    links[indexes[0]] = route; registry["links"] = links
    product = products[str(candidate["product_id"])]; product["affiliate_ready"] = True; product["affiliate_activation_id"] = activation_id; product["affiliate_last_verified_at"] = verified_at
    try:
        atomic_json(registry_path, registry); atomic_json(products_path, products_payload); report["route_written"] = True
        gate = root / policy["release_gate"]
        if not gate.exists(): raise RuntimeError("release gate missing after activation write")
        p = subprocess.run([sys.executable,str(gate),"--root",str(root)],cwd=str(root),capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=900,check=False)
        report["release_gate"] = {"exit_code":p.returncode,"stdout":p.stdout[-12000:],"stderr":p.stderr[-12000:]}
        if p.returncode: raise RuntimeError("release gate blocked activated route")
        receipt = {"schema":"blackgold.affiliate-activation-receipt/v4.5","project":PROJECT,"activation_id":activation_id,"proposal_id":candidate["proposal_id"],"product_id":candidate["product_id"],"program_id":candidate["program_id"],"retailer":candidate.get("retailer"),"activated_at":verified_at,"approval_sha256":report["approval_sha256"],"affiliate_url_sha256":hashlib.sha256(candidate["affiliate_url"].encode()).hexdigest(),"final_destination":resolved,"http_status":status,"public_state":"verified","public_site_changes":False}
        receipt_path = root / ".blackgold/commerce/activations" / f"{activation_id}.json"; atomic_json(receipt_path, receipt)
        report["activation_receipt"] = str(receipt_path); report["status"] = "activated"; report["completed_at"] = now_iso(); atomic_json(report_path, report); return 0
    except Exception as exc:
        shutil.copy2(rb, registry_path); shutil.copy2(pb, products_path); report["route_written"] = False; report["rollback"] = "completed"; block(report, "activation_rollback", str(exc)); report["failed_at"] = now_iso(); atomic_json(report_path, report); return 2

if __name__ == "__main__": raise SystemExit(main())
