from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

PROJECT = "BlackGold Beauty Finds"
BAD = {
    "fake_review": r"\b(?:5[- ]star|five[- ]star|tested by us|our testers)\b",
    "fake_urgency": r"\b(?:hurry|last chance|ends tonight|only \d+ left|countdown)\b",
    "invented_discount": r"\b(?:\d+%\s*off|was \$\d+|save \$\d+)\b",
    "miracle_claim": r"\b(?:miracle|guaranteed results?|number one)\b",
}


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return default


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def append(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(data, ensure_ascii=False) + "\n")


def slug(value: str):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "candidate"


def esc(value: str):
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def current_copy(root: Path):
    fallback = {
        "title": "Beauty worth discovering. Choices you can understand.",
        "description": "Independent beauty discovery built around clear research status, visible limitations and useful comparisons.",
    }
    path = root / "index.html"
    if not path.exists():
        return fallback
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    title = re.search(r"<h1\b[^>]*>(.*?)</h1>", text, re.I | re.S)
    desc = re.search(r'<meta\b[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)', text, re.I | re.S)
    clean = lambda x: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x)).strip()
    return {
        "title": clean(title.group(1)) if title else fallback["title"],
        "description": clean(desc.group(1)) if desc else fallback["description"],
    }


def body_for(kind: str):
    if kind == "question":
        return '''<div class="question-grid"><button data-route="simple">I want a simpler routine</button><button data-route="compare">I need to compare formulas</button><button data-route="gift">I need a beauty gift</button></div><div class="decision-result" id="decisionResult" aria-live="polite">Choose a question to see an explainable route.</div>'''
    if kind == "editorial":
        return '''<div class="story-grid"><article><span>01</span><h3>Research status</h3><p>See what is known, unknown and still waiting for verification.</p></article><article><span>02</span><h3>Comparison context</h3><p>Understand which specifications actually change the decision.</p></article><article><span>03</span><h3>Limitations first</h3><p>No recommendation is complete until its limits are visible.</p></article></div>'''
    if kind == "categories":
        return '''<div class="category-rail"><a href="#research">Skincare <small>Routine & ingredients</small></a><a href="#research">Makeup <small>Finish & everyday use</small></a><a href="#research">Hair <small>Care & styling</small></a><a href="#research">Fragrance <small>Scent & gifting</small></a></div>'''
    if kind == "truth":
        return '''<div class="truth-grid"><div><b>NO</b><span>Fake testing</span></div><div><b>NO</b><span>Invented urgency</span></div><div><b>YES</b><span>Visible limitations</span></div><div><b>YES</b><span>Clear disclosure</span></div></div>'''
    if kind == "research":
        return '''<div class="research-board"><div class="research-lead"><span>RESEARCH LEDGER</span><h3>Every useful claim should have a status.</h3><p>This stage contains no active retailer links. Commercial routes stay locked until their status can be verified.</p></div><div class="research-stack"><div>KNOWN <strong>Source-visible facts</strong></div><div>UNKNOWN <strong>Unverified details remain unknown</strong></div><div>LIMITS <strong>Constraints shown before conversion</strong></div></div></div>'''
    return "<p>Structured beauty intelligence.</p>"


def make_html(bp, copy):
    chapters = []
    for i, section in enumerate(bp["sections"], 1):
        kind = section["kind"]
        chapters.append(
            f'<section class="chapter chapter-{i} chapter-{kind}" id="{kind}"><div class="shell"><div class="chapter-label">{i:02d} · {esc(section["label"])}</div><h2>{esc(section["headline"])}</h2>{body_for(kind)}</div></section>'
        )
    return f'''<!doctype html><html lang="en-US" data-candidate="{slug(bp["id"])}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{esc(bp["name"])} · BlackGold Beauty Finds Lab</title><meta name="description" content="{esc(copy["description"])}"><link rel="stylesheet" href="assets/lab.css"><script defer src="assets/lab.js"></script></head><body class="layout-{slug(bp["archetype"])}"><a class="skip" href="#main">Skip to content</a><header class="masthead"><div class="shell masthead-inner"><a class="brand" href="#main" aria-label="BlackGold Beauty Finds"><span class="crest">BG</span><span><strong>BlackGold Beauty Finds</strong><small>US BEAUTY INTELLIGENCE</small></span></a><nav aria-label="Primary"><a href="#question">Discover</a><a href="#research">Research</a><a href="#truth">Truth Standard</a></nav></div></header><main id="main"><section class="hero"><div class="shell hero-grid"><div class="hero-copy"><span class="eyebrow">{esc(bp["archetype"])}</span><h1>{esc(copy["title"])}</h1><p>{esc(copy["description"])}</p><a class="primary" href="#question">Start with a question</a></div><div class="hero-art" aria-hidden="true"><i></i><b></b><em></em><span></span></div></div></section>{''.join(chapters)}</main><footer><div class="shell"><strong>BlackGold Beauty Finds</strong><span>Independent research · US-facing prototype · No active retailer links</span></div></footer></body></html>'''


def make_css(bp):
    p = bp["palette"]
    s = bp["structural"]
    return f'''@charset "UTF-8";:root{{--paper:{p["paper"]};--surface:{p["surface"]};--blush:{p["blush"]};--gold:{p["gold"]};--ink:{p["ink"]};--muted:{p["muted"]};--line:{p["line"]};--radius:{s["radius"]}px;--gap:{s["section_gap"]}px}}*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--paper);color:var(--ink);font-family:"Segoe UI",Arial,sans-serif;line-height:1.5}}a{{color:inherit}}button{{font:inherit}}.shell{{width:min(1500px,calc(100% - clamp(36px,7vw,110px)));margin:auto}}.skip{{position:fixed;left:10px;top:10px;transform:translateY(-180%);z-index:99;background:var(--ink);color:white;padding:10px}}.skip:focus{{transform:none}}.masthead{{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}}.masthead-inner{{min-height:82px;display:flex;align-items:center;justify-content:space-between;gap:30px}}.brand{{display:flex;align-items:center;gap:12px;text-decoration:none}}.crest{{display:grid;place-items:center;width:48px;height:48px;border:1px solid var(--gold);border-radius:50%;font-family:Georgia,serif}}.brand strong,.brand small{{display:block}}.brand strong{{font-family:Georgia,serif;font-size:24px;font-weight:500}}.brand small{{font-size:8px;letter-spacing:.16em;color:var(--muted)}}nav{{display:flex;gap:26px}}nav a{{font-size:10px;text-decoration:none;text-transform:uppercase;letter-spacing:.09em}}.hero{{min-height:640px;display:grid;align-items:center;background:linear-gradient(115deg,var(--surface),var(--blush))}}.hero-grid{{display:grid;grid-template-columns:{s["hero_split"]};gap:clamp(30px,6vw,90px);align-items:center}}.hero-copy{{padding:70px 0}}.eyebrow,.chapter-label{{font-size:9px;letter-spacing:.15em;color:var(--gold);font-weight:700}}h1,h2,h3{{font-family:Georgia,serif;font-weight:500;letter-spacing:-.035em}}h1{{font-size:clamp(58px,8vw,118px);line-height:.85;margin:20px 0 28px;max-width:880px}}.hero-copy p{{font-family:Georgia,serif;font-size:clamp(18px,2vw,25px);max-width:650px;color:var(--muted)}}.primary{{display:inline-flex;margin-top:24px;padding:15px 24px;background:var(--gold);color:white;text-decoration:none;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}}.hero-art{{position:relative;min-height:500px;overflow:hidden;border-radius:var(--radius);background:radial-gradient(circle at 70% 22%,#fff 0 8%,transparent 9%),linear-gradient(145deg,#f3d7c8,#fff9f3)}}.hero-art i,.hero-art b,.hero-art em,.hero-art span{{position:absolute;display:block;box-shadow:0 22px 70px #6c4b3a22}}.hero-art i{{width:29%;height:58%;left:13%;bottom:8%;border-radius:44% 44% 18% 18%;background:linear-gradient(90deg,#eed0bc,#fff7ee)}}.hero-art b{{width:24%;height:46%;left:43%;bottom:15%;border-radius:90px 90px 20px 20px;background:linear-gradient(90deg,#f5e5da,#d8a275)}}.hero-art em{{width:23%;height:30%;right:10%;bottom:8%;border-radius:50% 50% 20px 20px;background:linear-gradient(180deg,#fff,#eac8b6)}}.hero-art span{{width:25%;height:25%;right:7%;top:7%;border-radius:50%;background:radial-gradient(circle,#dba8a0 0 23%,#f5c8c2 24% 48%,transparent 49%)}}.chapter{{padding:var(--gap) 0;border-top:1px solid var(--line)}}.chapter:nth-child(even){{background:var(--surface)}}.chapter h2{{font-size:clamp(42px,5vw,76px);line-height:.9;max-width:900px;margin:14px 0 42px}}.question-grid,.story-grid,.truth-grid,.category-rail{{display:grid;gap:18px}}.question-grid{{grid-template-columns:repeat(3,1fr)}}.question-grid button{{min-height:150px;padding:26px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);text-align:left;font-family:Georgia,serif;font-size:27px;cursor:pointer}}.decision-result{{margin-top:18px;padding:22px;border-left:3px solid var(--gold);background:var(--blush)}}.story-grid{{grid-template-columns:1.2fr .9fr .9fr}}.story-grid article{{padding:30px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper)}}.story-grid span{{color:var(--gold);font-size:12px}}.story-grid h3{{font-size:32px;margin:22px 0 10px}}.category-rail{{grid-template-columns:repeat(4,1fr)}}.category-rail a{{padding:30px;border-block:1px solid var(--line);text-decoration:none;font-family:Georgia,serif;font-size:30px}}.category-rail small{{display:block;font-family:"Segoe UI",Arial,sans-serif;font-size:9px;color:var(--muted);margin-top:7px}}.truth-grid{{grid-template-columns:repeat(4,1fr)}}.truth-grid>div{{padding:26px;border-right:1px solid var(--line)}}.truth-grid b{{display:block;color:var(--gold);font-size:12px;margin-bottom:18px}}.truth-grid span{{font-family:Georgia,serif;font-size:28px}}.research-board{{display:grid;grid-template-columns:1.15fr .85fr;gap:40px}}.research-lead{{padding:35px;background:var(--blush);border-radius:var(--radius)}}.research-lead span{{font-size:9px;letter-spacing:.14em;color:var(--gold)}}.research-lead h3{{font-size:45px;margin:18px 0}}.research-stack{{display:grid;gap:10px}}.research-stack div{{padding:22px;border:1px solid var(--line);border-radius:var(--radius);font-size:9px;letter-spacing:.1em}}.research-stack strong{{display:block;font-family:Georgia,serif;font-size:22px;letter-spacing:0;margin-top:7px}}footer{{padding:55px 0;background:var(--ink);color:var(--paper)}}footer .shell{{display:flex;justify-content:space-between;gap:30px}}footer span{{color:#c7bdb5;font-size:10px}}.chapter-1{{{s["card_mode"]}}}@media(max-width:900px){{.hero-grid,.research-board{{grid-template-columns:1fr}}.hero-art{{min-height:360px}}.question-grid,.story-grid,.category-rail,.truth-grid{{grid-template-columns:1fr 1fr}}nav{{display:none}}}}@media(max-width:560px){{.shell{{width:min(100% - 32px,1500px)}}.masthead-inner{{min-height:70px}}.brand strong{{font-size:20px}}h1{{font-size:clamp(52px,16vw,78px)}}.hero{{min-height:auto}}.hero-copy{{padding:56px 0 20px}}.hero-art{{min-height:320px;margin-bottom:35px}}.question-grid,.story-grid,.category-rail,.truth-grid{{grid-template-columns:1fr}}.chapter{{padding:70px 0}}footer .shell{{flex-direction:column}}}}@media(prefers-reduced-motion:reduce){{*{{scroll-behavior:auto!important;transition:none!important;animation:none!important}}}}:focus-visible{{outline:3px solid var(--gold);outline-offset:4px}}'''


def make_js():
    return '''document.addEventListener("DOMContentLoaded",()=>{const r=document.querySelector("#decisionResult");document.querySelectorAll("[data-route]").forEach(b=>b.addEventListener("click",()=>{const m={simple:"Start with essential steps, then add only what solves a clear need.",compare:"Compare formulation, packaging, routine fit and what remains unverified.",gift:"Choose by recipient, presentation, budget and retailer status."};r.textContent=m[b.dataset.route]||"Route unavailable.";}));});'''


def static_findings(html, css, js, config):
    combined = "\n".join((html, css, js))
    findings = []
    for rule, pattern in BAD.items():
        if re.search(pattern, combined, re.I):
            findings.append({"rule": rule, "severity": "blocker", "message": "unsupported language"})
    if re.search(r"https?://", html, re.I):
        findings.append({"rule": "external_url", "severity": "blocker", "message": "external URL"})
    if html.lower().count("<h1") != 1:
        findings.append({"rule": "h1_count", "severity": "blocker", "message": "one h1 required"})
    for tag in ("header", "nav", "main", "footer"):
        if f"<{tag}" not in html.lower():
            findings.append({"rule": "landmark", "severity": "blocker", "message": f"{tag} missing"})
    for rule, test in (("reduced_motion", "prefers-reduced-motion"), ("focus_visible", ":focus-visible"), ("fluid_type", "clamp(")):
        if test not in css:
            findings.append({"rule": rule, "severity": "major", "message": f"{rule} missing"})
    if css.count("@media") < 2:
        findings.append({"rule": "responsive_depth", "severity": "major", "message": "two responsive tiers required"})
    if len(combined.encode()) > int(config["budgets"]["max_candidate_bytes"]):
        findings.append({"rule": "weight", "severity": "major", "message": "candidate over byte budget"})
    return findings


def dna_similarity(a, b):
    aa = set(a["dna"]["section_shapes"] + a["dna"]["grid_modes"] + [a["archetype"]])
    bb = set(b["dna"]["section_shapes"] + b["dna"]["grid_modes"] + [b["archetype"]])
    return len(aa & bb) / max(1, len(aa | bb))


def capture(index: Path, output: Path, viewport):
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return {"status": "not_run", "reason": "Playwright unavailable"}
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": int(viewport["width"]), "height": int(viewport["height"])})
            page.goto(index.as_uri(), wait_until="networkidle")
            page.screenshot(path=str(output), full_page=True)
            browser.close()
        return {"status": "passed", "path": str(output)}
    except Exception as exc:
        return {"status": "not_run", "reason": f"headless capture unavailable: {exc}"}


def image_metrics(path: Path):
    try:
        from PIL import Image
    except Exception:
        return {"status": "not_run", "reason": "Pillow unavailable"}
    try:
        image = Image.open(path).convert("RGB")
        small = image.resize((160, max(1, round(160 * image.height / image.width))))
        px = list(small.getdata())
        lum = [(0.2126*r + 0.7152*g + 0.0722*b)/255 for r,g,b in px]
        dark = sum(v < .18 for v in lum) / len(lum)
        light = sum(v > .82 for v in lum) / len(lum)
        bins = Counter((r//32,g//32,b//32) for r,g,b in px)
        entropy = -sum((n/len(px))*math.log2(n/len(px)) for n in bins.values())
        return {"status":"passed","dark_ratio":round(dark,4),"light_ratio":round(light,4),"color_entropy":round(entropy,3),"width":image.width,"height":image.height}
    except Exception as exc:
        return {"status":"failed","reason":str(exc)}


def find_reference(root: Path):
    patterns = ["docs/**/approved-master.png", "docs/**/approved-master.jpg", "docs/**/*approved*master*.png"]
    found = []
    for pattern in patterns:
        found.extend(root.glob(pattern))
    found = [p for p in found if p.is_file()]
    return sorted(found, key=lambda p:p.stat().st_mtime, reverse=True)[0] if found else None


def compare_reference(shot: Path, ref: Path):
    try:
        from PIL import Image, ImageChops, ImageStat
    except Exception:
        return {"status":"not_run","reason":"Pillow unavailable"}
    try:
        a = Image.open(shot).convert("RGB")
        b = Image.open(ref).convert("RGB").resize(a.size)
        diff = ImageStat.Stat(ImageChops.difference(a,b))
        mean = sum(diff.mean)/(3*255)
        return {"status":"passed","similarity":round(max(0,1-mean),4),"reference":str(ref)}
    except Exception as exc:
        return {"status":"failed","reason":str(exc)}


def score(findings, bp, metrics, reference):
    blockers = sum(f["severity"] == "blocker" for f in findings)
    majors = sum(f["severity"] == "major" for f in findings)
    value = 100 - blockers*40 - majors*7
    value += min(7,len(set(bp["dna"]["section_shapes"]))) + min(5,len(set(bp["dna"]["grid_modes"])))
    if bp["structural"]["hero_split"] != "1fr 1fr":
        value += 3
    if metrics.get("status") == "passed":
        if metrics.get("dark_ratio",0) > .36: value -= 14
        if metrics.get("light_ratio",0) < .30: value -= 8
        if metrics.get("color_entropy",0) < 2.6: value -= 8
        elif metrics.get("color_entropy",0) > 4.2: value += 3
    if reference.get("status") == "passed":
        value += max(-4,min(4,(reference["similarity"]-.5)*8))
    return round(max(0,min(100,value)),2)


def remember(root, run_id, candidate, findings):
    memory = root/".blackgold"/"memory"/"lab-failures.jsonl"
    for item in findings:
        append(memory,{"timestamp":now(),"run_id":run_id,"candidate_id":candidate,**item})
    seen = {}
    if memory.exists():
        for line in memory.read_text(encoding="utf-8-sig").splitlines():
            try: item=json.loads(line)
            except Exception: continue
            seen.setdefault(item.get("rule"),set()).add(item.get("run_id"))
    rules=[{"rule":rule,"status":"blocking","distinct_runs":len({x for x in runs if x})} for rule,runs in seen.items() if len({x for x in runs if x})>=2]
    write(root/".blackgold"/"memory"/"lab-promoted-rules.json",{"schema":"blackgold.lab-promoted-rules/v1","updated_at":now(),"rules":sorted(rules,key=lambda x:x["rule"])})


def preserve_winner(root, source):
    target=root/".blackgold"/"staging"/"experience-v2.0"/"winner"
    building=target.with_name("winner.building"); previous=target.with_name("winner.previous")
    if building.exists(): shutil.rmtree(building)
    shutil.copytree(source,building)
    if previous.exists(): shutil.rmtree(previous)
    if target.exists(): target.replace(previous)
    building.replace(target)
    return target


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--root",required=True); ap.add_argument("--config",required=True); args=ap.parse_args()
    root=Path(args.root).resolve(); config=read((root/args.config).resolve())
    if not isinstance(config,dict) or config.get("schema")!="blackgold.experience-lab/v2" or config.get("project")!=PROJECT:
        raise SystemExit("invalid lab config")
    if config.get("public_site_changes") is not False or config.get("open_page") is not False:
        raise SystemExit("public/open-page lock violated")
    blueprint_doc=read(root/"data"/"experience"/"lab-blueprints.v2.json",{}); blueprints=blueprint_doc.get("candidates",[])
    if len(blueprints)<4: raise SystemExit("at least 4 candidates required")
    run_id=datetime.now().strftime("lab-%Y%m%d-%H%M%S"); lab=root/".blackgold"/"lab"/run_id; lab.mkdir(parents=True,exist_ok=True)
    copy=current_copy(root); reference=find_reference(root); generated={}; results=[]
    for bp in blueprints:
        cid=slug(bp["id"]); folder=lab/cid; (folder/"assets").mkdir(parents=True,exist_ok=True)
        html=make_html(bp,copy); css=make_css(bp); js=make_js()
        (folder/"index.html").write_text(html,encoding="utf-8"); (folder/"assets"/"lab.css").write_text(css,encoding="utf-8"); (folder/"assets"/"lab.js").write_text(js,encoding="utf-8")
        generated[cid]={"bp":bp,"folder":folder,"html":html,"css":css,"js":js}
    for cid,item in generated.items():
        bp=item["bp"]; findings=static_findings(item["html"],item["css"],item["js"],config)
        too_close=[]
        for other,other_item in generated.items():
            if other==cid: continue
            sim=dna_similarity(bp,other_item["bp"])
            if sim>=float(config["anti_template"]["max_dna_similarity"]): too_close.append(other)
        if too_close: findings.append({"rule":"candidate_similarity","severity":"blocker","message":"too similar to: "+", ".join(sorted(too_close))})
        captures={}; metrics={}; ref_result={"status":"not_run","reason":"approved reference unavailable"}
        for view,viewport in config["viewports"].items():
            shot=lab/"_screenshots"/f"{cid}-{view}.png"; cap=capture(item["folder"]/"index.html",shot,viewport); captures[view]=cap
            metrics[view]=image_metrics(shot) if cap.get("status")=="passed" else {"status":"not_run","reason":cap.get("reason","capture unavailable")}
            if view=="desktop" and reference and cap.get("status")=="passed": ref_result=compare_reference(shot,reference)
        value=score(findings,bp,metrics.get("desktop",{}),ref_result); blockers=sum(f["severity"]=="blocker" for f in findings)
        eligible=blockers==0 and value>=float(config["selection"]["minimum_score"])
        remember(root,run_id,cid,findings)
        results.append({"candidate_id":cid,"name":bp["name"],"archetype":bp["archetype"],"score":value,"eligible":eligible,"findings":findings,"captures":captures,"visual_metrics":metrics,"reference_comparison":ref_result,"structural_hash":hashlib.sha256((item["html"]+item["css"]).encode()).hexdigest()})
    results.sort(key=lambda r:(-r["score"],r["candidate_id"])); passing=[r for r in results if r["eligible"]]; winner=passing[0] if passing else None
    winner_path=preserve_winner(root,generated[winner["candidate_id"]]["folder"]) if winner else None
    for cid,item in generated.items():
        if winner and cid==winner["candidate_id"]: continue
        if item["folder"].exists(): shutil.rmtree(item["folder"])
    capture_status="verified_headless" if winner and winner["captures"].get("desktop",{}).get("status")=="passed" else "static_only"
    report={"schema":"blackgold.experience-lab-report/v2","project":PROJECT,"run_id":run_id,"generated_at":now(),"status":"winner_selected" if winner else "no_candidate_passed","public_site_changes":False,"page_opened":False,"candidate_count":len(results),"winner":winner,"winner_path":str(winner_path.relative_to(root)) if winner_path else "","visual_capture_status":capture_status,"approved_reference":str(reference.relative_to(root)) if reference else "","results":results,"next_gate":"internal_visual_verification" if winner and capture_status=="verified_headless" else "headless_visual_verification_required" if winner else "repair_and_rerun"}
    write(root/".blackgold"/"reports"/"experience-lab-v2-latest.json",report); write(lab/"lab-report.json",report)
    print(json.dumps({"status":report["status"],"run_id":run_id,"winner":winner["candidate_id"] if winner else None,"winner_score":winner["score"] if winner else None,"visual_capture_status":capture_status,"public_site_changes":False,"page_opened":False},ensure_ascii=False,indent=2))
    return 0 if winner else 1


if __name__=="__main__":
    raise SystemExit(main())
