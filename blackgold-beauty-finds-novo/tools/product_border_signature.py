from PIL import Image
from pathlib import Path
import argparse,json,math

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

zones={
  "selection":{"box":(40,440,1408,635),"target":(231,218,203)},
  "showcase":{"box":(40,660,1408,840),"target":(229,216,200)},
}
def analyze(img,box,target):
  x0,y0,x1,y1=box
  rows=[];cols=[]
  for y in range(y0,y1):
    n=0
    for x in range(x0,x1):
      p=img.getpixel((x,y))
      if sum((p[i]-target[i])**2 for i in range(3))<=36:n+=1
    rows.append((n,y))
  for x in range(x0,x1):
    n=0
    for y in range(y0,y1):
      p=img.getpixel((x,y))
      if sum((p[i]-target[i])**2 for i in range(3))<=36:n+=1
    cols.append((n,x))
  return {
    "topRows":[{"y":y,"count":n} for n,y in sorted(rows,reverse=True)[:24]],
    "topCols":[{"x":x,"count":n} for n,x in sorted(cols,reverse=True)[:40]]
  }

auth=Image.open(a.authority).convert("RGB")
cand=Image.open(a.candidate).convert("RGB")
report={"contract":"BLACKGOLD_PRODUCT_BORDER_SIGNATURE_V1","zones":{}}
for name,cfg in zones.items():
  report["zones"][name]={
    "targetRGB":cfg["target"],
    "authority":analyze(auth,cfg["box"],cfg["target"]),
    "candidate":analyze(cand,cfg["box"],cfg["target"])
  }
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
