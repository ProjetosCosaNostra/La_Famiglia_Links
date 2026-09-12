function authorized(request,env){
  const token=request.headers.get('x-admin-token')||'';
  return !!env.BG_ADMIN_TOKEN&&token===env.BG_ADMIN_TOKEN;
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});

async function getEvidence(env,id){
  return env.DB.prepare(`SELECT r.*,p.title_pt,p.marketplace_catalog_product_id,p.marketplace_identity_status,p.marketplace_last_checked_at,p.marketplace_last_reason
    FROM marketplace_reconciliation r JOIN products p ON p.id=r.product_id WHERE r.id=?`).bind(id).first();
}

export async function onRequestGet({request,env}){
  if(!authorized(request,env))return json({error:'unauthorized'},401);
  const rows=await env.DB.prepare(`SELECT r.*,p.title_pt,p.marketplace_catalog_product_id,p.marketplace_identity_status
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

  if(before.classification==='conflict'||before.classification==='unresolved')return json({error:'candidate_not_accept_ready'},409);
  if(!before.candidate_catalog_product_id){
    if(before.candidate_item_id)return json({error:'listing_identity_requires_link_slot'},409);
    return json({error:'no_catalog_candidate_identity'},400);
  }

  const catalogChanged=String(before.marketplace_catalog_product_id||'')!==String(before.candidate_catalog_product_id||'');
  const nextStatus=catalogChanged?'catalog_only':(before.marketplace_identity_status||'catalog_only');
  const reason=catalogChanged?'reconciliation_catalog_accepted_pending_listing_verification':(before.marketplace_last_reason||'reconciliation_catalog_accepted_identity_unchanged');
  const statements=[
    env.DB.prepare(`UPDATE marketplace_reconciliation SET review_status='superseded',updated_at=? WHERE product_id=? AND id<>? AND review_status='accepted'`).bind(now,before.product_id,id),
    env.DB.prepare(`UPDATE marketplace_reconciliation SET review_status='accepted',reviewed_by='admin',reviewed_at=?,updated_at=? WHERE id=?`).bind(now,now,id),
    env.DB.prepare(`UPDATE products SET marketplace_catalog_product_id=?,marketplace_identity_status=?,marketplace_last_checked_at=?,marketplace_last_reason=?,updated_at=? WHERE id=?`).bind(before.candidate_catalog_product_id,nextStatus,catalogChanged?null:before.marketplace_last_checked_at,reason,now,before.product_id)
  ];
  if(catalogChanged) statements.push(env.DB.prepare(`UPDATE product_links SET marketplace_catalog_product_id=NULL,marketplace_identity_status=CASE WHEN marketplace_item_id IS NULL OR marketplace_item_id='' THEN 'pending' ELSE 'declared' END,marketplace_seller_id=NULL,marketplace_seller_level=NULL,marketplace_last_checked_at=NULL,marketplace_last_reason='canonical_catalog_changed_by_reconciliation',health_status='unknown',variant_match=0,fail_count=0,last_checked_at=NULL,last_ok_at=NULL,last_http_status=NULL,last_reason=NULL,last_final_url=NULL,last_title=NULL WHERE product_id=?`).bind(before.product_id));
  statements.push(env.DB.prepare(`INSERT INTO admin_audit(action,entity_type,entity_id,actor,before_json,after_json) VALUES('accept_reconciliation','marketplace_reconciliation',?,'admin',?,?)`).bind(id,JSON.stringify(before),JSON.stringify({review_status:'accepted',catalog_product_id:before.candidate_catalog_product_id,identity_status:nextStatus,catalog_changed:catalogChanged})));
  await env.DB.batch(statements);
  return json({ok:true,id,product_id:before.product_id,review_status:'accepted',catalog_product_id:before.candidate_catalog_product_id,identity_status:nextStatus,catalog_changed:catalogChanged});
}