from __future__ import annotations
import argparse,base64,json,os,subprocess,sys,urllib.request
from pathlib import Path
REPO='ProjetosCosaNostra/La_Famiglia_Links'
V53=('22e7ddabb6a1ca86e60c90b062b884544f29cdaf',5742)
FILES={
 'campaign-index.html':('97cbe6feb3f04ea842169595f931e69f9a382fe5',3060),
 'campaign.html':('9710ff38a05d7c3bcfcedcb56efed7d0704eb89d',1564),
 'campaign-v5.4.css':('358755cfa7503bcfac8fa83de189f4994473643d',7478),
 'campaign-v5.4.js':('9f4fcd35e8fca9905b200dcc4d13504d46637fe0',7482),
}
def fetch(blob,size):
 u=f'https://api.github.com/repos/{REPO}/git/blobs/{blob}'
 q=urllib.request.Request(u,headers={'User-Agent':'BlackGold-Visual-V54/1','Accept':'application/vnd.github+json'})
 with urllib.request.urlopen(q,timeout=45) as r:x=json.loads(r.read().decode('utf-8'))
 if x.get('sha')!=blob or x.get('encoding')!='base64':raise RuntimeError('V5.4 blob integrity failure')
 b=base64.b64decode(x['content'])
 if len(b)!=size:raise RuntimeError('V5.4 blob size mismatch')
 return b
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+'.bg54.tmp');tmp.write_bytes(data);os.replace(tmp,path)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--root',required=True);a=ap.parse_args();root=Path(a.root).resolve();stage=root/'.blackgold/staging/experience-v2.9'
 base=root/'.blackgold/temp/materialize_v53.py';atomic(base,fetch(*V53))
 p=subprocess.run([sys.executable,str(base),'--root',str(root)],cwd=root,check=False)
 if p.returncode:raise SystemExit(p.returncode)
 required=['data/products.json','data/campaigns.json','data/retailer-links.json']
 missing=[x for x in required if not (stage/x).exists()]
 if missing:raise SystemExit('V5.4 dependencies missing: '+', '.join(missing))
 for name,spec in FILES.items():atomic(stage/name,fetch(*spec))
 return 0
if __name__=='__main__':raise SystemExit(main())
