from pathlib import Path
import argparse
import hashlib
import json
import math
from PIL import Image, ImageChops

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(1048576)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def rgb_sha256(image):
    return hashlib.sha256(image.convert('RGB').tobytes()).hexdigest()

def compare_one(name, authority_path, capture_path, spec, diff_dir):
    if sha256_file(authority_path) != spec['runtime_authority_sha256']:
        raise RuntimeError(name + ': runtime authority file SHA-256 mismatch')
    authority = Image.open(authority_path).convert('RGB')
    capture = Image.open(capture_path).convert('RGB')
    expected_size = (int(spec['width']), int(spec['height']))
    if authority.size != expected_size:
        raise RuntimeError(f'{name}: authority size {authority.size} != {expected_size}')
    if capture.size != expected_size:
        raise RuntimeError(f'{name}: capture size {capture.size} != {expected_size}')
    if rgb_sha256(authority) != spec['rgb_sha256']:
        raise RuntimeError(name + ': authority RGB digest does not match official mockup')

    diff = ImageChops.difference(authority, capture)
    pixels = list(diff.getdata())
    mismatch = sum(1 for px in pixels if px != (0, 0, 0))
    channel_abs = sum(sum(px) for px in pixels)
    channel_sq = sum(sum(v * v for v in px) for px in pixels)
    channels = expected_size[0] * expected_size[1] * 3
    mae = channel_abs / channels
    rmse = math.sqrt(channel_sq / channels)
    diff_path = None
    if mismatch:
        diff_dir.mkdir(parents=True, exist_ok=True)
        diff_path = diff_dir / f'{name}-diff.png'
        diff.save(diff_path)
    return {
        'name': name,
        'width': expected_size[0],
        'height': expected_size[1],
        'mismatch_pixels': mismatch,
        'mae': mae,
        'rmse': rmse,
        'capture_rgb_sha256': rgb_sha256(capture),
        'authority_rgb_sha256': rgb_sha256(authority),
        'diff': str(diff_path) if diff_path else None,
        'pass': mismatch == 0,
    }

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', required=True)
parser.add_argument('--desktop-capture', required=True)
parser.add_argument('--mobile-capture', required=True)
parser.add_argument('--report', required=True)
parser.add_argument('--diff-dir', required=True)
args = parser.parse_args()

manifest_path = Path(args.manifest).resolve()
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
base = manifest_path.parent
results = []
results.append(compare_one(
    'desktop',
    (base / manifest['desktop']['runtime_authority']).resolve(),
    Path(args.desktop_capture).resolve(),
    manifest['desktop'],
    Path(args.diff_dir).resolve(),
))
results.append(compare_one(
    'mobile',
    (base / manifest['mobile']['runtime_authority']).resolve(),
    Path(args.mobile_capture).resolve(),
    manifest['mobile'],
    Path(args.diff_dir).resolve(),
))

report = {
    'contract': manifest['contract'],
    'tolerance': manifest['tolerance'],
    'pass': all(item['pass'] for item in results),
    'results': results,
}
Path(args.report).write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
if not report['pass']:
    raise SystemExit('VISUAL CONTRACT: NOT IDENTICAL')
print('VISUAL CONTRACT: ZERO PIXEL DIFFERENCE')
