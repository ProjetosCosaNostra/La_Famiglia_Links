from PIL import Image,ImageChops,ImageStat
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

auth=Image.open(a.authority).convert("RGB")
cand=Image.open(a.candidate).convert("RGB")
report={
  "contract":"BLACKGOLD_MOBILE_390_AUTHORITY_DIAGNOSTIC_V1",
  "authoritySize":auth.size,
  "candidateSize":cand.size,
  "sameSize":auth.size==cand.size,
  "pixelPerfect":False,
  "mae":None,
  "mismatchRatio":None,
  "bbox":None
}
if auth.size==cand.size:
  diff=ImageChops.difference(auth,cand)
  stat=ImageStat.Stat(diff)
  mismatch=sum(1 for px in diff.getdata() if px!=(0,0,0))
  total=auth.size[0]*auth.size[1]
  report.update({
    "pixelPerfect":mismatch==0,
    "mae":sum(stat.mean)/3/255,
    "mismatchRatio":mismatch/total,
    "bbox":diff.getbbox()
  })

Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
