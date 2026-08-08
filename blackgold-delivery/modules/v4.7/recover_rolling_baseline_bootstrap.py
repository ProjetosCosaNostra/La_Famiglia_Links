from __future__ import annotations
import argparse,base64,hashlib,json,os,subprocess,sys,urllib.request
from pathlib import Path

REPO="ProjetosCosaNostra/La_Famiglia_Links"
ASSETS={
 "rolling-baseline-v4.7.json":("68074b28ce84475f1878fb2f6fd1c9c872afcd84","b5d7c3c41151a38f0c91efd80ca34ed317ebf0581972a09eec4802112f323000"),
 "portability-contract-v4.7.json":("669b5ba4f4a99fa9e04e2fab077dd85eb971b1ab","6b64329e185a8cc508d6f941674472072e4e331f1d49ec37a472d7b12b7d2afc"),
 "recover_rolling_baseline_impl.py":("b8d6d42c787ae59e8557aaa8c12ce5ec9be18d1c","4872ebc3bb7f19af5750e1c893e165a6040b062ac777964581affe8e7b5389c7"),
}
def fetch(blob,expected):
 u=f"https://api.github.com/repos/{REPO}/git/blobs/{blob}"
 q=urllib.request.Request(u,headers={"User-Agent":"BlackGold-V47-Bootstrap/2","Accept":"application/vnd.github+json"})
 with urllib.request.urlopen(q,timeout=45) as r:x=json.loads(r.read().decode("utf-8"))
 if x.get("sha")!=blob or x.get("encoding")!="base64":raise RuntimeError("V4.7 asset blob integrity failure")
 b=base64.b64decode(x["content"])
 if hashlib.sha256(b).hexdigest()!=expected:raise RuntimeError("V4.7 asset SHA-256 mismatch")
 return b
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+".bg47.tmp");tmp.write_bytes(data);os.replace(tmp,path)
def main():
 a=argparse.ArgumentParser();a.add_argument("--root",required=True);x=a.parse_args();root=Path(x.root).resolve();here=Path(__file__).resolve().parent
 for name,(blob,h) in ASSETS.items():
  data=fetch(blob,h)
  if name=="portability-contract-v4.7.json":target=root/".blackgold/portability"/name
  else:target=here/name
  atomic(target,data)
 impl=here/"recover_rolling_baseline_impl.py"
 return subprocess.run([sys.executable,str(impl),"--root",str(root)],check=False).returncode
if __name__=="__main__":raise SystemExit(main())
