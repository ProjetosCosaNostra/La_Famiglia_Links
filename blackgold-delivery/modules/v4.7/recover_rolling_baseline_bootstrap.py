from __future__ import annotations
import argparse,base64,hashlib,json,os,subprocess,sys,urllib.request
from pathlib import Path
REPO="ProjetosCosaNostra/La_Famiglia_Links"
BLOB="f01ef8b90e3bbc00bef6f930a9065a7a525440d8"
SHA256="cc0d85397ece5be62548820f5b0c5e5f841389f0dc5fbe73b28268e3f26b6b0c"
def fetch():
 u=f"https://api.github.com/repos/{REPO}/git/blobs/{BLOB}"
 q=urllib.request.Request(u,headers={"User-Agent":"BlackGold-V47-Bootstrap/1","Accept":"application/vnd.github+json"})
 with urllib.request.urlopen(q,timeout=45) as r:x=json.loads(r.read().decode("utf-8"))
 if x.get("sha")!=BLOB or x.get("encoding")!="base64":raise RuntimeError("V4.7 engine blob integrity failure")
 b=base64.b64decode(x["content"])
 if hashlib.sha256(b).hexdigest()!=SHA256:raise RuntimeError("V4.7 engine SHA-256 mismatch")
 return b
def main():
 a=argparse.ArgumentParser();a.add_argument("--root",required=True);x=a.parse_args()
 here=Path(__file__).resolve().parent;impl=here/"recover_rolling_baseline_impl.py";tmp=impl.with_suffix(".tmp")
 tmp.write_bytes(fetch());os.replace(tmp,impl)
 return subprocess.run([sys.executable,str(impl),"--root",x.root],check=False).returncode
if __name__=="__main__":raise SystemExit(main())
