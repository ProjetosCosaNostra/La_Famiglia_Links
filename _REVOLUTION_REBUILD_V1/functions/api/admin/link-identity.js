function authorized(request,env){
  const token=request.headers.get('x-admin-token')||'';
  return !!env.BG_ADMIN_TOKEN&&token===env.BG_ADMIN_TOKEN;
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const cleanItem=v=>{const s=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return !s?null:/^MLB\d{6,}$/.test(s)?s:false};
const cleanVariation=v=>{const s=String(v||'').trim();return !s?null:/^\d+$/.test(s)?s:false};

export async function onRequestPost({request,env}){
  if(!authorized(request,env))return json({error:'unauthorized'},401);
  const body=await request.json().catch(()=>({}));
  const productId=String(body.product_id||''),slot=Number(body.slot);
  if(!productId||!Number.isInteger(slot)||slot<1||slot>5)return json({error:'invalid_product_or_slot'},400);
  const itemId=cleanItem(body.marketplace_item_id),variationId=cleanVariation(body.marketplace_variation_id);
  if(itemId===false)return json({error:'invalid_marketplace_item_id'},400);
  if(variationId===false)return json({error:'invalid_marketplace_variation_id'},400);

  const before=await env.DB.prepare(`SELECT l.*,p.marketplace_catalog_product_id AS canonical_catalog_product_id
    FROM product_links l JOIN products p ON p.id=l.product_id WHERE l.product_id=? AND l.slot=?`).bind(productId,slot).first();
  if(!before)return json({error:'link_slot_not_found'},404);
  const changed=String(before.marketplace_item_id||'')!==String(itemId||'')||String(before.marketplace_variation_id||'')!==String(variationId||'');
  if(!changed)return json({ok:true,unchanged:true,product_id:productId,slot});

  const now=new Date().toISOString(),status=itemId?'declared':'pending';
  await env.DB.batch([
    env.DB.prepare(`UPDATE product_links SET marketplace_item_id=?,marketplace_variation_id=?,marketplace_catalog_product_id=NULL,
      marketplace_identity_status=?,marketplace_seller_id=NULL,marketplace_seller_level=NULL,marketplace_last_checked_at=NULL,
      marketplace_last_reason='listing_identity_changed_pending_verification',health_status='unknown',variant_match=0,
      last_checked_at=NULL,last_ok_at=NULL,last_http_status=NULL,last_reason=NULL,last_final_url=NULL,last_title=NULL,fail_count=0
      WHERE product_id=? AND slot=?`).bind(itemId,variationId,status,productId,slot),
    env.DB.prepare(`INSERT INTO admin_audit(action,entity_type,entity_id,actor,before_json,after_json) VALUES('update_link_identity','product_link',?,'admin',?,?)`)
      .bind(`${productId}:${slot}`,JSON.stringify(before),JSON.stringify({marketplace_item_id:itemId,marketplace_variation_id:variationId,marketplace_identity_status:status,updated_at:now}))
  ]);
  return json({ok:true,product_id:productId,slot,marketplace_item_id:itemId,marketplace_variation_id:variationId,marketplace_identity_status:status});
}