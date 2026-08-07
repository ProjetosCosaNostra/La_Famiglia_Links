from __future__ import annotations
import argparse,json
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse

SCHEMA="blackgold.retailer-link-proposals/v1"
PROJECT="BlackGold Beauty Finds"

def load(p): return json.loads(p.read_text(encoding="utf-8-sig"))
def host(u):
    try:return (urlparse(str(u)).hostname or "").lower()
    except:return ""
def https(u):
    try:return urlparse(str(u)).scheme=="https"
    except:return False
def parse_time(v):
    return datetime.fromisoformat(str(v).replace("Z","+00:00")).astimezone(timezone.utc)
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--root",required=True)
    ap.add_argument("--input",default=".blackgold/inbox/retailer-link-proposals.json")
    args=ap.parse_args()
    root=Path(args.root).resolve(); src=(root/args.input).resolve()
    inbox=(root/".blackgold/inbox").resolve()
    try:src.relative_to(inbox)
    except:raise SystemExit("input must stay inside .blackgold/inbox")
    stage=root/".blackgold/staging/experience-v2.9"
    out=root/".blackgold/commerce/retailer-link-candidates.json"
    report=root/".blackgold/reports/retailer-proposal-import-v4.3-latest.json"
    out.parent.mkdir(parents=True,exist_ok=True);report.parent.mkdir(parents=True,exist_ok=True)
    R={"schema":"blackgold.retailer-proposal-import-report/v4.3","status":"blocked","accepted":[],"rejected":[],"source":str(src),"registry_modified":False}
    if not src.exists():
        R["rejected"].append({"code":"proposal_file_missing","detail":str(src)})
        report.write_text(json.dumps(R,indent=2),encoding="utf-8");return 2
    payload=load(src)
    if payload.get("schema")!=SCHEMA or payload.get("project")!=PROJECT or payload.get("market")!="US":
        R["rejected"].append({"code":"proposal_schema_mismatch"})
        report.write_text(json.dumps(R,indent=2),encoding="utf-8");return 2
    products={str(x.get("id")) for x in load(stage/"data/products.json").get("products",[]) if x.get("id")}
    programs={x["program_id"]:x for x in load(stage/"data/affiliate-programs.us.json").get("programs",[]) if x.get("program_id")}
    policy=load(stage/"retailer-policy.json")
    allowed_r=set(map(str.lower,policy.get("allowed_retailer_hosts",[])))
    allowed_a=set(map(str.lower,policy.get("allowed_affiliate_hosts",[])))
    now=datetime.now(timezone.utc)
    for p in payload.get("proposals",[]):
        errs=[]; pid=str(p.get("product_id","")); prog=programs.get(str(p.get("program_id","")))
        if pid not in products:errs.append("unknown_product")
        if not prog or prog.get("program_status")!="program_verified":errs.append("unverified_program")
        if p.get("proposed_state")!="candidate":errs.append("invalid_proposed_state")
        if p.get("country")!="US":errs.append("country_mismatch")
        if not https(p.get("original_url")):errs.append("original_url_https")
        if not https(p.get("affiliate_url")):errs.append("affiliate_url_https")
        if not https(p.get("final_destination")):errs.append("final_destination_https")
        if host(p.get("final_destination")) not in allowed_r:errs.append("final_destination_host_not_allowed")
        if host(p.get("affiliate_url")) not in allowed_a:errs.append("affiliate_host_not_approved")
        try:
            age=(now-parse_time(p.get("last_verified_at"))).total_seconds()/86400
            if age<0 or age>7:errs.append("verification_age")
        except:errs.append("verification_date")
        if not str(p.get("verification_method","")).startswith("manual_exact_product"):errs.append("verification_method")
        item=dict(p);item["imported_at"]=now.isoformat()
        if errs:R["rejected"].append({"proposal_id":p.get("proposal_id"),"product_id":pid,"errors":errs})
        else:R["accepted"].append(item)
    if R["accepted"]:
        existing={"schema":"blackgold.retailer-link-candidates/v1","project":PROJECT,"market":"US","candidates":[]}
        if out.exists():
            try:existing=load(out)
            except:pass
        by_id={str(x.get("proposal_id")):x for x in existing.get("candidates",[]) if x.get("proposal_id")}
        for x in R["accepted"]:by_id[str(x["proposal_id"])]=x
        result={"schema":"blackgold.retailer-link-candidates/v1","project":PROJECT,"market":"US","updated_at":now.isoformat(),"candidates":list(by_id.values())}
        tmp=out.with_suffix(".tmp");tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8");tmp.replace(out)
    R["status"]="accepted" if R["accepted"] and not R["rejected"] else ("partial" if R["accepted"] else "blocked")
    R["candidate_store"]=str(out);R["registry_modified"]=False
    report.write_text(json.dumps(R,ensure_ascii=False,indent=2),encoding="utf-8")
    return 0 if R["accepted"] else 2
if __name__=="__main__":raise SystemExit(main())
