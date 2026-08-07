from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

PROJECT = "BlackGold Beauty Finds"
ALLOWED = {
    "intelligence.audit",
    "intelligence.inventory",
    "intelligence.validate",
    "guard.audit",
    "experience.build",
    "experience.lab",
    "experience.lab.bootstrap",
}


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return default


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def append(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(value, ensure_ascii=False) + "\n")


def run(command, root, timeout):
    process = subprocess.run(
        command,
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )
    return {
        "passed": process.returncode == 0,
        "exit_code": process.returncode,
        "stdout": process.stdout[-40000:],
        "stderr": process.stderr[-40000:],
    }


def execute(root: Path, task: dict):
    command = str(task["command"])
    timeout = int(task.get("timeout_seconds", 300))

    if command.startswith("intelligence."):
        tool = root / "tools" / "blackgold_intelligence" / "blackgold_intelligence.py"
        if not tool.exists():
            raise FileNotFoundError(tool)
        action = command.split(".", 1)[1]
        return run([sys.executable, str(tool), "--root", str(root), action], root, timeout)

    if command == "guard.audit":
        reports = sorted(
            (root / ".blackgold" / "reports").glob("guard_*.json"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        if not reports:
            return {"passed": False, "exit_code": 1, "stdout": "", "stderr": "guard report missing"}
        report = read(reports[0], {}) or {}
        errors = int(report.get("summary", {}).get("errors", 0))
        return {
            "passed": errors == 0,
            "exit_code": 0 if errors == 0 else 1,
            "stdout": json.dumps({"report": str(reports[0]), "errors": errors}, ensure_ascii=False),
            "stderr": "",
        }

    if command == "experience.build":
        tool = root / "tools" / "blackgold_build_pipeline" / "build.py"
        if not tool.exists():
            raise FileNotFoundError(tool)
        profile = str(task.get("profile", "data/experience/build-profile.v1.json"))
        return run([sys.executable, str(tool), "--root", str(root), "--profile", profile], root, timeout)

    if command == "experience.lab":
        tool = root / "tools" / "blackgold_experience_lab" / "lab.py"
        if not tool.exists():
            raise FileNotFoundError(tool)
        config = str(task.get("config", "data/experience/lab-config.v2.json"))
        return run([sys.executable, str(tool), "--root", str(root), "--config", config], root, timeout)

    if command == "experience.lab.bootstrap":
        tool = root / "tools" / "blackgold_module_sync" / "bootstrap_v2.py"
        if not tool.exists():
            raise FileNotFoundError(tool)
        manifest = str(task.get("manifest", "data/governance/remote-module-v2.json"))
        return run([sys.executable, str(tool), "--root", str(root), "--manifest", manifest], root, timeout)

    raise ValueError(f"unsupported command: {command}")


def validate(task):
    errors = []
    if not isinstance(task, dict):
        return ["task is not an object"]
    if task.get("schema") != "blackgold.task/v1":
        errors.append("invalid schema")
    if task.get("project") != PROJECT:
        errors.append("wrong project")
    if task.get("command") not in ALLOWED:
        errors.append("command not allowed")
    if any(task.get(key) for key in ("shell", "script", "arbitrary_command")):
        errors.append("arbitrary execution blocked")
    if not task.get("task_id"):
        errors.append("task_id missing")
    return errors


def move(path: Path, destination: Path):
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / path.name
    if target.exists():
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        target = destination / f"{path.stem}_{stamp}{path.suffix}"
    shutil.move(str(path), str(target))
    return target


def once(root: Path):
    bg = root / ".blackgold"
    tasks = bg / "tasks"
    pending, completed, failed = tasks / "pending", tasks / "completed", tasks / "failed"
    receipts = bg / "receipts"
    state_path = bg / "state" / "orchestrator-state.json"
    log = bg / "logs" / "orchestrator.jsonl"
    for directory in (pending, completed, failed, receipts, state_path.parent, log.parent):
        directory.mkdir(parents=True, exist_ok=True)

    state = read(state_path, {}) or {}
    completed_ids = set(map(str, state.get("completed_task_ids", [])))
    candidates = list(pending.glob("*.task.json")) + [p for p in tasks.glob("*.task.json") if p.is_file()]
    candidates = sorted(set(candidates), key=lambda p: (p.stat().st_mtime, p.name.lower()))

    summary = {
        "schema": "blackgold.orchestrator-run/v2",
        "started_at": now(),
        "processed": 0,
        "completed": 0,
        "failed": 0,
        "skipped": 0,
        "tasks": [],
    }

    for path in candidates:
        task = read(path)
        task_id = str(task.get("task_id", path.stem)) if isinstance(task, dict) else path.stem
        if task_id in completed_ids:
            final = move(path, completed)
            summary["processed"] += 1
            summary["skipped"] += 1
            summary["tasks"].append({"task_id": task_id, "status": "already_completed", "path": str(final)})
            continue

        errors = validate(task)
        if errors:
            final = move(path, failed)
            message = " | ".join(errors)
            append(bg / "memory" / "orchestrator-incidents.jsonl", {"timestamp": now(), "task_id": task_id, "class": "task_validation", "message": message})
            summary["processed"] += 1
            summary["failed"] += 1
            summary["tasks"].append({"task_id": task_id, "status": "failed_validation", "message": message})
            continue

        started = now()
        try:
            result = execute(root, task)
        except Exception as exc:
            result = {"passed": False, "exit_code": 1, "stdout": "", "stderr": f"{exc}\n{traceback.format_exc()}"}

        receipt = {"schema": "blackgold.task-receipt/v2", "task_id": task_id, "command": task["command"], "started_at": started, "finished_at": now(), **result}
        receipt_path = receipts / f"{task_id}.receipt.json"
        write(receipt_path, receipt)

        if result.get("passed"):
            final = move(path, completed)
            completed_ids.add(task_id)
            summary["completed"] += 1
            status = "completed"
        else:
            final = move(path, failed)
            message = result.get("stderr") or "task failed"
            append(bg / "memory" / "orchestrator-incidents.jsonl", {"timestamp": now(), "task_id": task_id, "class": "task_execution", "message": message})
            summary["failed"] += 1
            status = "failed_execution"

        summary["processed"] += 1
        summary["tasks"].append({"task_id": task_id, "status": status, "receipt": str(receipt_path.relative_to(root)), "path": str(final.relative_to(root))})
        append(log, {"timestamp": now(), "task_id": task_id, "command": task["command"], "status": status})

    state["completed_task_ids"] = sorted(completed_ids)
    state["last_run"] = now()
    state["last_summary"] = summary
    write(state_path, state)
    summary["finished_at"] = now()
    write(bg / "reports" / "orchestrator-latest.json", summary)
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    result = once(Path(args.root).resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
