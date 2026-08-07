from __future__ import annotations
import argparse,base64,hashlib,json,subprocess,sys,urllib.request
from pathlib import Path

REPO="ProjetosCosaNostra/La_Famiglia_Links"
BLOB="9d99e6d467aa5baa5f6c5c07a9227b7d76404096"
SHA256="f038ddd125a084f4718c8076934d8f912047890f480357c39f4f90f8bae2a166"

def fetch():
    url=f"https://api.github.com/repos/{REPO}/git/blobs/{BLOB}"
    req=urllib.request.Request(url,headers={"User-Agent":"BlackGold-Rolling-Baseline-Bootstrap/4.4","Accept":"application/vnd.github+json"})
    with urllib.request.urlopen(req,timeout=45) as r:
        x=json.loads(r.read().decode("utf-8"))
    if x.get("sha")!=BLOB or x.get("encoding")!="base64":
        raise RuntimeError("rolling baseline blob integrity failure")
    b=base64.b64decode(x["content"])
    if hashlib.sha256(b).hexdigest()!=SHA256:
        raise RuntimeError("rolling baseline sha256 mismatch")
    return b

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--root",required=True);args=ap.parse_args()
    impl=Path(__file__).with_name("recover_rolling_baseline_impl.py")
    tmp=impl.with_suffix(".tmp");tmp.write_bytes(fetch());tmp.replace(impl)
    return subprocess.run([sys.executable,str(impl),"--root",args.root],check=False).returncode

if __name__=="__main__":
    raise SystemExit(main())
