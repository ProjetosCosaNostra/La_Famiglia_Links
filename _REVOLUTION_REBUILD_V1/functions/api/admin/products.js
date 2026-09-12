function authorized(request,env){
  const token=request.headers.get('x-admin-token')||'';
  return !!env.BG_ADMIN_TOKEN&&token===env.BG_ADMIN_TOKEN;
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
function slugify(v,fallback=''){return String(v||fallback).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'')}
function affiliateUrl(value){try{const u=new URL(String(value||''));const h=u.hostname.toLowerCase();return u.protocol==='https:'&&(h==='meli.la'||h==='mercadolivre.com.br'||h.endsWith('.mercadolivre.com.br'))?u.href:null}catch{return null}}
const cleanMlb=v=>{const s=String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');return !s?null:/^MLB\d{6,}$/.test(s)?s:false};
const cleanVariation=v=>{const s=String(v||'').trim();return !s?null:/^\d+$/.test(s)?s:false};

function normalizeCatalog(body){
  const catalog=cleanMlb(body.marketplace_catalog_product_id);
  if(catalog===false)return {error:'invalid_marketplace_catalog_product_id'};
  const raw=String(body.marketplace_expected_attributes_json||'').trim();let attrs=null;
  if(raw){try{const parsed=JSON.parse(raw);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')return {error:'invalid_marketplace_expected_attributes'};attrs=JSON.stringify(parsed)}catch{return {error:'invalid_marketplace_expected_attributes_json'}}}
  return {catalog,attrs};
}
function normalizeLinks(body,fallbackFingerprint){
  const rows=[],seen=new Set();
  for(const item of (body.links||[]).slice(0,5)){
    if(!item?.url)continue;
    const slot=Number(item.slot),url=affiliateUrl(item.url),itemId=cleanMlb(item.marketplace_item_id||item.item_id),variationId=cleanVariation(item.marketplace_variation_id||item.variation_id);
    if(!Number.isInteger(slot)||slot<1||slot>5||seen.has(slot))return {error:'invalid_or_duplicate_link_slot'};
    if(!url)return {error:'invalid_affiliate_url'};
    if(itemId===false)return {error:'invalid_marketplace_item_id'};
    if(variationId===false)return {error:'invalid_marketplace_variation_id'};
    seen.add(slot);rows.push({slot,url,fingerprint:String(item.fingerprint||fallbackFingerprint||'').trim(),itemId,variationId});
  }
  return {rows};
}
async function current(env,id){
  const product=await env.DB.prepare(`SELECT * FROM products WHERE id=?`).bind(id).first();if(!product)return null;
  const links=await env.DB.prepare(`SELECT * FROM product_links WHERE product_id=? ORDER BY slot`).bind(id).all();return {...product,links:links.results||[]};
}

export async function onRequestGet({request,env}){
  if(!authorized(request,env))return json({error:'unauthorized'},401);
  const products=await env.DB.prepare(`SELECT id FROM products ORDER BY updated_at DESC`).all();const out=[];
  for(const p of products.results||[])out.push(await current(env,p.id));
  return json({products:out});
}

export async function onRequestPost({request,env}){
  if(!authorized(request,env))return json({error:'unauthorized'},401);
  const body=await request.json().catch(()=>({}));if(!body.title_pt||!body.category)return json({error:'title_pt_and_category_required'},400);
  const id=String(body.id||crypto.randomUUID()),slug=slugify(body.slug,id),catalog=normalizeCatalog(body),links=normalizeLinks(body,slug);
  if(catalog.error)return json({error:catalog.error},400);if(links.error)return json({error:links.error},400);
  const now=new Date().toISOString(),statements=[];
  statements.push(env.DB.prepare(`INSERT INTO products(id,slug,title_pt,title_en,title_es,brand,category,description_pt,status,market,affiliate_ready,featured,image_path,image_status,created_at,updated_at,marketplace_site_id,marketplace_catalog_product_id,marketplace_identity_status,marketplace_expected_attributes_json,marketplace_last_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,slug,body.title_pt,body.title_en||null,body.title_es||null,body.brand||null,body.category,body.description_pt||null,body.status||'draft','BR',body.affiliate_ready?1:0,body.featured?1:0,body.image_path||null,body.image_status||'pending',now,now,'MLB',catalog.catalog,catalog.catalog?'catalog_only':'pending',catalog.attrs,catalog.catalog?'catalog_declared_pending_verification':'catalog_identity_missing'));
  for(const row of links.rows){
    statements.push(env.DB.prepare(`INSERT INTO product_links(product_id,slot,affiliate_url,priority,health_status,fail_count,variant_fingerprint,is_active,variant_match,marketplace_item_id,marketplace_variation_id,marketplace_identity_status,marketplace_last_reason)
      VALUES(?,?,?,?,'unknown',0,?,1,0,?,?,?,?)`).bind(id,row.slot,row.url,row.slot,row.fingerprint,row.itemId,row.variationId,row.itemId?'declared':'pending',row.itemId?'listing_declared_pending_verification':'listing_identity_missing'));
  }
  const audit={...body,slug,marketplace_catalog_product_id:catalog.catalog,marketplace_expected_attributes_json:catalog.attrs,links:links.rows};
  statements.push(env.DB.prepare(`INSERT INTO admin_audit(action,entity_type,entity_id,actor,after_json) VALUES('create','product',?,'admin',?)`).bind(id,JSON.stringify(audit)));
  await env.DB.batch(statements);return json({ok:true,id,product:await current(env,id)},201);
}