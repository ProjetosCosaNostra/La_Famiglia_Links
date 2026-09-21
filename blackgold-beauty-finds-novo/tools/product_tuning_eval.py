from PIL import Image,ImageChops,ImageStat
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--dir",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

root=Path(a.dir)
variants=json.loads((root/"variants.json").read_text(encoding="utf-8"))
authority=Image.open(a.authority).convert("RGB")
zones={
  "selection":(60,476,1388,633),
  "showcase":(60,698,1388,842)
}
def mae(x,y):
  d=ImageChops.difference(x,y)
  return sum(ImageStat.Stat(d).mean)/3/255

report={"contract":"BLACKGOLD_PRODUCT_PARAMETER_TUNING_V1"}
for kind in ["selection","showcase"]:
  target=authority.crop(zones[kind])
  rows=[]
  for v in variants[kind]:
    im=Image.open(root/(v["id"]+".png")).convert("RGB")
    rows.append({**v,"mae":mae(target,im)})
  rows.sort(key=lambda x:x["mae"])
  report[kind]={"best":rows[0],"top5":rows[:5],"all":rows}
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps({"contract":report["contract"],"selection":report["selection"]["top5"],"showcase":report["showcase"]["top5"]},indent=2))
