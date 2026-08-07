from __future__ import annotations
import argparse,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
def now():return datetime.now(timezone.utc).isoformat()
def rd(p,d=None):
    try:return json.loads(p.read_text(encoding="utf-8-sig"))
    except:return d
def wr(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding="utf-8")
def main():
    a=argparse.ArgumentParser();a.add_argument("--root",required=True);x=a.parse_args();r=Path(x.root).resolve();m=r/".blackgold/memory";rp=r/".blackgold/reports"
    genome=rd(m/"design-genome-rules.json",{}) or {};lab=rd(rp/"experience-lab-v2-latest.json",{}) or {};evo=rd(rp/"evolution-v2.1-latest.json",{}) or {}
    inv=[
        {"id":"truth-visible","rule":"No fabricated testing, urgency, discounts, expert claims or guaranteed results."},
        {"id":"limitations-visible","rule":"Known limitations and unknowns remain visible where recommendations are made."},
        {"id":"public-lock","rule":"No autonomous publication to the public site."},
        {"id":"review-lock","rule":"No page opening during construction; visual review only after a completed stage."},
        {"id":"light-feminine-premium","rule":"Primary visual direction stays light, feminine and premium; large dark masses cannot dominate the page."},
        {"id":"anti-template","rule":"Repeated card grids, excessive pills and generic template composition cannot dominate the experience."},
        {"id":"mobile-parity","rule":"Mobile preserves hierarchy, clarity and conversion intent."},
        {"id":"decision-first","rule":"Commercial journeys start from shopper intent or question, not a generic product wall."}
    ]
    for item in genome.get("rules",[]):
        if item.get("status")=="blocking":
            inv.append({"id":"genome-"+str(item.get("fingerprint","unknown")),"rule":item.get("message") or item.get("class") or "Repeated design failure"})
    c={"schema":"blackgold.quality-constitution/v1","project":"BlackGold Beauty Finds","generated_at":now(),"policy":"deny_on_violation","amendment_policy":"explicit_human_approval_required","invariants":inv,"evidence":{"lab_report_present":bool(lab),"evolution_report_present":bool(evo),"genome_rules":len(genome.get("rules",[]))},"public_site_changes":False,"page_opened":False}
    digest=hashlib.sha256(json.dumps(c,sort_keys=True,ensure_ascii=False).encode()).hexdigest();c["constitution_sha256"]=digest
    wr(r/"data/governance/quality-constitution.v1.json",c)
    wr(rp/"quality-constitution-v2.3-latest.json",{"schema":"blackgold.quality-constitution-report/v1","generated_at":now(),"status":"passed","invariants":len(inv),"constitution_sha256":digest,"public_site_changes":False,"page_opened":False})
    print(json.dumps({"status":"passed","invariants":len(inv),"sha256":digest}));return 0
if __name__=="__main__":raise SystemExit(main())
