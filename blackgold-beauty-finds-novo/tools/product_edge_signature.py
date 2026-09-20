from PIL import Image
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

zones={
  "selection":(40,440,1408,635),
  "showcase":(40,660,1408,840),
}

def peaks(vals,n=24,min_gap=2):
  picked=[]
  for score,pos in sorted(vals,reverse=True):
    if all(abs(pos-p[1])>min_gap for p in picked):
      picked.append((score,pos))
      if len(picked)>=n:break
  return [{"pos":pos,"score":round(score,3)} for score,pos in picked]

def analyze(img,box):
  x0,y0,x1,y1=box
  rows=[]
  for y in range(y0+1,y1):
    total=0
    for x in range(x0,x1):
      p=img.getpixel((x,y));q=img.getpixel((x,y-1))
      total+=abs(p[0]-q[0])+abs(p[1]-q[1])+abs(p[2]-q[2])
    rows.append((total/(x1-x0),y))
  cols=[]
  for x in range(x0+1,x1):
    total=0
    for y in range(y0,y1):
      p=img.getpixel((x,y));q=img.getpixel((x-1,y))
      total+=abs(p[0]-q[0])+abs(p[1]-q[1])+abs(p[2]-q[2])
    cols.append((total/(y1-y0),x))
  return {"rowPeaks":peaks(rows),"colPeaks":peaks(cols,40)}

auth=Image.open(a.authority).convert("RGB")
cand=Image.open(a.candidate).convert("RGB")
report={"contract":"BLACKGOLD_PRODUCT_EDGE_SIGNATURE_V1","zones":{}}
for name,box in zones.items():
  report["zones"][name]={"authority":analyze(auth,box),"candidate":analyze(cand,box)}
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
