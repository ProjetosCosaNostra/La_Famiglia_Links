import argparse, json
from pathlib import Path

ap=argparse.ArgumentParser()
ap.add_argument('--zero', required=True)
ap.add_argument('--semantic', required=True)
ap.add_argument('--runtime', required=True)
ap.add_argument('--output', required=True)
ap.add_argument('--staging-commit', default='local')
ap.add_argument('--production-lock', required=True)
a=ap.parse_args()

zero=json.loads(Path(a.zero).read_text(encoding='utf-8'))
semantic=json.loads(Path(a.semantic).read_text(encoding='utf-8'))
runtime=json.loads(Path(a.runtime).read_text(encoding='utf-8'))
errors=[]

def require(ok,msg):
    if not ok: errors.append(msg)

require(zero.get('pass') is True,'zero-pixel gate is not PASS')
by_name={x.get('name'):x for x in zero.get('results',[])}
for name,dims in [('desktop',(1448,1086)),('mobile',(390,1152))]:
    r=by_name.get(name,{})
    require((r.get('width'),r.get('height'))==dims,f'{name} viewport mismatch')
    require(r.get('mismatch_pixels')==0,f'{name} mismatch_pixels != 0')
    require(r.get('mae')==0.0 and r.get('rmse')==0.0,f'{name} non-zero error metrics')
require(semantic.get('pass') is True,'semantic/hotspot gate is not PASS')
require(not semantic.get('errors'),'semantic/hotspot gate has errors')
require(int(semantic.get('hotspots',0))>=34,'semantic hotspot count below 34')

summary=runtime.get('summary',{})
require(summary.get('result')=='GREEN','runtime interaction matrix is not GREEN')
require(int(summary.get('fail',-1))==0,'runtime interaction matrix has failed tests')
require(int(summary.get('runtime_errors',-1))==0,'runtime interaction matrix has runtime errors')
require(int(summary.get('total',0))>=13,'runtime interaction matrix coverage below 13 tests')

report={
    'contract':'BLACKGOLD_MISSION1_PREAPPROVAL_GATE_V24',
    'status':'PASS_AWAITING_EXPLICIT_USER_APPROVAL' if not errors else 'BLOCKED',
    'pass':not errors,
    'staging_commit':a.staging_commit,
    'production_lock_sha':a.production_lock,
    'production_promotion_allowed':False,
    'explicit_user_approval_required':True,
    'visual':{
        'desktop_mismatch_pixels':by_name.get('desktop',{}).get('mismatch_pixels'),
        'mobile_mismatch_pixels':by_name.get('mobile',{}).get('mismatch_pixels'),
    },
    'semantic':{
        'hotspots':semantic.get('hotspots'),
        'warnings':semantic.get('warnings',[]),
    },
    'runtime':summary,
    'errors':errors,
    'note':'Technical Mission 1 gates passed, but production remains blocked until explicit visual approval by the user.'
}
Path(a.output).parent.mkdir(parents=True,exist_ok=True)
Path(a.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
