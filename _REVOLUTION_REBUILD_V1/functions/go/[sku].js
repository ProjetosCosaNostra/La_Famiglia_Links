const clean=v=>String(v||'').replace(/[^a-zA-Z0-9_.:-]/g,'').slice(0,120);
const json=(data,status)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
function allowedOfferUrl(value){
  try{
    const u=new URL(String(value||'')),h=u.hostname.toLowerCase();
    return u.protocol==='https:'&&(h==='meli.la'||h==='mercadolivre.com.br'||h.endsWith('.mercadolivre.com.br'))?u:null;
  }catch{return null}
}

export async function onRequestGet({request,env,params}){
  const productId=String(params.sku||'');
  if(!productId)return json({error:'not_found'},404);
  const url=new URL(request.url);
  const channel=clean(url.searchParams.get('src')||'site')||'site';
  const campaignId=clean(url.searchParams.get('c')||'')||null;
  const placement=clean(url.searchParams.get('p')||'')||null;

  const row=await env.DB.prepare(`SELECT l.id AS link_id,l.slot,l.affiliate_url,l.marketplace_item_id,l.marketplace_variation_id,l.marketplace_catalog_product_id,
      p.marketplace_catalog_product_id AS canonical_catalog_product_id
    FROM product_links l JOIN products p ON p.id=l.product_id
    WHERE p.id=? AND p.status='active' AND p.market='BR' AND p.affiliate_ready=1
      AND p.marketplace_identity_status='catalog_verified'
      AND p.marketplace_catalog_product_id IS NOT NULL
      AND l.is_active=1 AND l.health_status IN ('healthy','verified') AND l.variant_match=1
      AND l.marketplace_identity_status='verified_exact'
      AND l.marketplace_catalog_product_id=p.marketplace_catalog_product_id
    ORDER BY CASE l.health_status WHEN 'verified' THEN 0 ELSE 1 END,l.priority,l.slot LIMIT 1`).bind(productId).first();

  if(!row?.affiliate_url)return json({error:'offer_unavailable'},404);
  const target=allowedOfferUrl(row.affiliate_url);
  if(!target)return json({error:'invalid_offer_url'},503);

  const metadata={placement,link_id:row.link_id,link_slot:row.slot,item_id:row.marketplace_item_id||null,variation_id:row.marketplace_variation_id||null,catalog_product_id:row.marketplace_catalog_product_id||null};
  await env.DB.prepare(`INSERT INTO events(event_type,product_id,channel,campaign_id,active_link_slot,metadata_json) VALUES('outbound_click',?,?,?,?,?)`)
    .bind(productId,channel,campaignId,row.slot,JSON.stringify(metadata)).run();

  return Response.redirect(target.href,302);
}