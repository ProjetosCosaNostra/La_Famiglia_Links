from PIL import Image,ImageChops,ImageStat,ImageOps
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

def white_count(mask):
  return mask.histogram()[255]

def silhouette_metrics(target,candidate,box,threshold,bbox_divisor,area_weight):
  t=ImageOps.grayscale(target.crop(box)).point(lambda p:255 if p<threshold else 0)
  c=ImageOps.grayscale(candidate.crop(box)).point(lambda p:255 if p<threshold else 0)
  inter=ImageChops.multiply(t,c)
  union=ImageChops.lighter(t,c)
  ti,ci=white_count(t),white_count(c)
  ii,ui=white_count(inter),white_count(union)
  iou=ii/ui if ui else 0.0
  tb=t.getbbox() or (0,0,0,0)
  cb=c.getbbox() or (0,0,0,0)
  bbox_error=sum(abs(x-y) for x,y in zip(tb,cb))
  area_ratio=(ci/ti) if ti else 0.0
  score=iou-(bbox_error/bbox_divisor)-(abs(area_ratio-1.0)*area_weight)
  return {
    "silhouetteIou":iou,
    "silhouetteScore":score,
    "silhouetteBboxError":bbox_error,
    "silhouetteAreaRatio":area_ratio,
    "silhouetteTargetBbox":tb,
    "silhouetteCandidateBbox":cb
  }

def profile_silhouette(profile,target,candidate):
  if profile.startswith("extra-wide"):
    return silhouette_metrics(target,candidate,(999,0,1156,100),165,600.0,.12)
  if profile.startswith("sparse-compact"):
    return silhouette_metrics(target,candidate,(668,0,825,90),210,500.0,.15)
  return None

report={"contract":"BLACKGOLD_PRODUCT_PARAMETER_TUNING_V3"}
for kind in ["selection","showcase"]:
  target=authority.crop(zones[kind])
  rows=[]
  for v in variants[kind]:
    im=Image.open(root/(v["id"]+".png")).convert("RGB")
    row={**v,"mae":mae(target,im)}
    if kind=="showcase":
      visual=profile_silhouette(str(v.get("profile","")),target,im)
      if visual:
        row.update(visual)
    rows.append(row)
  rows_mae=sorted(rows,key=lambda x:x["mae"])
  silhouette=[r for r in rows if "silhouetteScore" in r]
  rows_visual=sorted(silhouette,key=lambda x:x["silhouetteScore"],reverse=True) if silhouette else rows_mae
  report[kind]={
    "best":rows_visual[0],
    "top5":rows_visual[:5],
    "bestMae":rows_mae[0],
    "top5Mae":rows_mae[:5],
    "ranking":"silhouette" if silhouette else "mae",
    "all":rows
  }
Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps({
  "contract":report["contract"],
  "selection":report["selection"]["top5"],
  "showcase":report["showcase"]["top5"],
  "showcaseBestMae":report["showcase"]["bestMae"],
  "showcaseRanking":report["showcase"]["ranking"]
},indent=2))
