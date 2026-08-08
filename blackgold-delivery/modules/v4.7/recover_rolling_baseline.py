from __future__ import annotations
import argparse,base64,hashlib,json,os,shutil,subprocess,sys,urllib.request
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath

PROJECT="BlackGold Beauty Finds"
def now():return datetime.now(timezone.utc).isoformat()
def sha256(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text(encoding="utf-8-sig"))
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+".bg47.tmp");tmp.write_bytes(data);os.replace(tmp,path)
def safe(root,target):
 p=PurePosixPath(target)
 if p.is_absolute() or ".." in p.parts or not p.parts or ":" in target or "\\" in target:raise RuntimeError("unsafe bundle target: "+target)
 d=(root/Path(*p.parts)).resolve();d.relative_to(root);return d
def fetch(url,expected):
 q=urllib.request.Request(url,headers={"User-Agent":"BlackGold-Rolling-Baseline/4.7"})
 with urllib.request.urlopen(q,timeout=60) as r:b=r.read()
 actual=sha256(b)
 if actual!=expected:raise RuntimeError(f"release sha mismatch: {url}: {actual}")
 return b
def apply_bundle(root,release):
 raw=fetch(release["url"],release["sha256"]);b=json.loads(raw.decode("utf-8-sig"))
 if b.get("schema")!="blackgold.remote-bundle/v1" or b.get("project")!=PROJECT:raise RuntimeError("bundle contract blocked: "+release["release_id"])
 if b.get("public_site_changes") is not False:raise RuntimeError("public bundle blocked: "+release["release_id"])
 installed=[]
 for f in b.get("files",[]):
  target=str(f.get("target",""));enc=f.get("encoding")
  if enc=="base64":data=base64.b64decode(f.get("content",""),validate=True)
  elif enc=="utf-8":data=str(f.get("content","")).encode("utf-8")
  else:raise RuntimeError("unsupported encoding: "+str(enc))
  actual=sha256(data)
  if actual!=f.get("sha256"):raise RuntimeError("file sha mismatch: "+target)
  atomic(safe(root,target),data);installed.append(target)
 for target in b.get("delete",[]):
  p=safe(root,str(target))
  if p.exists():
   shutil.rmtree(p) if p.is_dir() else p.unlink()
 return installed
def restore_orchestrator(root,here):
 src=here/"orchestrator_v47.py"
 if not src.exists():raise RuntimeError("V4.7 orchestrator source missing")
 atomic(root/"tools/blackgold_orchestrator/blackgold_orchestrator.py",src.read_bytes())
def verified_routes(stage):
 p=stage/"data/retailer-links.json"
 if not p.exists():return []
 try:reg=load(p)
 except Exception:return []
 return [x for x in reg.get("links",[]) if isinstance(x,dict) and x.get("public_state")=="verified"]
def verify(root,m):
 stage=root/m["target_stage"];missing=[x for x in m["required_stage_files"] if not(stage/x).exists()]
 missing += [x for x in m["required_tools"] if not(root/x).exists()]
 if missing:raise RuntimeError("generation-32 baseline missing: "+", ".join(missing))
 reg=load(stage/"data/retailer-links.json")
 if reg.get("default")!="deny":raise RuntimeError("commercial registry must remain default-deny")
 act=load(stage/"data/affiliate-activation-policy.json")
 if act.get("schema")!="blackgold.affiliate-activation-policy/v4.6" or act.get("default")!="deny":raise RuntimeError("activation policy mismatch")
 gate=load(root/"tools/blackgold_release_gate_v42/release-gate-policy.json");c=gate.get("affiliate_activation_contract",{})
 if c.get("candidate_hash_binding_required") is not True or c.get("approval_replay_allowed") is not False:raise RuntimeError("release gate lacks V4.6 anti-replay contract")
 orch=(root/"tools/blackgold_orchestrator/blackgold_orchestrator.py").read_text(encoding="utf-8")
 for action in ("experience.import_affiliate_candidates","experience.promote_affiliate_candidate"):
  if action not in orch:raise RuntimeError("orchestrator action missing: "+action)
 node=shutil.which("node");checked=0
 if node:
  for p in sorted(stage.rglob("*.js")):
   r=subprocess.run([node,"--check",str(p)],capture_output=True,text=True,timeout=60,check=False)
   if r.returncode:raise RuntimeError("javascript syntax failed: "+str(p.relative_to(stage)))
   checked+=1
 return {"required_files":len(m["required_stage_files"]),"required_tools":len(m["required_tools"]),"verified_routes":len(verified_routes(stage)),"commercial_default":"deny","javascript_checked":checked,"node_available":bool(node)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--root",required=True);a=ap.parse_args();root=Path(a.root).resolve();here=Path(__file__).resolve().parent
 m=load(here/"rolling-baseline-v4.7.json")
 if m.get("schema")!="blackgold.rolling-baseline/v4.7" or m.get("project")!=PROJECT:raise SystemExit("V4.7 manifest blocked")
 stage=root/m["target_stage"];report=root/".blackgold/reports/rolling-baseline-v4.7-latest.json";state=root/".blackgold/state/rolling-baseline-v4.7.json"
 report.parent.mkdir(parents=True,exist_ok=True);state.parent.mkdir(parents=True,exist_ok=True)
 R={"schema":"blackgold.rolling-baseline-report/v4.7","project":PROJECT,"started_at":now(),"status":"running","baseline_generation":32,"public_site_changes":False,"page_opened":False,"installed":[]}
 try:
  current=verify(root,m);R["status"]="already_current";R["verification"]=current;R["completed_at"]=now()
  atomic(report,json.dumps(R,ensure_ascii=False,indent=2).encode())
  atomic(state,json.dumps({"schema":"blackgold.rolling-baseline-state/v4.7","project":PROJECT,"generation":32,"status":"current","verified_routes":current["verified_routes"],"commercial_default":"deny","verified_at":R["completed_at"]},ensure_ascii=False,indent=2).encode());return 0
 except Exception as e:R["precheck"]=str(e)
 if stage.exists() and verified_routes(stage):
  R["status"]="blocked";R["error"]="verified commercial routes exist; automatic baseline rebuild refuses to overwrite them";R["blocked_at"]=now();atomic(report,json.dumps(R,ensure_ascii=False,indent=2).encode());return 2
 stamp=datetime.now().strftime("%Y%m%d_%H%M%S");backup=root/".blackgold/backups"/f"rolling-baseline-v4.7-{stamp}";stage_existed=stage.exists()
 try:
  if stage_existed:
   backup.mkdir(parents=True,exist_ok=True);shutil.copytree(stage,backup/"experience-v2.9");R["backup"]=str(backup)
  for rel in m["foundation_releases"]:R["installed"]+=apply_bundle(root,rel)
  base_tool=root/"tools/blackgold_rolling_baseline_v44/recover_rolling_baseline.py"
  if not base_tool.exists():raise RuntimeError("V4.4 recovery tool missing after foundation install")
  p=subprocess.run([sys.executable,str(base_tool),"--root",str(root)],cwd=root,capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=2100,check=False)
  R["v44_recovery"]={"exit_code":p.returncode,"stdout":p.stdout[-8000:],"stderr":p.stderr[-8000:]}
  if p.returncode:raise RuntimeError("V4.4 reconstruction failed")
  for rel in m["overlay_releases"]:R["installed"]+=apply_bundle(root,rel)
  restore_orchestrator(root,here)
  v=verify(root,m);R["verification"]=v;R["status"]="installed";R["completed_at"]=now()
  atomic(report,json.dumps(R,ensure_ascii=False,indent=2).encode())
  atomic(state,json.dumps({"schema":"blackgold.rolling-baseline-state/v4.7","project":PROJECT,"generation":32,"status":"current","verified_routes":v["verified_routes"],"commercial_default":"deny","installed_at":R["completed_at"]},ensure_ascii=False,indent=2).encode());return 0
 except Exception as e:
  R["status"]="failed";R["error"]=str(e);R["failed_at"]=now()
  try:
   if stage.exists():shutil.rmtree(stage)
   if stage_existed and (backup/"experience-v2.9").exists():shutil.copytree(backup/"experience-v2.9",stage)
   restore_orchestrator(root,here)
   R["rollback"]="completed"
  except Exception as rb:R["rollback"]="failed";R["rollback_error"]=str(rb)
  atomic(report,json.dumps(R,ensure_ascii=False,indent=2).encode());return 1
if __name__=="__main__":raise SystemExit(main())
