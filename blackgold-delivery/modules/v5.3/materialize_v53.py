from __future__ import annotations
import argparse,base64,json,os,re,urllib.request
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
LAYERS={
"visual-v5.css":[("c3497e78e15a48231163487f860afd791ea7f114",9362,b"\n/* BG_V51_LAYER */\n"),("9c69628b0dc9198f34acd2cc4accf2eee90b5579",6149,b"\n/* BG_V52_LAYER */\n")],
"visual-v5.js":[("b2b1ee39c7cc06039f30b536688b2e315ea991b8",8720,b"\n/* BG_V51_LAYER */\n"),("7c51b2b5a1d2bd8cf2fbb4b0f8873fe3508e8957",9599,b"\n/* BG_V52_LAYER */\n")],
}
TRUST_ASSETS={
"trust-v5.3.css":("ec4ef2e79ac1e82b8d3ac8c6b8597d7bdb2108bf",7095),
"trust-v5.3.js":("947a6d678ced7b182b47affa6dc08d1d049d4b6b",3361),
}
TRUST_PAGES={
"methodology.html":("2b6d2eefbfcfb562cca947a3862b8b4b124135e1",3820,"methodology"),
"affiliate-disclosure.html":("8445b715c2949a766b602bdd68b3d750c41d3419",3311,"disclosure"),
"privacy.html":("ccb3f8afbd8b2e33cfaf25205b39caf22dbf4b6b",3782,"privacy"),
"terms.html":("51f60d7e4ff1c377d3ef9fb906045518be64c05c",3828,"terms"),
"corrections.html":("e78b02e64b8eb808b2415978be147ea153690989",3573,"corrections"),
"ecosystem.html":("efa1b793d417a9b437e052b4ff7fbcd73d9758af",3308,"ecosystem"),
"404.html":("38de83bec9e2ee16ae541586e32ab46e95a54cc7",987,"404"),
}
LEDGER='''<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Research Ledger | BlackGold</title><link rel="stylesheet" href="visual-v5.css"><link rel="stylesheet" href="trust-v5.3.css"></head><body data-page="ledger"><div class="top-note">Independent research · visible source dates · US Edition</div><header class="site-header"><a class="brand" href="index.html"><span class="crest">BG</span><span class="brand-copy"><strong>BLACKGOLD</strong><small>Beauty Finds · US Edition</small></span></a><nav class="nav"><a href="products.html">Beauty Index</a><a href="guide.html">Buying Guides</a><a href="research-ledger.html">Research Ledger</a><a href="methodology.html">Methodology</a></nav></header><main id="main" class="ledger-page"><section class="ledger-hero"><p class="kicker">RESEARCH LEDGER</p><h1>Every source, with its date attached.</h1><p class="lede">See the current product, publisher, source type, retailer observed and verification date in one place.</p></section><section class="ledger-tools"><label for="ledgerSearch">Search the ledger</label><input id="ledgerSearch" type="search" placeholder="Product, brand, retailer or category…"><div id="ledgerSummary" class="catalog-meta">Loading research records…</div></section><section id="ledgerGrid" class="ledger-grid" aria-live="polite"></section></main><footer class="footer editorial-shell"><div><span class="crest small">BG</span><p>BlackGold Beauty Finds · US Edition</p></div><nav><a href="affiliate-disclosure.html">Disclosure</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="corrections.html">Corrections</a></nav><p>Source-dated research ledger</p></footer><script src="visual-v5.js"></script><script src="trust-v5.3.js"></script></body></html>'''
def fetch(blob,size):
 u=f"https://api.github.com/repos/{REPO}/git/blobs/{blob}"
 q=urllib.request.Request(u,headers={"User-Agent":"BlackGold-Visual-V53/2","Accept":"application/vnd.github+json"})
 with urllib.request.urlopen(q,timeout=45) as r:x=json.loads(r.read().decode("utf-8"))
 if x.get("sha")!=blob or x.get("encoding")!="base64":raise RuntimeError("V5.3 blob integrity failure")
 b=base64.b64decode(x["content"])
 if len(b)!=size:raise RuntimeError("V5.3 blob size mismatch")
 return b
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+".bg53.tmp");tmp.write_bytes(data);os.replace(tmp,path)
def bridge_html(data,page):
 s=data.decode("utf-8")
 s=re.sub(r'<link rel="stylesheet"[^>]*>','',s)
 s=re.sub(r'<script[^>]*src="(?:app|methodology-v3\.8)\.js"[^>]*></script>','',s)
 s=s.replace("</head>",'<link rel="stylesheet" href="visual-v5.css"><link rel="stylesheet" href="trust-v5.3.css"></head>')
 s=re.sub(r'<body([^>]*)>',lambda m:f'<body data-page="{page}"{m.group(1)}>' if "data-page=" not in m.group(0) else m.group(0),s,count=1)
 s=s.replace("</body>",'<script src="visual-v5.js"></script><script src="trust-v5.3.js"></script></body>')
 return s.encode("utf-8")
def main():
 a=argparse.ArgumentParser();a.add_argument("--root",required=True);x=a.parse_args();root=Path(x.root).resolve();stage=root/".blackgold/staging/experience-v2.9"
 required=["data/products.json","data/guides.json","data/retailer-links.json"]
 missing=[p for p in required if not (stage/p).exists()]
 if missing:raise SystemExit("V5.3 dependencies missing: "+", ".join(missing))
 for name,(blob,size) in BASE.items():
  data=fetch(blob,size)
  for pblob,psize,marker in LAYERS.get(name,[]):data+=marker+fetch(pblob,psize)
  atomic(stage/name,data)
 for name,(blob,size) in TRUST_ASSETS.items():atomic(stage/name,fetch(blob,size))
 for name,(blob,size,page) in TRUST_PAGES.items():atomic(stage/name,bridge_html(fetch(blob,size),page))
 atomic(stage/"research-ledger.html",LEDGER.encode("utf-8"))
 return 0
if __name__=="__main__":raise SystemExit(main())