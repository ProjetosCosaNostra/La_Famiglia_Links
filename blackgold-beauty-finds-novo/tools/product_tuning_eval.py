from PIL import Image,ImageChops,ImageStat,ImageFilter
from pathlib import Path
import argparse,json

ap=argparse.ArgumentParser()
ap.add_argument("--authority",required=True)
ap.add_argument("--dir",required=True)
ap.add_argument("--report",required=True)
a=ap.parse_args()

root=Path(a.dir)
cfg=json.loads((root/"variants.json").read_text(encoding="utf-8"))
authority=Image.open(a.authority).convert("RGB")

def mae(x,y):
    d=ImageChops.difference(x,y)
    return sum(ImageStat.Stat(d).mean)/3/255

def edge_mae(x,y):
    gx=x.convert("L").filter(ImageFilter.FIND_EDGES)
    gy=y.convert("L").filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(ImageChops.difference(gx,gy)).mean[0]/255

def ssim(x,y):
    size=(64,64)
    ax=list(x.convert("L").resize(size,Image.Resampling.BILINEAR).getdata())
    ay=list(y.convert("L").resize(size,Image.Resampling.BILINEAR).getdata())
    n=len(ax)
    mx=sum(ax)/n
    my=sum(ay)/n
    vx=sum((v-mx)*(v-mx) for v in ax)/(n-1)
    vy=sum((v-my)*(v-my) for v in ay)/(n-1)
    cov=sum((ax[i]-mx)*(ay[i]-my) for i in range(n))/(n-1)
    c1=(0.01*255)**2
    c2=(0.03*255)**2
    den=(mx*mx+my*my+c1)*(vx+vy+c2)
    if den==0:
        return 1.0
    return ((2*mx*my+c1)*(2*cov+c2))/den

report={
    "contract":"BLACKGOLD_PER_CARD_STRUCTURAL_TUNING_V1",
    "method":{
        "maeWeight":0.45,
        "edgeWeight":0.35,
        "structuralWeight":0.20,
        "notes":"Informational ranking only. No candidate can approve or change production automatically."
    },
    "cards":[]
}

for card in cfg["cards"]:
    clip=card["clip"]
    l=int(clip["x"])
    t=int(clip["y"])
    w=int(clip["width"])
    h=int(clip["height"])
    target=authority.crop((l,t,l+w,t+h))
    rows=[]
    for v in card["variants"]:
        im=Image.open(root/(v["id"]+".png")).convert("RGB")
        tgt=target if target.size==im.size else target.resize(im.size,Image.Resampling.BILINEAR)
        media_h=min(im.height,105)
        tm=tgt.crop((0,0,im.width,media_h))
        cm=im.crop((0,0,im.width,media_h))
        m=mae(tm,cm)
        e=edge_mae(tm,cm)
        s=max(-1.0,min(1.0,ssim(tm,cm)))
        score=.45*m+.35*e+.20*(1-s)
        full=mae(tgt,im)
        rows.append({**v,"mediaMae":m,"edgeMae":e,"ssim":s,"score":score,"fullMae":full})
    rows.sort(key=lambda r:(r["score"],r["mediaMae"],r["edgeMae"]))
    baseline=next((r for r in rows if r.get("baseline")),None)
    best=rows[0]
    improvement=None
    if baseline and baseline["score"]>0:
        improvement=(baseline["score"]-best["score"])/baseline["score"]
    recommended=bool(
        baseline and
        improvement is not None and improvement>=0.01 and
        best["mediaMae"]<=baseline["mediaMae"]*1.01 and
        best["edgeMae"]<=baseline["edgeMae"]*1.01 and
        best["ssim"]>=baseline["ssim"]-0.002
    )
    report["cards"].append({
        "index":card["index"],
        "clip":clip,
        "baseline":baseline,
        "best":best,
        "improvementFraction":improvement,
        "recommendedForHumanReview":recommended,
        "top10":rows[:10]
    })

Path(a.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps({
    "contract":report["contract"],
    "cards":[{
        "index":c["index"],
        "baseline":{k:c["baseline"][k] for k in ["scale","dx","dy","score","mediaMae","edgeMae","ssim"]} if c["baseline"] else None,
        "best":{k:c["best"][k] for k in ["scale","dx","dy","score","mediaMae","edgeMae","ssim"]},
        "improvementFraction":c["improvementFraction"],
        "recommendedForHumanReview":c["recommendedForHumanReview"]
    } for c in report["cards"]]
},indent=2))
print("BLACKGOLD_PRODUCT_TUNING_EVAL_PER_CARD=PASS")
