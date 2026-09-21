from PIL import Image,ImageChops,ImageStat,ImageDraw
from pathlib import Path
import argparse,json

PROFILES={
 "desktop":{
   "size":(1448,1086),
   "allowed":[(108,323,205,382),(60,458,1388,619),(60,676,1388,830)]
 },
 "mobile":{
   "size":(390,1152),
   "allowed":[(40,364,140,430),(12,489,390,628),(12,708,390,866)]
 },
}
ap=argparse.ArgumentParser()
ap.add_argument("--profile",choices=PROFILES,required=True)
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args();p=PROFILES[a.profile]
x=Image.open(a.authority).convert("RGB");y=Image.open(a.candidate).convert("RGB")
errors=[]
if x.size!=p["size"] or y.size!=p["size"]:
    errors.append(f"size mismatch authority={x.size} candidate={y.size} expected={p['size']}")
if errors:
    mismatch=-1;mae=None;bbox=None
else:
    d=ImageChops.difference(x,y)
    draw=ImageDraw.Draw(d)
    for box in p["allowed"]:
        draw.rectangle(box,fill=(0,0,0))
    stat=ImageStat.Stat(d)
    mismatch=sum(1 for px in d.getdata() if px!=(0,0,0))
    mae=sum(stat.mean)/3/255
    bbox=d.getbbox()
report={
  "contract":"BLACKGOLD_APPROVED_AUTHORITY_OUTSIDE_DYNAMIC_REGIONS_V2",
  "profile":a.profile,
  "pass":not errors and mismatch==0,
  "mismatchPixelsOutsideDynamicRegions":mismatch,
  "maeOutsideDynamicRegions":mae,
  "bboxOutsideDynamicRegions":bbox,
  "allowedDynamicRegions":p["allowed"],
  "errors":errors
}
Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
raise SystemExit(0 if report["pass"] else 3)
