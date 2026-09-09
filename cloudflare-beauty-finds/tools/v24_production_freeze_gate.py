import argparse, json
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--production-current', required=True)
ap.add_argument('--production-lock', required=True)
ap.add_argument('--sync-enabled', default='')
ap.add_argument('--sync-workflow', required=True)
ap.add_argument('--output', required=True)
a = ap.parse_args()

errors = []
def require(ok, msg):
    if not ok:
        errors.append(msg)

workflow = Path(a.sync_workflow).read_text(encoding='utf-8')
sync_enabled = str(a.sync_enabled or '').strip().lower() == 'true'
require(a.production_current == a.production_lock, 'production branch SHA moved outside approved lock')
require(not sync_enabled, 'BLACKGOLD_PRODUCTION_SYNC_ENABLED must remain false before explicit user approval')
require('BLACKGOLD_PRODUCTION_FREEZE=ACTIVE' in workflow, 'active gh-pages sync workflow is missing freeze marker')
require("vars.BLACKGOLD_PRODUCTION_SYNC_ENABLED == 'true'" in workflow, 'active gh-pages sync workflow is missing explicit enable condition')
require('needs: freeze-status' in workflow, 'catalog sync does not depend on freeze-status gate')

report = {
    'contract': 'BLACKGOLD_PRODUCTION_FREEZE_GATE_V1',
    'pass': not errors,
    'production_current_sha': a.production_current,
    'production_lock_sha': a.production_lock,
    'production_sha_locked': a.production_current == a.production_lock,
    'production_sync_enabled': sync_enabled,
    'gh_pages_freeze_guard_present': 'BLACKGOLD_PRODUCTION_FREEZE=ACTIVE' in workflow,
    'explicit_enable_condition_present': "vars.BLACKGOLD_PRODUCTION_SYNC_ENABLED == 'true'" in workflow,
    'production_promotion_allowed': False,
    'errors': errors,
}
Path(a.output).parent.mkdir(parents=True, exist_ok=True)
Path(a.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
