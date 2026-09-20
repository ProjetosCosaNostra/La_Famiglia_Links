from PIL import Image,ImageChops,ImageStat
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

authority=Image.open(a.authority).convert("RGB")
candidate=Image.open(a.candidate).convert("RGB")
errors=[]
if authority.size!=candidate.size:
    errors.append(f"size mismatch {authority.size} != {candidate.size}")

if errors:
    mismatch=-1
    mae=None
    bbox=None
else:
    diff=ImageChops.difference(authority,candidate)
    stat=ImageStat.Stat(diff)
    mismatch=sum(1 for px in diff.getdata() if px!=(0,0,0))
    mae=sum(stat.mean)/3/255
    bbox=diff.getbbox()

report={
    "contract":"BLACKGOLD_EXACT_ZERO_CATALOG_AUTHORITY_V2",
    "pass":not errors and mismatch==0,
    "authoritySize":authority.size,
    "candidateSize":candidate.size,
    "mismatchPixels":mismatch,
    "mae":mae,
    "bbox":bbox,
    "errors":errors,
}
Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
raise SystemExit(0 if report["pass"] else 3)
