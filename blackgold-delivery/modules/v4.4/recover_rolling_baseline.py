from __future__ import annotations
import argparse, base64, hashlib, json, os, shutil, subprocess, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROJECT = "BlackGold Beauty Finds"
REPO = "ProjetosCosaNostra/La_Famiglia_Links"

def now():
    return datetime.now(timezone.utc).isoformat()

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".bg44.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)

def safe_target(root: Path, target: str) -> Path:
    p = PurePosixPath(target)
    if p.is_absolute() or ".." in p.parts or not p.parts or ":" in target or "\\" in target:
        raise RuntimeError(f"unsafe target: {target}")
    dest = (root / Path(*p.parts)).resolve()
    try:
        dest.relative_to(root)
    except ValueError:
        raise RuntimeError(f"target escaped project: {target}")
    return dest

def fetch_blob(blob_sha: str) -> bytes:
    url = f"https://api.github.com/repos/{REPO}/git/blobs/{blob_sha}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "BlackGold-Rolling-Baseline/4.4",
        "Accept": "application/vnd.github+json"
    })
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("sha") != blob_sha or payload.get("encoding") != "base64":
        raise RuntimeError(f"git blob integrity failure: {blob_sha}")
    return base64.b64decode(payload["content"])

def install_blob(root: Path, target: str, blob_sha: str, expected_sha256: str):
    data = fetch_blob(blob_sha)
    actual = sha256(data)
    if actual != expected_sha256:
        raise RuntimeError(f"sha256 mismatch: {target}: {actual}")
    atomic_write(safe_target(root, target), data)
    return {"target": target, "blob_sha": blob_sha, "sha256": actual}

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def verify(root: Path, manifest: dict):
    stage = root / manifest["target_stage"]
    missing = [x for x in manifest["required_stage_files"] if not (stage / x).exists()]
    if missing:
        raise RuntimeError("rolling baseline missing: " + ", ".join(missing))
    mismatched = []
    for item in manifest["overlays"]:
        p = safe_target(root, item["target"])
        actual = sha256(p.read_bytes())
        if actual != item["sha256"]:
            mismatched.append({"target": item["target"], "actual": actual, "expected": item["sha256"]})
    if mismatched:
        raise RuntimeError("rolling overlay hash mismatch: " + json.dumps(mismatched))
    retailer = load_json(stage / "data/retailer-links.json")
    if retailer.get("default") != "deny":
        raise RuntimeError("retailer registry must remain default-deny")
    verified = [x for x in retailer.get("links", []) if isinstance(x, dict) and x.get("public_state") == "verified"]
    if verified:
        raise RuntimeError("rolling baseline refuses to recreate verified commercial routes")
    programs = load_json(stage / "data/affiliate-programs.us.json")
    if programs.get("schema") != "blackgold.affiliate-programs.us/v1":
        raise RuntimeError("affiliate program registry schema mismatch")
    for p in programs.get("programs", []):
        if p.get("program_status") != "program_verified":
            raise RuntimeError("affiliate program registry contains unverified program")
        if p.get("shopper_link_state") != "locked":
            raise RuntimeError("rolling baseline requires locked shopper_link_state")
    proposal = load_json(stage / "data/retailer-proposal-policy.json")
    if proposal.get("default") != "deny" or proposal.get("live_registry_write_allowed") is not False:
        raise RuntimeError("proposal policy must remain default-deny and read-only for live registry")
    node = shutil.which("node")
    js_checked = 0
    if node:
        for p in sorted(stage.rglob("*.js")):
            proc = subprocess.run([node, "--check", str(p)], capture_output=True, text=True, timeout=60, check=False)
            if proc.returncode:
                raise RuntimeError(f"javascript syntax failed: {p.relative_to(stage)}")
            js_checked += 1
    return {
        "required_files": len(manifest["required_stage_files"]),
        "overlay_files": len(manifest["overlays"]),
        "verified_commercial_routes": 0,
        "commercial_default": "deny",
        "node_available": bool(node),
        "javascript_checked": js_checked
    }

def current(root: Path, manifest: dict):
    try:
        return verify(root, manifest)
    except Exception:
        return None

def restore_orchestrator(root: Path, tool_dir: Path):
    src = tool_dir / "orchestrator_v44.py"
    if src.exists():
        atomic_write(root / "tools/blackgold_orchestrator/blackgold_orchestrator.py", src.read_bytes())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    args = ap.parse_args()
    root = Path(args.root).resolve()
    tool_dir = Path(__file__).resolve().parent
    manifest = load_json(tool_dir / "rolling-baseline-v4.4.json")
    if manifest.get("schema") != "blackgold.rolling-baseline/v4.4" or manifest.get("project") != PROJECT:
        raise SystemExit("rolling baseline manifest blocked")

    report_path = root / ".blackgold/reports/rolling-baseline-v4.4-latest.json"
    state_path = root / ".blackgold/state/rolling-baseline-v4.4.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "blackgold.rolling-baseline-report/v4.4",
        "project": PROJECT,
        "started_at": now(),
        "status": "running",
        "baseline_generation": manifest["baseline_generation"],
        "public_site_changes": False,
        "page_opened": False,
        "installed": []
    }

    existing = current(root, manifest)
    if existing:
        restore_orchestrator(root, tool_dir)
        report["status"] = "already_current"
        report["verification"] = existing
        report["completed_at"] = now()
        atomic_write(report_path, json.dumps(report, ensure_ascii=False, indent=2).encode())
        state = {
            "schema": "blackgold.rolling-baseline-state/v4.4",
            "project": PROJECT,
            "generation": manifest["baseline_generation"],
            "installed_at": report["completed_at"],
            "status": "current",
            "commercial_default": "deny",
            "verified_commercial_routes": 0
        }
        atomic_write(state_path, json.dumps(state, ensure_ascii=False, indent=2).encode())
        return 0

    stage = root / manifest["target_stage"]
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = root / ".blackgold/backups" / f"rolling-baseline-v4.4-{stamp}" / "experience-v2.9"
    stage_existed = stage.exists()
    try:
        if stage_existed:
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(stage, backup)
            report["backup"] = str(backup)

        boot_dir = root / manifest["v41_bootstrap"]["target_dir"]
        for item in manifest["v41_bootstrap"]["files"]:
            target = str(Path(manifest["v41_bootstrap"]["target_dir"]) / item["name"]).replace("\\", "/")
            report["installed"].append(install_blob(root, target, item["blob_sha"], item["sha256"]))

        old = boot_dir / "recover_baseline.py"
        proc = subprocess.run([sys.executable, str(old), "--root", str(root)], cwd=str(root),
                              capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=2100, check=False)
        report["v41_recovery"] = {
            "exit_code": proc.returncode,
            "stdout": proc.stdout[-10000:],
            "stderr": proc.stderr[-10000:]
        }
        if proc.returncode:
            raise RuntimeError("V4.1 base reconstruction failed")

        for item in manifest["overlays"]:
            report["installed"].append(install_blob(root, item["target"], item["blob_sha"], item["sha256"]))

        report["verification"] = verify(root, manifest)
        restore_orchestrator(root, tool_dir)
        report["status"] = "installed"
        report["completed_at"] = now()
        state = {
            "schema": "blackgold.rolling-baseline-state/v4.4",
            "project": PROJECT,
            "generation": manifest["baseline_generation"],
            "installed_at": report["completed_at"],
            "status": "current",
            "commercial_default": "deny",
            "verified_commercial_routes": 0
        }
        atomic_write(state_path, json.dumps(state, ensure_ascii=False, indent=2).encode())
        atomic_write(report_path, json.dumps(report, ensure_ascii=False, indent=2).encode())
        return 0
    except Exception as exc:
        report["status"] = "failed"
        report["error"] = str(exc)
        report["failed_at"] = now()
        try:
            if stage.exists():
                shutil.rmtree(stage)
            if stage_existed and backup.exists():
                shutil.copytree(backup, stage)
            restore_orchestrator(root, tool_dir)
            report["rollback"] = "completed"
        except Exception as rb:
            report["rollback"] = "failed"
            report["rollback_error"] = str(rb)
        atomic_write(report_path, json.dumps(report, ensure_ascii=False, indent=2).encode())
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
