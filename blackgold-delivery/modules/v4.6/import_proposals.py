from __future__ import annotations
import argparse, hashlib, json, os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

SCHEMA = "blackgold.retailer-link-proposals/v1"
PROJECT = "BlackGold Beauty Finds"
CANDIDATE_SCHEMA = "blackgold.retailer-link-candidates/v2"
HASH_FIELDS = (
    "schema", "proposal_id", "product_id", "program_id", "retailer", "network",
    "original_url", "affiliate_url", "final_destination", "last_verified_at", "country",
    "proposed_state", "verification_method", "saved_at"
)

def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8-sig"))

def host(u):
    try: return (urlparse(str(u)).hostname or "").lower()
    except Exception: return ""

def https(u):
    try: return urlparse(str(u)).scheme == "https"
    except Exception: return False

def parse_time(v):
    dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def canonical_candidate(p: dict) -> bytes:
    body = {k: p.get(k) for k in HASH_FIELDS}
    return json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def candidate_hash(p: dict) -> str:
    return hashlib.sha256(canonical_candidate(p)).hexdigest()

def atomic_json(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".bg46.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--input", default=".blackgold/inbox/retailer-link-proposals.json")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    src = (root / args.input).resolve()
    inbox = (root / ".blackgold/inbox").resolve()
    try: src.relative_to(inbox)
    except ValueError: raise SystemExit("input must stay inside .blackgold/inbox")

    stage = root / ".blackgold/staging/experience-v2.9"
    out = root / ".blackgold/commerce/retailer-link-candidates.json"
    report = root / ".blackgold/reports/retailer-proposal-import-v4.6-latest.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    R = {"schema":"blackgold.retailer-proposal-import-report/v4.6","status":"blocked",
         "accepted":[],"idempotent":[],"rejected":[],"source":str(src),"registry_modified":False}

    if not src.exists():
        R["rejected"].append({"code":"proposal_file_missing","detail":str(src)})
        atomic_json(report, R); return 2
    payload = load(src)
    if payload.get("schema") != SCHEMA or payload.get("project") != PROJECT or payload.get("market") != "US":
        R["rejected"].append({"code":"proposal_schema_mismatch"})
        atomic_json(report, R); return 2

    products = {str(x.get("id")) for x in load(stage/"data/products.json").get("products",[]) if x.get("id")}
    programs = {x["program_id"]:x for x in load(stage/"data/affiliate-programs.us.json").get("programs",[]) if x.get("program_id")}
    policy = load(stage/"retailer-policy.json")
    allowed_r = set(map(str.lower, policy.get("allowed_retailer_hosts",[])))
    allowed_a = set(map(str.lower, policy.get("allowed_affiliate_hosts",[])))
    now = datetime.now(timezone.utc)

    existing = {"schema":CANDIDATE_SCHEMA,"project":PROJECT,"market":"US","candidates":[]}
    if out.exists():
        try:
            old = load(out)
            if old.get("schema") == CANDIDATE_SCHEMA:
                existing = old
        except Exception:
            pass
    by_id = {str(x.get("proposal_id")):x for x in existing.get("candidates",[]) if x.get("proposal_id")}

    for p in payload.get("proposals",[]):
        errs=[]; pid=str(p.get("product_id","")); prog=programs.get(str(p.get("program_id","")))
        if pid not in products: errs.append("unknown_product")
        if not prog or prog.get("program_status") != "program_verified": errs.append("unverified_program")
        if p.get("proposed_state") != "candidate": errs.append("invalid_proposed_state")
        if p.get("country") != "US": errs.append("country_mismatch")
        if not https(p.get("original_url")): errs.append("original_url_https")
        if not https(p.get("affiliate_url")): errs.append("affiliate_url_https")
        if not https(p.get("final_destination")): errs.append("final_destination_https")
        if host(p.get("final_destination")) not in allowed_r: errs.append("final_destination_host_not_allowed")
        if host(p.get("affiliate_url")) not in allowed_a: errs.append("affiliate_host_not_approved")
        try:
            age=(now-parse_time(p.get("last_verified_at")).astimezone(timezone.utc)).total_seconds()/86400
            if age < 0 or age > 7: errs.append("verification_age")
        except Exception: errs.append("verification_date")
        if not str(p.get("verification_method","")).startswith("manual_exact_product"): errs.append("verification_method")
        proposal_id = str(p.get("proposal_id", ""))
        if len(proposal_id) < 8: errs.append("proposal_id")
        h = candidate_hash(p)
        prior = by_id.get(proposal_id)
        if prior:
            if prior.get("candidate_sha256") == h:
                R["idempotent"].append({"proposal_id":proposal_id,"product_id":pid,"candidate_sha256":h})
                continue
            errs.append("proposal_id_hash_collision")
        item=dict(p); item["candidate_sha256"]=h; item["imported_at"]=now.isoformat(); item["activation_state"]="candidate"
        if errs:
            R["rejected"].append({"proposal_id":proposal_id or None,"product_id":pid,"errors":errs})
        else:
            by_id[proposal_id]=item; R["accepted"].append(item)

    if R["accepted"]:
        result={"schema":CANDIDATE_SCHEMA,"project":PROJECT,"market":"US","updated_at":now.isoformat(),"candidates":list(by_id.values())}
        atomic_json(out, result)
    R["status"] = "accepted" if R["accepted"] and not R["rejected"] else ("partial" if R["accepted"] else ("idempotent" if R["idempotent"] and not R["rejected"] else "blocked"))
    R["candidate_store"] = str(out); R["registry_modified"] = False
    atomic_json(report, R)
    return 0 if (R["accepted"] or R["idempotent"]) and not R["rejected"] else 2

if __name__ == "__main__":
    raise SystemExit(main())
