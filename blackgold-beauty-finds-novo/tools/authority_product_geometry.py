from PIL import Image,ImageChops
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--approved",required=True)
ap.add_argument("--zero",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

approved=Image.open(a.approved).convert("RGB")
zero=Image.open(a.zero).convert("RGB")
if approved.size!=zero.size:
    raise SystemExit(f"size mismatch {approved.size} != {zero.size}")

diff=ImageChops.difference(approved,zero)
w,h=approved.size
row_counts=[]
for y in range(h):
    n=sum(1 for x in range(w) if diff.getpixel((x,y))!=(0,0,0))
    row_counts.append(n)

def runs(vals,threshold):
    out=[];start=None
    for i,v in enumerate(vals+[0]):
        if v>=threshold and start is None:start=i
        elif v<threshold and start is not None:
            out.append((start,i-1,max(vals[start:i]),sum(vals[start:i])))
            start=None
    return out

yruns=runs(row_counts,20)
zones=[]
for y0,y1,maxrow,total in yruns:
    col=[0]*w
    for y in range(y0,y1+1):
        for x in range(w):
            if diff.getpixel((x,y))!=(0,0,0): col[x]+=1
    xruns=runs(col,3)
    zones.append({
        "y":[y0,y1],
        "height":y1-y0+1,
        "maxChangedPixelsPerRow":maxrow,
        "totalChangedPixels":total,
        "xRuns":[{"x":[x0,x1],"width":x1-x0+1,"maxChangedRows":mx,"totalChangedPixels":tot} for x0,x1,mx,tot in xruns]
    })

report={
    "contract":"BLACKGOLD_APPROVED_TO_ZERO_PRODUCT_GEOMETRY_V1",
    "size":[w,h],
    "diffBBox":diff.getbbox(),
    "yRuns":zones
}
Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
