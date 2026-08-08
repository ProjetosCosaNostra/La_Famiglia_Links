from __future__ import annotations
import argparse,base64,json,os,urllib.request
from pathlib import Path
REPO="ProjetosCosaNostra/La_Famiglia_Links"
BASE={
"index.html":("4f1160848a67c6594aec22bb3f38edec73ae7b3d",3806),
"products.html":("d64edbb7fd79d315d3646d477f8935419d16dd22",1600),
"product.html":("56ff0dad66d86910847a2da1dbfffdf7d145e3e4",1062),
"compare.html":("933f2ae6117d12a59a1777d28086b127a91425f6",1331),
"guide.html":("4b81b73f6d36416082c625ec0046226231928330",1311),
"guide-detail.html":("e0239791bdc68610c3e1e3b4d08089d4fc28fb41",1061),
"visual-v5.css":("f226681460e250b84bb2d66c1136dd811518d2b5",10553),
"visual-v5.js":("1f717ee99838a5f90ba0486a4bce80d8241d5c6b",8571),
}
PATCH={
"visual-v5.css":("c3497e78e15a48231163487f860afd791ea7f114",9362),
"visual-v5.js":("b2b1ee39c7cc06039f30b536688b2e315ea991b8",8720),
}
def fetch(blob,size):
 u=f"https://api.github.com/repos/{REPO}/git/blobs/{blob}"
 q=urllib.request.Request(u,headers={"User-Agent":"BlackGold-Visual-V51/1","Accept":"application/vnd.github+json"})
 with urllib.request.urlopen(q,timeout=45) as r:x=json.loads(r.read().decode("utf-8"))
 if x.get("sha")!=blob or x.get("encoding")!="base64":raise RuntimeError("V5.1 blob integrity failure")
 b=base64.b64decode(x["content"])
 if len(b)!=size:raise RuntimeError("V5.1 blob size mismatch")
 return b
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+".bg51.tmp");tmp.write_bytes(data);os.replace(tmp,path)
def main():
 a=argparse.ArgumentParser();a.add_argument("--root",required=True);x=a.parse_args();root=Path(x.root).resolve();stage=root/".blackgold/staging/experience-v2.9"
 required=["data/products.json","data/guides.json","data/retailer-links.json"]
 missing=[p for p in required if not (stage/p).exists()]
 if missing:raise SystemExit("V5.1 dependencies missing: "+", ".join(missing))
 for name,(blob,size) in BASE.items():
  data=fetch(blob,size)
  if name in PATCH:
   pblob,psize=PATCH[name];patch=fetch(pblob,psize)
   marker=b"\n/* BG_V51_LAYER */\n"
   data=data+marker+patch
  atomic(stage/name,data)
 return 0
if __name__=="__main__":raise SystemExit(main())
