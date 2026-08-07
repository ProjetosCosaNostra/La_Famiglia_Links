from __future__ import annotations
import argparse,base64,hashlib,json,os,re,subprocess,sys,urllib.request
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse

PROJECT="BlackGold Beauty Finds"; REPO="ProjetosCosaNostra/La_Famiglia_Links"
BOOT={"baseline-v4.1.json":("db5a47c291ea526e1aa8de7cae6ad624927436d9","66f82d8c3702cdc18d128b9af96c7d437620f316b85169ea44311dcd9dc2bb93"),
"recover_baseline.py":("9c1d1bc4c37d6d982d0b05c413cfa7c28b505ebe","fafc7f9ebec1015c23b9a71bbc880667b02c8ad5cb1304a300fa1d0dbc1df193")}
def now():return datetime.now(timezone.utc).isoformat()
def sha(b):return hashlib.sha256(b).hexdigest()
def js(p):return json.loads(p.read_text(encoding="utf-8-sig"))
def blob(s):
 u=f"https://api.github.com/repos/{REPO}/git/blobs/{s}"
 q=urllib.request.Request(u,headers={"User-Agent":"BlackGold-Release-Gate/4.2","Accept":"application/vnd.github+json"})
 with urllib.request.urlopen(q,timeout=45) as r:x=json.loads(r.read().decode())
 if x.get("sha")!=s or x.get("encoding")!="base64":raise RuntimeError("bootstrap blob integrity failure")
 return base64.b64decode(x["content"])
def bootstrap(root,required,R):
 stage=root/".blackgold/staging/experience-v2.9"; missing=[x for x in required if not(stage/x).exists()]
 R["checks"].append({"name":"baseline_presence","passed":not missing,"missing":missing})
 if not missing:return
 d=root/"tools/blackgold_baseline_v41";d.mkdir(parents=True,exist_ok=True)
 for n,(s,h) in BOOT.items():
  b=blob(s)
  if sha(b)!=h:raise RuntimeError("bootstrap sha mismatch: "+n)
  t=d/(n+".tmp");t.write_bytes(b);os.replace(t,d/n)
 p=subprocess.run([sys.executable,str(d/"recover_baseline.py"),"--root",str(root)],cwd=root,capture_output=True,text=True,timeout=1800)
 R["baseline_recovery"]={"attempted":True,"exit_code":p.returncode,"stderr":p.stderr[-6000:]}
 if p.returncode:raise RuntimeError("baseline recovery failed")
def bad(R,code,detail,path=None):
 x={"code":code,"detail":detail}
 if path:x["path"]=str(path)
 R["blockers"].append(x)
def warn(R,code,detail):R["warnings"].append({"code":code,"detail":detail})
def audit(root,policy,R):
 stage=root/policy["stage"]
 for rel in policy["required_files"]:
  if not(stage/rel).exists():bad(R,"missing_required_file","Required file missing: "+rel,rel)
 tracker=[x.lower() for x in policy["forbidden_tracker_tokens"]]
 for p in sorted(stage.rglob("*")):
  if not p.is_file() or p.suffix.lower() not in {".html",".js",".css",".json"}:continue
  text=p.read_text(encoding="utf-8",errors="replace"); low=text.lower(); rel=p.relative_to(stage)
  for t in tracker:
   if t in low:bad(R,"external_tracker_detected","Forbidden tracker: "+t,rel)
  if p.suffix.lower()==".html":
   if 'lang="en-us"' not in low:bad(R,"html_language_contract",'Missing lang="en-US".',rel)
   if 'name="viewport"' not in low:bad(R,"viewport_missing","Viewport meta missing.",rel)
   if "noindex" not in low:bad(R,"staging_indexable","Staging page missing noindex.",rel)
   for m in re.finditer(r'<a\b[^>]*target=["\']_blank["\'][^>]*>',text,re.I):
    if "noopener" not in m.group(0).lower():bad(R,"unsafe_blank_target","target=_blank missing noopener.",rel)
   for m in re.finditer(r'\b(?:href|src)=["\']([^"\']+)["\']',text,re.I):
    ref=m.group(1).strip()
    if not ref or ref.startswith(("#","mailto:","tel:","data:","javascript:","http://","https://")):continue
    clean=ref.split("#",1)[0].split("?",1)[0]
    if not clean:continue
    dest=(p.parent/clean).resolve()
    try:dest.relative_to(stage.resolve())
    except Exception:bad(R,"path_escape_reference","Reference escapes staging: "+ref,rel);continue
    if not dest.exists():bad(R,"broken_local_reference","Missing local target: "+ref,rel)
 for rel,terms in policy["required_legal_terms"].items():
  p=stage/rel
  if p.exists():
   low=p.read_text(encoding="utf-8",errors="replace").lower()
   for t in terms:
    if t.lower() not in low:bad(R,"legal_contract_missing",f"{rel} missing marker: {t}",rel)
 products=js(stage/"data/products.json").get("products",[])
 ids=[str(x.get("id","")) for x in products]; valid={x for x in ids if x}
 if len(products)<8:bad(R,"catalog_too_small",f"Expected >=8 product records; found {len(products)}.")
 if "" in ids or len(ids)!=len(set(ids)):bad(R,"product_id_integrity","Product IDs must be non-empty and unique.")
 campaigns=js(stage/"data/campaigns.json").get("campaigns",[])
 for c in campaigns:
  if str(c.get("product_id","")) not in valid:bad(R,"campaign_product_integrity","Campaign references unknown product: "+str(c.get("campaign_id","?")))
 guides=js(stage/"data/guides.json").get("guides",[])
 for g in guides:
  for pid in g.get("product_ids",[]) or []:
   if str(pid) not in valid:bad(R,"guide_product_integrity",f"{g.get('id','?')} references unknown product {pid}")
 reg=js(stage/"data/retailer-links.json"); pol=js(stage/"retailer-policy.json")
 if pol.get("default")!="deny":bad(R,"commercial_default_not_deny","Retailer policy must be default-deny.")
 links={str(x.get("product_id","")):x for x in reg.get("links",[]) if isinstance(x,dict)}
 verified=[]
 for p in products:
  rec=links.get(str(p.get("id","")))
  if p.get("affiliate_ready") and not(rec and rec.get("public_state")=="verified"):bad(R,"affiliate_state_mismatch","affiliate_ready without verified route: "+str(p.get("id")))
  if rec and rec.get("public_state")=="verified":verified.append(rec)
 allowed_r={str(x).lower() for x in pol.get("allowed_retailer_hosts",[])};allowed_a={str(x).lower() for x in pol.get("allowed_affiliate_hosts",[])}
 age_max=int(pol.get("max_verification_age_days",14));nowdt=datetime.now(timezone.utc)
 for r in verified:
  reasons=[];a=str(r.get("affiliate_url",""));f=str(r.get("final_destination",""))
  au,fu=urlparse(a),urlparse(f)
  if au.scheme!="https" or (au.hostname or "").lower() not in allowed_a:reasons.append("affiliate_url")
  if fu.scheme!="https" or (fu.hostname or "").lower() not in allowed_r:reasons.append("final_destination")
  try:
   st=int(r.get("http_status"))
   if st<200 or st>=400:reasons.append("http_status")
  except:reasons.append("http_status")
  try:
   dt=datetime.fromisoformat(str(r.get("last_verified_at")).replace("Z","+00:00"));dt=dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
   d=(nowdt-dt.astimezone(timezone.utc)).days
   if d<0 or d>age_max:reasons.append("verification_age")
  except:reasons.append("last_verified_at")
  if reasons:bad(R,"verified_route_failed_policy",f"{r.get('product_id','?')}: "+",".join(reasons))
 R["inventory"]={"products":len(products),"campaigns":len(campaigns),"guides":len(guides),"verified_routes":len(verified)}
 R["monetization_ready"]=bool(verified) and not any(x["code"]=="verified_route_failed_policy" for x in R["blockers"])
 if not verified:warn(R,"no_verified_affiliate_routes","Technical release may pass, but monetization stays locked with zero verified routes.")
 guard=root/"tools/blackgold_guard/blackgold_guard.py"
 if guard.exists():
  p=subprocess.run([sys.executable,str(guard),"--root",str(root)],cwd=root,capture_output=True,text=True,timeout=300)
  R["guard"]={"exit_code":p.returncode,"stderr":p.stderr[-5000:]}
  if p.returncode:bad(R,"guard_blocked","BlackGold Guard returned a blocking exit code.")
 else:warn(R,"guard_not_invoked","Guard entrypoint not found; internal release checks still ran.")
def main():
 a=argparse.ArgumentParser();a.add_argument("--root",required=True);x=a.parse_args();root=Path(x.root).resolve()
 tool=root/"tools/blackgold_release_gate_v42";policy=js(tool/"release-gate-policy.json")
 R={"schema":"blackgold.release-gate-report/v4.2","project":PROJECT,"created_at":now(),"status":"blocked","checks":[],"blockers":[],"warnings":[],"monetization_ready":False,"public_site_changes":False,"page_opened":False}
 out=root/".blackgold/reports/release-gate-v4.2-latest.json";state=root/".blackgold/state/release-candidate-v4.2.json";out.parent.mkdir(parents=True,exist_ok=True);state.parent.mkdir(parents=True,exist_ok=True)
 try:bootstrap(root,policy["required_files"],R);audit(root,policy,R);R["status"]="ready" if not R["blockers"] else "blocked"
 except Exception as e:bad(R,"release_gate_exception",str(e))
 out.write_text(json.dumps(R,ensure_ascii=False,indent=2),encoding="utf-8")
 S={"schema":"blackgold.release-candidate-state/v4.2","evaluated_at":now(),"technical_release_ready":R["status"]=="ready","monetization_ready":R["monetization_ready"],"blocker_count":len(R["blockers"]),"warning_count":len(R["warnings"]),"report":str(out)}
 state.write_text(json.dumps(S,ensure_ascii=False,indent=2),encoding="utf-8")
 print(json.dumps({"status":R["status"],"monetization_ready":R["monetization_ready"],"blockers":len(R["blockers"]),"warnings":len(R["warnings"]),"report":str(out)}))
 return 0 if R["status"]=="ready" else 2
if __name__=="__main__":raise SystemExit(main())
