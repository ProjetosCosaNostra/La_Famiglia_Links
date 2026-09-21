from PIL import Image,ImageChops,ImageStat
from pathlib import Path
import argparse,json,math

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--report",required=True)
ap.add_argument("--radius",type=int,default=12)
a=ap.parse_args()

zones={
  "selection":(60,476,1388,633),
  "showcase":(60,698,1388,842),
}
auth=Image.open(a.authority).convert("RGB")
cand=Image.open(a.candidate).convert("RGB")
if auth.size!=cand.size: raise SystemExit("size mismatch")

def mae(im1,im2):
    d=ImageChops.difference(im1,im2)
    return sum(ImageStat.Stat(d).mean)/3/255

report={"contract":"BLACKGOLD_PRODUCT_ALIGNMENT_SEARCH_V1","radius":a.radius,"zones":{}}
for name,(x0,y0,x1,y1) in zones.items():
    baseline=mae(auth.crop((x0,y0,x1,y1)),cand.crop((x0,y0,x1,y1)))
    best={"dx":0,"dy":0,"mae":baseline}
    for dy in range(-a.radius,a.radius+1):
      for dx in range(-a.radius,a.radius+1):
        ax0=x0+max(0,dx); ay0=y0+max(0,dy)
        ax1=x1+min(0,dx); ay1=y1+min(0,dy)
        cx0=x0+max(0,-dx); cy0=y0+max(0,-dy)
        cx1=x1+min(0,-dx); cy1=y1+min(0,-dy)
        if ax1<=ax0 or ay1<=ay0: continue
        m=mae(auth.crop((ax0,ay0,ax1,ay1)),cand.crop((cx0,cy0,cx1,cy1)))
        if m<best["mae"]: best={"dx":dx,"dy":dy,"mae":m}
    # coarse mean color for style/background diagnosis
    ast=ImageStat.Stat(auth.crop((x0,y0,x1,y1))).mean
    cst=ImageStat.Stat(cand.crop((x0,y0,x1,y1))).mean
    report["zones"][name]={
      "baselineMae":baseline,
      "bestTranslation":best,
      "maeImprovement":baseline-best["mae"],
      "authorityMeanRGB":[round(v,2) for v in ast],
      "candidateMeanRGB":[round(v,2) for v in cst],
      "meanRgbDelta":[round(cst[i]-ast[i],2) for i in range(3)]
    }

Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
