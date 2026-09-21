from PIL import Image,ImageChops,ImageStat
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--candidate",required=True)
ap.add_argument("--legacy",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

zones={
  "selection":(60,476,1388,633),
  "showcase":(60,698,1388,842),
}
limits={"selection":0.0750,"showcase":0.0940}

def mae(x,y,box):
  d=ImageChops.difference(x.crop(box),y.crop(box))
  return sum(ImageStat.Stat(d).mean)/3/255

authority=Image.open(a.authority).convert("RGB")
candidate=Image.open(a.candidate).convert("RGB")
legacy=Image.open(a.legacy).convert("RGB")
if authority.size!=candidate.size or authority.size!=legacy.size:
  raise SystemExit("size mismatch")

report={
  "contract":"BLACKGOLD_DYNAMIC_PRODUCT_REGION_ACCEPTANCE_V1",
  "rule":"Candidate must beat the legacy approved-product implementation against the pinned approved mockup and stay under absolute MAE ceilings.",
  "zones":{},
  "pass":True
}
for name,box in zones.items():
  cm=mae(authority,candidate,box)
  lm=mae(authority,legacy,box)
  passed=cm<=lm and cm<=limits[name]
  report["zones"][name]={
    "box":box,
    "candidateMae":cm,
    "legacyMae":lm,
    "absoluteCeiling":limits[name],
    "improvementVsLegacy":lm-cm,
    "pass":passed
  }
  report["pass"]=report["pass"] and passed

Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
raise SystemExit(0 if report["pass"] else 3)
