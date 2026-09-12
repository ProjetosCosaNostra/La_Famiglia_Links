const iso=()=>new Date().toISOString();
const cleanMlb=v=>{const s=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return /^MLB\d{6,}$/.test(s)?s:null};
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const chunks=(xs,n=20)=>Array.from({length:Math.ceil(xs.length/n)},(_,i)=>xs.slice(i*n,(i+1)*n));

function attrMap(...groups){
  const out=new Map();
  for(const a of groups.flat().filter(Boolean)){
    const vals=[a.value_id,a.value_name,a.name,...(a.values||[]).flatMap(v=>[v?.id,v?.name])].filter(Boolean).map(norm);
    if(a.id)out.set(String(a.id).toUpperCase(),vals);
    if(a.name)out.set(norm(a.name),vals);
  }
  return out;
}
function expectedMatches(raw,map){
  if(!raw)return {ok:true,configured:false};
  let obj;try{obj=JSON.parse(raw)}catch{return {ok:false,configured:true,reason:'expected_attributes_invalid_json'}};
  if(!obj||Array.isArray(obj)||typeof obj!=='object')return {ok:false,configured:true,reason:'expected_attributes_invalid'};
  for(const [key,value] of Object.entries(obj)){
    const wanted=(Array.isArray(value)?value:[value]).map(norm).filter(Boolean);
    const actual=map.get(String(key).toUpperCase())||map.get(norm(key))||[];
    if(wanted.length&&!wanted.some(w=>actual.some(a=>a===w||a.includes(w)||w.includes(a))))return {ok:false,configured:true,reason:`attribute_mismatch:${key}`};
  }
  return {ok:true,configured:true};
}
async function apiJson(url,token){
  const r=await fetch(url,{headers:{accept:'application/json',authorization:`Bearer ${token}`}});
  const body=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(`ml_http_${r.status}`);
  return body;
}

export async function verifyCanonicalCatalog(env){
  if(!env.ML_ACCESS_TOKEN)return {status:'skipped',reason:'ml_access_token_missing',checked:0};
  const rows=await env.DB.prepare(`SELECT id,marketplace_catalog_product_id,marketplace_expected_attributes_json
    FROM products WHERE status='active' AND marketplace_catalog_product_id IS NOT NULL AND marketplace_catalog_product_id<>'' ORDER BY id`).all();
  const results=[];
  for(const p of rows.results||[]){
    const catalogId=cleanMlb(p.marketplace_catalog_product_id);
    if(!catalogId){results.push({product_id:p.id,status:'blocked',reason:'invalid_catalog_product_id'});continue}
    try{
      const body=await apiJson(`https://api.mercadolibre.com/products/${encodeURIComponent(catalogId)}`,env.ML_ACCESS_TOKEN);
      const attrs=expectedMatches(p.marketplace_expected_attributes_json,attrMap(body?.attributes||[]));
      const ok=body?.status==='active'&&attrs.ok;
      const reason=body?.status!=='active'?`catalog_status_${body?.status||'unknown'}`:!attrs.ok?attrs.reason:'ok';
      const identity=ok?'catalog_verified':'blocked';
      await env.DB.prepare(`UPDATE products SET marketplace_identity_status=?,marketplace_title=?,marketplace_last_checked_at=?,marketplace_last_reason=? WHERE id=?`)
        .bind(identity,body?.name||null,iso(),reason,p.id).run();
      results.push({product_id:p.id,catalog_product_id:catalogId,status:identity,reason});
    }catch(err){results.push({product_id:p.id,catalog_product_id:catalogId,status:'api_error',reason:String(err?.message||err)})}
  }
  return {status:results.some(x=>x.status==='api_error')?'completed_with_api_errors':'completed',checked:results.length,results};
}

async function bulkItems(ids,token){
  const out=[];
  for(const batch of chunks(ids,20))out.push(...await apiJson(`https://api.mercadolibre.com/items/bulk?ids=${encodeURIComponent(batch.join(','))}`,token));
  return out;
}
async function bulkUsers(ids,token){
  const out=[];
  for(const batch of chunks(ids,20))out.push(...await apiJson(`https://api.mercadolibre.com/users/bulk?ids=${encodeURIComponent(batch.join(','))}`,token));
  return out;
}

export async function verifyAffiliateListings(env){
  const run=await env.DB.prepare(`INSERT INTO worker_runs(run_type,status) VALUES('marketplace_link_guardian','running') RETURNING id`).first();
  if(!env.ML_ACCESS_TOKEN){
    const summary={status:'skipped',reason:'ml_access_token_missing',checked:0};
    await env.DB.prepare(`UPDATE worker_runs SET status='skipped',summary_json=?,finished_at=? WHERE id=?`).bind(JSON.stringify(summary),iso(),run?.id).run();
    return summary;
  }
  const rows=await env.DB.prepare(`SELECT l.id AS link_id,l.product_id,l.slot,l.marketplace_item_id,l.marketplace_variation_id,l.fail_count,
      p.marketplace_catalog_product_id AS canonical_catalog_product_id,p.marketplace_expected_attributes_json,p.marketplace_identity_status AS product_identity_status
    FROM product_links l JOIN products p ON p.id=l.product_id
    WHERE l.is_active=1 AND p.status='active' AND p.market='BR' AND p.affiliate_ready=1
      AND l.marketplace_item_id IS NOT NULL AND l.marketplace_item_id<>'' ORDER BY l.product_id,l.slot`).all();
  const links=rows.results||[];
  const ids=[...new Set(links.map(x=>cleanMlb(x.marketplace_item_id)).filter(Boolean))];
  let rawItems=[];
  try{rawItems=await bulkItems(ids,env.ML_ACCESS_TOKEN)}catch(err){
    const summary={status:'failed',reason:String(err?.message||err),checked:0};
    await env.DB.prepare(`UPDATE worker_runs SET status='failed',summary_json=?,finished_at=? WHERE id=?`).bind(JSON.stringify(summary),iso(),run?.id).run();
    return summary;
  }
  const byId=new Map(rawItems.map(x=>[cleanMlb(x?.id||x?.body?.id),x]));
  const sellerIds=[...new Set(rawItems.map(x=>x?.body?.seller_id).filter(Boolean).map(String))];
  let sellers=new Map();
  try{if(sellerIds.length){const raw=await bulkUsers(sellerIds,env.ML_ACCESS_TOKEN);sellers=new Map(raw.map(x=>[String(x?.id||x?.body?.id),x?.body||{}]))}}catch{}

  const results=[];
  for(const l of links){
    const itemId=cleanMlb(l.marketplace_item_id),entry=byId.get(itemId),body=entry?.body||{};
    let ok=Number(entry?.status_code||0)===200&&body.status==='active';
    let reason=!entry? 'item_missing_from_bulk' : Number(entry?.status_code||0)!==200?`item_http_${entry?.status_code||0}`:body.status!=='active'?`item_status_${body.status||'unknown'}`:'ok';
    const variation=l.marketplace_variation_id?(body.variations||[]).find(v=>String(v.id)===String(l.marketplace_variation_id)):null;
    if(ok&&l.marketplace_variation_id&&!variation){ok=false;reason='variation_mismatch'}
    const actualCatalog=cleanMlb(variation?.catalog_product_id||body.catalog_product_id);
    const canonicalCatalog=cleanMlb(l.canonical_catalog_product_id);
    if(ok&&l.product_identity_status!=='catalog_verified'){ok=false;reason='canonical_catalog_not_verified'}
    if(ok&&!canonicalCatalog){ok=false;reason='canonical_catalog_missing'}
    if(ok&&actualCatalog!==canonicalCatalog){ok=false;reason=`catalog_mismatch:${actualCatalog||'none'}`}
    const attrs=expectedMatches(l.marketplace_expected_attributes_json,attrMap(body.attributes||[],variation?.attribute_combinations||[],variation?.attributes||[]));
    if(ok&&!attrs.ok){ok=false;reason=attrs.reason}
    const seller=sellers.get(String(body.seller_id||''))||{};
    const sellerLevel=seller?.seller_reputation?.level_id||null;
    const status=ok?'verified_exact':'blocked',health=ok?'verified':'broken',failCount=ok?0:Number(l.fail_count||0)+1;
    await env.DB.prepare(`UPDATE product_links SET marketplace_catalog_product_id=?,marketplace_identity_status=?,marketplace_seller_id=?,marketplace_seller_level=?,
      marketplace_last_checked_at=?,marketplace_last_reason=?,health_status=?,variant_match=?,fail_count=?,last_checked_at=?,last_ok_at=CASE WHEN ?=1 THEN ? ELSE last_ok_at END
      WHERE id=?`).bind(actualCatalog,status,body.seller_id?String(body.seller_id):null,sellerLevel,iso(),reason,health,ok?1:0,failCount,iso(),ok?1:0,iso(),l.link_id).run();
    results.push({link_id:l.link_id,product_id:l.product_id,slot:l.slot,item_id:itemId,catalog_product_id:actualCatalog,status,reason,seller_level:sellerLevel});
  }
  const blocked=results.filter(x=>x.status==='blocked').length;
  const summary={status:blocked?'completed_with_failures':'completed',checked:results.length,verified:results.length-blocked,blocked,results};
  await env.DB.prepare(`UPDATE worker_runs SET status=?,summary_json=?,finished_at=? WHERE id=?`).bind(summary.status,JSON.stringify(summary),iso(),run?.id).run();
  return summary;
}