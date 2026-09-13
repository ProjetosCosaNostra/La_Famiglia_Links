function authorized(request,env){
  const token=request.headers.get('x-admin-token')||'';
  return !!env.BG_ADMIN_TOKEN&&token===env.BG_ADMIN_TOKEN;
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const allowedChannels=new Set(['site_daily','instagram','facebook','youtube','telegram','tiktok','pinterest','kwai']);
const allowedPolicies=new Set(['REVIEW_REQUIRED','ALLOWED','INTERNAL_ALLOWED']);

export async function onRequestGet({request,env}){
  if(!authorized(request,env)) return json({error:'unauthorized'},401);
  const channels=await env.DB.prepare(`SELECT * FROM channel_state ORDER BY channel`).all();
  const defaults=[['site_daily','INTERNAL_ALLOWED',1,1],['instagram','REVIEW_REQUIRED',0,0],['facebook','REVIEW_REQUIRED',0,0],['youtube','REVIEW_REQUIRED',0,0],['telegram','REVIEW_REQUIRED',0,0],['tiktok','REVIEW_REQUIRED',0,0],['pinterest','REVIEW_REQUIRED',0,0],['kwai','REVIEW_REQUIRED',0,0]];
  const merged=defaults.map(([channel,policy_status,configured,live_enabled])=>{
    const stored=(channels.results||[]).find(x=>x.channel===channel)||{channel,policy_status,configured,live_enabled,last_publish_at:null,last_error:null};
    if(channel==='site_daily') return {...stored,policy_status:'INTERNAL_ALLOWED',configured:1,live_enabled:stored.live_enabled?1:0};
    const normalizedPolicy=stored.policy_status==='ALLOWED'?'ALLOWED':'REVIEW_REQUIRED';
    const normalizedConfigured=stored.configured?1:0;
    return {...stored,policy_status:normalizedPolicy,configured:normalizedConfigured,live_enabled:(normalizedPolicy==='ALLOWED'&&normalizedConfigured&&stored.live_enabled)?1:0};
  });
  const runs=await env.DB.prepare(`SELECT id,run_type,status,summary_json,started_at,finished_at FROM worker_runs ORDER BY id DESC LIMIT 20`).all();
  const links=await env.DB.prepare(`SELECT health_status,COUNT(*) count FROM product_links WHERE is_active=1 GROUP BY health_status`).all();
  return json({channels:merged,runs:runs.results||[],link_health:links.results||[],worker_configured:!!env.WORKER});
}
async function callWorker(env,path){
  if(!env.WORKER) return {error:'worker_not_configured',status:503};
  const request=new Request(`https://blackgold-worker.internal${path}`,{method:'POST',headers:{'x-bg-service':'pages-admin-v1'}});
  const r=await env.WORKER.fetch(request);
  const body=await r.json().catch(()=>({}));
  if(!r.ok) return {error:body.error||`worker_http_${r.status}`,status:r.status};
  return {body,status:200};
}

export async function onRequestPost({request,env}){
  if(!authorized(request,env)) return json({error:'unauthorized'},401);
  const body=await request.json().catch(()=>({}));
  if(body.action==='run_link_guardian'){
    const out=await callWorker(env,'/run/link-guardian');
    return out.error?json({error:out.error},out.status):json({ok:true,result:out.body});
  }
  if(body.action==='run_daily_selection'){
    const out=await callWorker(env,'/run/daily-selection');
    return out.error?json({error:out.error},out.status):json({ok:true,result:out.body});
  }
  if(body.action==='update_channel'){
    const channel=String(body.channel||'').toLowerCase();
    if(!allowedChannels.has(channel)) return json({error:'invalid_channel'},400);
    let policy=String(body.policy_status||'REVIEW_REQUIRED');
    if(!allowedPolicies.has(policy)) return json({error:'invalid_policy'},400);
    let configured=body.configured?1:0;
    const requestedLive=body.live_enabled?1:0;
    if(channel==='site_daily'){ policy='INTERNAL_ALLOWED'; configured=1; }
    else if(policy==='INTERNAL_ALLOWED') return json({error:'internal_policy_reserved'},400);
    const live=channel==='site_daily' ? requestedLive : (policy==='ALLOWED' && configured ? requestedLive : 0);
    await env.DB.prepare(`INSERT INTO channel_state(channel,policy_status,configured,live_enabled,last_error) VALUES(?,?,?,?,NULL)
      ON CONFLICT(channel) DO UPDATE SET policy_status=excluded.policy_status,configured=excluded.configured,live_enabled=excluded.live_enabled`).bind(channel,policy,configured,live).run();
    await env.DB.prepare(`INSERT INTO admin_audit(action,entity_type,entity_id,actor,after_json) VALUES('channel_update','channel',?,'admin',?)`).bind(channel,JSON.stringify({policy_status:policy,configured:!!configured,live_enabled:!!live})).run();
    return json({ok:true,channel,policy_status:policy,configured:!!configured,live_enabled:!!live});
  }
  return json({error:'unknown_action'},400);
}