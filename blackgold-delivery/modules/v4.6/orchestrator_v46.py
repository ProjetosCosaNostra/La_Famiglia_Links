from __future__ import annotations
import argparse, json, shutil, subprocess, sys
from pathlib import Path

PROJECT = "BlackGold Beauty Finds"
ACTIONS = {
    "experience.materialize": "tools/blackgold_real_experience_v27/materialize.py",
    "experience.materialize_campaigns": "tools/blackgold_real_experience_v29/materialize.py",
    "experience.materialize_guides": "tools/blackgold_guide_v36/materialize.py",
    "experience.recover_baseline": "tools/blackgold_baseline_v41/recover_baseline.py",
    "experience.recover_rolling_baseline": "tools/blackgold_rolling_baseline_v44/recover_rolling_baseline.py",
    "experience.audit_release_candidate": "tools/blackgold_release_gate_v42/release_gate.py",
    "experience.import_affiliate_candidates": "tools/blackgold_affiliate_activation_v46/import_proposals.py",
    "experience.promote_affiliate_candidate": "tools/blackgold_affiliate_activation_v46/promote_candidate.py",
}

def run(cmd, root, timeout):
    p = subprocess.run(cmd, cwd=root, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=timeout, check=False)
    return {"passed": p.returncode == 0, "exit_code": p.returncode,
            "stdout": p.stdout[-24000:], "stderr": p.stderr[-24000:]}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    b = root / ".blackgold"
    pending = b / "tasks/pending"
    completed = b / "tasks/completed"
    failed = b / "tasks/failed"
    receipts = b / "receipts"
    for d in (pending, completed, failed, receipts):
        d.mkdir(parents=True, exist_ok=True)

    failures = 0
    tasks = []
    for p in pending.glob("*.task.json"):
        try:
            t = json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception:
            t = {}
        tasks.append((int(t.get("priority", 100)), p.name, p, t))

    for _, _, p, t in sorted(tasks):
        if not p.exists():
            continue
        task_id = str(t.get("task_id", p.stem))
        action = t.get("command")
        valid = (
            t.get("schema") == "blackgold.task/v1"
            and t.get("project") == PROJECT
            and action in ACTIONS
            and not any(t.get(k) for k in ("shell", "script", "arbitrary_command"))
        )
        if valid:
            tool = root / ACTIONS[action]
            res = run([sys.executable, str(tool), "--root", str(root)], root,
                      int(t.get("timeout_seconds", 900))) if tool.exists() else {
                "passed": False, "exit_code": 1, "stdout": "",
                "stderr": "allowlisted tool missing"
            }
        else:
            res = {"passed": False, "exit_code": 1, "stdout": "",
                   "stderr": "task blocked by allowlist"}
        receipt = {"schema": "blackgold.task-receipt/v2", "task_id": task_id,
                   "command": action, **res}
        (receipts / f"{task_id}.receipt.json").write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
        dest = (completed if res["passed"] else failed) / p.name
        if dest.exists():
            dest.unlink()
        if p.exists():
            shutil.move(str(p), str(dest))
        failures += 0 if res["passed"] else 1
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
