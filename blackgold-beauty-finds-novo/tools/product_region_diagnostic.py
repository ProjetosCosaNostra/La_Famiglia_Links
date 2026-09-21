from PIL import Image,ImageChops,ImageStat
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

zones={
  "selection":(60,476,1388,633),
  "showcase":(60,698,1388,842),
}
authority=Image.open(a.authority).convert("RGB")
candidate=Image.open(a.candidate).convert("RGB")
report={
  "contract":"BLACKGOLD_APPROVED_PRODUCT_REGION_DIAGNOSTIC_V1",
  "authoritySize":authority.size,
  "candidateSize":candidate.size,
  "zones":{},
  "sizeValid":authority.size==candidate.size==(1448,1086),
  "pixelPerfect":False,
  "diagnosticOnly":True,
}
if report["sizeValid"]:
  for name,box in zones.items():
    x=authority.crop(box)
    y=candidate.crop(box)
    diff=ImageChops.difference(x,y)
    stat=ImageStat.Stat(diff)
    mismatch=sum(1 for px in diff.getdata() if px!=(0,0,0))
    mae=sum(stat.mean)/3/255
    report["zones"][name]={
      "box":box,
      "pixels":x.width*x.height,
      "mismatchPixels":mismatch,
      "mismatchRatio":mismatch/(x.width*x.height),
      "mae":mae,
      "bbox":diff.getbbox(),
    }
else:
  report["error"]="size mismatch"

if report["sizeValid"]:
  report["pixelPerfect"]=all(z.get("mismatchPixels")==0 for z in report["zones"].values())

Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
raise SystemExit(0)
