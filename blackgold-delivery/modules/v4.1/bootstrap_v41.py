from __future__ import annotations
import argparse, base64, hashlib, json, os, subprocess, sys, urllib.request
from pathlib import Path

PROJECT = "BlackGold Beauty Finds"
REPO = "ProjetosCosaNostra/La_Famiglia_Links"
FILES = {
    "baseline-v4.1.json": {
        "blob_sha": "db5a47c291ea526e1aa8de7cae6ad624927436d9",
        "sha256": "66f82d8c3702cdc18d128b9af96c7d437620f316b85169ea44311dcd9dc2bb93",
    },
    "recover_baseline.py": {
        "blob_sha": "9c1d1bc4c37d6d982d0b05c413cfa7c28b505ebe",
        "sha256": "fafc7f9ebec1015c23b9a71bbc880667b02c8ad5cb1304a300fa1d0dbc1df193",
    },
    "orchestrator_v41.py": {
        "blob_sha": "44758c16a17dc289d76e5d571756c367b2398bc5",
        "sha256": "fca098e9e182de1e14294fa48dca415ff91c393599d4246e02a61be31b7bd88e",
    },
}

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def fetch_blob(blob_sha: str) -> bytes:
    url = f"https://api.github.com/repos/{REPO}/git/blobs/{blob_sha}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "BlackGold-Baseline-Bootstrap/4.1",
        "Accept": "application/vnd.github+json",
    })
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("sha") != blob_sha or payload.get("encoding") != "base64":
        raise RuntimeError("source blob integrity failure")
    return base64.b64decode(payload["content"])

def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".bootstrap.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    args = ap.parse_args()
    project_root = Path(args.root).resolve()
    tool_dir = project_root / "tools/blackgold_baseline_v41"
    tool_dir.mkdir(parents=True, exist_ok=True)
    staged = {}
    for name, spec in FILES.items():
        data = fetch_blob(spec["blob_sha"])
        if sha256(data) != spec["sha256"]:
            raise RuntimeError(f"sha256 mismatch: {name}")
        staged[name] = data
    for name, data in staged.items():
        atomic_write(tool_dir / name, data)
    engine = tool_dir / "recover_baseline.py"
    proc = subprocess.run(
        [sys.executable, str(engine), "--root", str(project_root)],
        cwd=str(project_root), check=False
    )
    return proc.returncode

if __name__ == "__main__":
    raise SystemExit(main())
