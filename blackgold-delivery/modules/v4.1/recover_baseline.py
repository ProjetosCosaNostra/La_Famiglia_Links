from __future__ import annotations
import argparse, base64, hashlib, json, os, shutil, subprocess, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROJECT = "BlackGold Beauty Finds"
SELF_TASK = "baseline-recovery-v4.1.task.json"

def now():
    return datetime.now(timezone.utc).isoformat()

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".bg41.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)

def fetch_contents(repo: str, branch: str, rel: str, expected_blob_sha: str) -> bytes:
    url = f"https://api.github.com/repos/{repo}/contents/blackgold-delivery/releases/{rel}?ref={branch}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "BlackGold-Baseline-Recovery/4.1",
        "Accept": "application/vnd.github+json"
    })
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("sha") != expected_blob_sha:
        raise RuntimeError(f"release blob mismatch: {rel}")
    if payload.get("encoding") != "base64":
        raise RuntimeError(f"release encoding blocked: {rel}")
    return base64.b64decode(payload["content"])

def safe_target(root: Path, target: str) -> Path:
    p = PurePosixPath(target)
    if p.is_absolute() or ".." in p.parts or not p.parts:
        raise RuntimeError(f"unsafe target: {target}")
    if ":" in target or "\\" in target:
        raise RuntimeError(f"unsafe target syntax: {target}")
    dest = (root / Path(*p.parts)).resolve()
    try:
        dest.relative_to(root)
    except ValueError:
        raise RuntimeError(f"target escaped project: {target}")
    return dest

def allowed_nested_target(target: str) -> bool:
    if target.startswith(".blackgold/staging/experience-v2.9/"):
        return True
    if target.startswith("tools/blackgold_") and not target.startswith("tools/blackgold_orchestrator/"):
        return True
    return False

def apply_release(root: Path, repo: str, branch: str, spec: dict, report: dict):
    raw = fetch_contents(repo, branch, spec["name"], spec["blob_sha"])
    bundle = json.loads(raw.decode("utf-8"))
    if bundle.get("schema") != "blackgold.remote-bundle/v1":
        raise RuntimeError(f"bundle schema mismatch: {spec['name']}")
    if bundle.get("project") != PROJECT:
        raise RuntimeError(f"bundle project mismatch: {spec['name']}")
    if bundle.get("public_site_changes") is not False:
        raise RuntimeError(f"public bundle blocked: {spec['name']}")
    if bundle.get("delete"):
        raise RuntimeError(f"delete operation blocked in recovery: {spec['name']}")
    installed = 0
    skipped = []
    for item in bundle.get("files", []):
        target = str(item.get("target") or "")
        if not allowed_nested_target(target):
            skipped.append(target)
            continue
        if item.get("encoding") != "base64":
            raise RuntimeError(f"unsupported file encoding: {spec['name']}:{target}")
        data = base64.b64decode(item.get("content") or "", validate=True)
        expected = str(item.get("sha256") or "")
        if sha256(data) != expected:
            raise RuntimeError(f"file hash mismatch: {spec['name']}:{target}")
        atomic_write(safe_target(root, target), data)
        installed += 1
    report["releases"].append({
        "release": spec["name"],
        "blob_sha": spec["blob_sha"],
        "installed_files": installed,
        "skipped_targets": skipped
    })

def run_materializer(root: Path, rel: str, report: dict):
    tool = safe_target(root, rel)
    if not tool.exists():
        raise RuntimeError(f"materializer missing: {rel}")
    proc = subprocess.run(
        [sys.executable, str(tool), "--root", str(root)],
        cwd=str(root), capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=420, check=False
    )
    record = {
        "tool": rel, "exit_code": proc.returncode,
        "stdout": proc.stdout[-8000:], "stderr": proc.stderr[-8000:]
    }
    report["materializers"].append(record)
    if proc.returncode != 0:
        raise RuntimeError(f"materializer failed: {rel}")

def quarantine_stale_tasks(root: Path, report: dict):
    pending = root / ".blackgold/tasks/pending"
    qroot = root / ".blackgold/tasks/quarantine" / "baseline-v4.1"
    qroot.mkdir(parents=True, exist_ok=True)
    moved = []
    if pending.exists():
        for p in pending.glob("*.task.json"):
            if p.name == SELF_TASK:
                continue
            dest = qroot / p.name
            if dest.exists():
                dest = qroot / (p.stem + "." + datetime.now().strftime("%Y%m%d_%H%M%S") + p.suffix)
            shutil.move(str(p), str(dest))
            moved.append({"from": str(p), "to": str(dest)})
    report["quarantined_tasks"] = moved

def verify_stage(root: Path, manifest: dict, report: dict):
    stage = root / manifest["target_stage"]
    missing = [rel for rel in manifest["required_stage_files"] if not (stage / rel).exists()]
    if missing:
        raise RuntimeError("baseline missing required files: " + ", ".join(missing))
    products = json.loads((stage / "data/products.json").read_text(encoding="utf-8"))
    ids = [p.get("id") for p in products.get("products", [])]
    if len(ids) < 8 or len(ids) != len(set(ids)):
        raise RuntimeError("product dataset integrity failed")
    retailer = json.loads((stage / "data/retailer-links.json").read_text(encoding="utf-8"))
    if retailer.get("default") != "deny":
        raise RuntimeError("retailer registry default must remain deny")
    verified = [x for x in retailer.get("links", []) if x.get("public_state") == "verified"]
    if verified:
        raise RuntimeError("baseline recovery refuses to recreate verified commercial routes")
    checks = {
        "required_files": len(manifest["required_stage_files"]),
        "product_count": len(ids),
        "verified_commercial_routes": 0,
        "commercial_default": "deny"
    }
    node = shutil.which("node")
    js_files = sorted(stage.rglob("*.js"))
    js_results = []
    if node:
        for path in js_files:
            proc = subprocess.run([node, "--check", str(path)], capture_output=True, text=True, timeout=45, check=False)
            js_results.append({"file": str(path.relative_to(stage)), "exit_code": proc.returncode})
            if proc.returncode != 0:
                raise RuntimeError(f"javascript syntax failed: {path.relative_to(stage)}")
    checks["javascript_checked"] = len(js_results) if node else 0
    checks["node_available"] = bool(node)
    report["verification"] = checks

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    args = ap.parse_args()
    root = Path(args.root).resolve()
    tool_dir = Path(__file__).resolve().parent
    manifest = json.loads((tool_dir / "baseline-v4.1.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "blackgold.baseline-recovery/v4.1" or manifest.get("project") != PROJECT:
        raise SystemExit("baseline manifest blocked")
    stage = root / manifest["target_stage"]
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = root / ".blackgold/backups" / f"baseline-v4.1-{stamp}"
    report_path = root / ".blackgold/reports/baseline-recovery-v4.1-latest.json"
    state_path = root / ".blackgold/state/baseline-v4.1.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "blackgold.baseline-recovery-report/v4.1",
        "project": PROJECT, "started_at": now(), "status": "running",
        "stage": str(stage), "backup": None, "releases": [], "materializers": []
    }
    stage_existed = stage.exists()
    try:
        quarantine_stale_tasks(root, report)
        if stage_existed:
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(stage, backup / "experience-v2.9")
            report["backup"] = str(backup / "experience-v2.9")
        repo, branch = manifest["repo"], manifest["branch"]
        for spec in manifest["bootstrap_releases"]:
            apply_release(root, repo, branch, spec, report)
        for rel in manifest["materializers_before_overlays"]:
            run_materializer(root, rel, report)
        for spec in manifest["pre_guide_overlays"]:
            apply_release(root, repo, branch, spec, report)
        run_materializer(root, manifest["guide_materializer"], report)
        for spec in manifest["post_guide_overlays"]:
            apply_release(root, repo, branch, spec, report)
        verify_stage(root, manifest, report)
        orchestrator_src = tool_dir / "orchestrator_v41.py"
        orchestrator_dest = root / "tools/blackgold_orchestrator/blackgold_orchestrator.py"
        atomic_write(orchestrator_dest, orchestrator_src.read_bytes())
        report["status"] = "installed"
        report["completed_at"] = now()
        state = {
            "schema": "blackgold.baseline-state/v4.1",
            "project": PROJECT, "baseline": "4.1.0",
            "installed_at": report["completed_at"],
            "stage": str(stage), "commercial_default": "deny",
            "verified_commercial_routes": 0
        }
        atomic_write(state_path, json.dumps(state, ensure_ascii=False, indent=2).encode("utf-8"))
        atomic_write(report_path, json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8"))
        return 0
    except Exception as exc:
        report["status"] = "failed"
        report["error"] = str(exc)
        report["failed_at"] = now()
        try:
            if stage.exists():
                shutil.rmtree(stage)
            if stage_existed and (backup / "experience-v2.9").exists():
                shutil.copytree(backup / "experience-v2.9", stage)
            orchestrator_src = tool_dir / "orchestrator_v41.py"
            if orchestrator_src.exists():
                atomic_write(root / "tools/blackgold_orchestrator/blackgold_orchestrator.py", orchestrator_src.read_bytes())
            report["rollback"] = "completed"
        except Exception as rollback_error:
            report["rollback"] = "failed"
            report["rollback_error"] = str(rollback_error)
        atomic_write(report_path, json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8"))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
