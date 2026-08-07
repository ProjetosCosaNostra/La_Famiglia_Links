from __future__ import annotations
import argparse,json,subprocess,sys,shutil
from pathlib import Path
P="BlackGold Beauty Finds"
A={"experience.constitution"}
def rr(cmd,root,t):
    p=subprocess.run(cmd,cwd=root,capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=t,check=False)
    return {"passed":p.returncode==0,"exit_code":p.returncode,"stdout":p.stdout[-20000:],"stderr":p.stderr[-20000:]}
def main():
    a=argparse.ArgumentParser();a.add_argument("--root",default=".");a.add_argument("--once",action="store_true");x=a.parse_args()
    root=Path(x.root).resolve();b=root/".blackgold";q=b/"tasks/pending";ok=b/"tasks/completed";bad=b/"tasks/failed";rec=b/"receipts"
    for d in(q,ok,bad,rec):d.mkdir(parents=True,exist_ok=True)
    failures=0
    for p in sorted(q.glob("*.task.json"),key=lambda z:z.stat().st_mtime):
        try:t=json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception:t={}
        tid=str(t.get("task_id",p.stem));cmd=t.get("command")
        valid=t.get("schema")=="blackgold.task/v1" and t.get("project")==P and cmd in A and not any(t.get(k) for k in("shell","script","arbitrary_command"))
        if valid:
            tool=root/"tools/blackgold_quality_constitution/constitution.py"
            res=rr([sys.executable,str(tool),"--root",str(root)],root,int(t.get("timeout_seconds",300))) if tool.exists() else {"passed":False,"exit_code":1,"stdout":"","stderr":"constitution tool missing"}
        else:
            res={"passed":False,"exit_code":1,"stdout":"","stderr":"task blocked"}
        (rec/f"{tid}.receipt.json").write_text(json.dumps({"schema":"blackgold.task-receipt/v2","task_id":tid,"command":cmd,**res},ensure_ascii=False,indent=2),encoding="utf-8")
        dest=(ok if res["passed"] else bad)/p.name
        if dest.exists():dest.unlink()
        shutil.move(str(p),str(dest));failures+=0 if res["passed"] else 1
    return 1 if failures else 0
if __name__=="__main__":raise SystemExit(main())
