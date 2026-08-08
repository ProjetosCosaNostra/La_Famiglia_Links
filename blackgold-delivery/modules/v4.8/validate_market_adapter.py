from __future__ import annotations
import argparse,json
from datetime import datetime,timezone
from pathlib import Path

PROJECT="BlackGold Beauty Finds"

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))

def check(profile,market,template):
    errors=[]
    if profile.get("schema")!="blackgold.market-profile/v1": errors.append("schema")
    if profile.get("market")!=market: errors.append("market")
    if profile.get("country")!=market: errors.append("country")
    if profile.get("commerce_default")!="deny": errors.append("commerce_default")
    if profile.get("public_site_changes") is not False: errors.append("public_site_changes")
    port=profile.get("portability",{})
    for key in ("affiliate_approvals_imported","candidate_hashes_imported","tracking_links_imported","activation_ledgers_imported"):
        if port.get(key) is not False: errors.append("cross_market:"+key)
    data=profile.get("market_data",{})
    required=("products_registry","campaigns_registry","guides_registry","retailer_registry","affiliate_program_registry","retailer_policy")
    for key in required:
        if not str(data.get(key,"")).strip(): errors.append("missing:"+key)
    if template:
        if profile.get("state")!="template_locked": errors.append("template_state")
        if port.get("requires_market_research_before_activation") is not True: errors.append("research_gate")
        if not all(str(v).startswith("MARKET_RESEARCH_REQUIRED/") for v in data.values()): errors.append("live_market_path")
    return {"market":market,"passed":not errors,"activation_ready":bool(not errors and not template),"errors":errors}

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--root",required=True);args=ap.parse_args();root=Path(args.root).resolve()
    base=root/".blackgold/portability"
    us=check(read_json(base/"market-profile.us.json"),"US",False)
    br=check(read_json(base/"market-profile.br.template.json"),"BR",True)
    contract=read_json(base/"market-adapter-contract-v4.8.json")
    contract_ok=contract.get("schema")=="blackgold.market-adapter-contract/v1" and contract.get("public_site_changes") is False
    report={"schema":"blackgold.market-adapter-report/v4.8","project":PROJECT,"checked_at":datetime.now(timezone.utc).isoformat(),"status":"pass" if us["passed"] and br["passed"] and contract_ok else "block","portable_core_ready":bool(us["passed"] and br["passed"] and contract_ok),"us_profile":us,"br_template":br,"br_activation_ready":False,"public_site_changes":False}
    out=root/".blackgold/reports/market-adapter-v4.8-latest.json";out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    return 0 if report["status"]=="pass" else 2
if __name__=="__main__":raise SystemExit(main())
