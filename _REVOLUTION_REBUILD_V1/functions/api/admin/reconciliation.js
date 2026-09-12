function authorized(request,env){
  const token=request.headers.get('x-admin-token')||'';
  return !!env.BG_ADMIN_TOKEN&&token===env.BG_ADMIN_TOKEN;
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});

async function getEvidence(env,id){
  return env.DB.prepare(`SELECT r.*,p.title_pt,p.marketplace_item_id,p.marketplace_catalog_product_id,p.marketplace_identity_status
    FROM marketplace_reconciliation r JOIN products p ON p.id=r.product_id WHERE r.id=?`).bind(id).first();
}

export async function onRequestGet({request,env}){
  if(!authorized(request,env))return json({error:'unauthorized'},401);
  const rows=await env.DB.prepare(`SELECT r.*,p.title_pt,p.marketplace_item_id,p.marketplace_catalog_product_id,p.marketplace_identity_status
    FROM marketplace_reconciliation r JOIN products p ON p.id=r.product_id
    ORDER BY CASE r.review_status WHEN 'pending_review' THEN 0 ELSE 1 END,
      CASE r.classification WHEN 'conflict' THEN 0 WHEN 'probable' THEN 1 WHEN 'unresolved' THEN 2 ELSE 3 END,
      r.confidence DESC,r.product_id`).all();
  return json({evidence:rows.results||[]});
}

export async function onRequestPost({request,env}){
  if(!authorized(request,env))return json({error:'unauthorized'},401);
  const body=await request.json().catch(()=>({}));
  const id=String(body.id||''),action=String(body.action||'');
  if(!id||!['accept','reject'].includes(action))return json({error:'invalid_review_action'},400);
  const before=await getEvidence(env,id);
  if(!before)return json({error:'not_found'},404);
  if(before.review_status!=='pending_review')return json({error:'already_reviewed'},409);

  const now=new Date().toISOString();
  if(action==='reject'){
    await env.DB.batch([
      env.DB.prepare(`UPDATE marketplace_reconciliation SET review_status='rejected',reviewed_by='admin',reviewed_at=?,updated_at=? WHERE id=?`).bind(now,now,id),
      env.DB.prepare(`INSERT INTO admin_audit(action,entity_type,entity_id,actor,before_json,after_json) VALUES('reject_reconciliation','marketplace_reconciliation',?,'admin',?,?)`).bind(id,JSON.stringify(before),JSON.stringify({review_status:'rejected'}))
    ]);
    return json({ok:true,id,review_status:'rejected'});
  }

  if(!before.candidate_item_id&&!before.candidate_catalog_product_id)return json({error:'no_candidate_identity'},400);
  if(before.classification==='conflict'||before.classification==='unresolved')return json({error:'candidate_not_accept_ready'},409);
  const nextStatus=before.candidate_item_id?'declared':'catalog_only';
  const reason=before.candidate_item_id?'reconciliation_item_accepted_pending_api_verification':'reconciliation_catalog_accepted_pending_item_verification';
  await env.DB.batch([
    env.DB.prepare(`UPDATE marketplace_reconciliation SET review_status='superseded',updated_at=? WHERE product_id=? AND id<>? AND review_status='accepted'`).bind(now,before.product_id,id),
    env.DB.prepare(`UPDATE marketplace_reconciliation SET review_status='accepted',reviewed_by='admin',reviewed_at=?,updated_at=? WHERE id=?`).bind(now,now,id),
    env.DB.prepare(`UPDATE products SET marketplace_item_id=COALESCE(?,marketplace_item_id),marketplace_catalog_product_id=COALESCE(?,marketplace_catalog_product_id),marketplace_identity_status=?,marketplace_last_checked_at=NULL,marketplace_last_reason=?,updated_at=? WHERE id=?`).bind(before.candidate_item_id||null,before.candidate_catalog_product_id||null,nextStatus,reason,now,before.product_id),
    env.DB.prepare(`INSERT INTO admin_audit(action,entity_type,entity_id,actor,before_json,after_json) VALUES('accept_reconciliation','marketplace_reconciliation',?,'admin',?,?)`).bind(id,JSON.stringify(before),JSON.stringify({review_status:'accepted',identity_status:nextStatus}))
  ]);
  return json({ok:true,id,product_id:before.product_id,review_status:'accepted',identity_status:nextStatus});
}