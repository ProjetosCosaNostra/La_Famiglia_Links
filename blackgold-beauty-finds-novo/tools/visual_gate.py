from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageDraw

PROFILES = {
    "desktop": {
        "size": (1448, 1086),
        "allowed": [
            (55, 320, 205, 385),   # product count tile only
            (55, 455, 1395, 625),  # selection products
            (55, 670, 1395, 835),  # showcase products
        ],
    },
    "mobile": {
        "size": (390, 1152),
        "allowed": [
            (10, 377, 124, 430),
            (10, 489, 380, 619),
            (10, 691, 380, 830),
        ],
    },
}

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", choices=PROFILES, required=True)
    ap.add_argument("--authority", required=True)
    ap.add_argument("--candidate", required=True)
    ap.add_argument("--report", required=True)
    args = ap.parse_args()

    profile = PROFILES[args.profile]
    authority = Image.open(args.authority).convert("RGB")
    candidate = Image.open(args.candidate).convert("RGB")

    if authority.size != profile["size"] or candidate.size != profile["size"]:
        report = {
            "pass": False,
            "profile": args.profile,
            "reason": "viewport_size_mismatch",
            "expected": profile["size"],
            "authority": authority.size,
            "candidate": candidate.size,
        }
        Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 2

    diff = ImageChops.difference(authority, candidate)
    # Differences are allowed ONLY where legacy catalogue content must be absent.
    draw = ImageDraw.Draw(diff)
    for rect in profile["allowed"]:
        draw.rectangle(rect, fill=(0, 0, 0))

    stat = ImageStat.Stat(diff)
    bbox = diff.getbbox()
    mismatch_pixels = 0
    if bbox:
        # Count pixels with any channel difference.
        pixels = diff.load()
        for y in range(diff.height):
            for x in range(diff.width):
                if pixels[x, y] != (0, 0, 0):
                    mismatch_pixels += 1

    report = {
        "contract": "BLACKGOLD_AUTHORITY_OUTSIDE_CATALOG_ZERO_TOLERANCE",
        "profile": args.profile,
        "pass": mismatch_pixels == 0,
        "viewport": profile["size"],
        "mismatch_pixels_outside_allowed_catalog_zones": mismatch_pixels,
        "mae_outside_allowed_catalog_zones": sum(stat.mean) / 3 / 255,
        "rmse_outside_allowed_catalog_zones": (sum(v*v for v in stat.rms) / 3) ** 0.5 / 255,
        "allowed_difference_rectangles": profile["allowed"],
        "rule": "Any visual difference outside catalogue-removal zones blocks preview.",
    }
    Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["pass"] else 3

if __name__ == "__main__":
    raise SystemExit(main())
