import {verifyCanonicalCatalog,verifyAffiliateListings} from './marketplace_link_guardian.js';
const nowIso=()=>new Date().toISOString();
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});

async function marketplaceGuardian(env){
  const run=await env.DB.prepare(`INSERT INTO worker_runs(run_type,status) VALUES('marketplace_guardian','running') RETURNING id`).first();
  const catalog=await verifyCanonicalCatalog(env);
  const listings=await verifyAffiliateListings(env);
  let status='completed';
  if(catalog.status==='skipped'&&listings.status==='skipped')status='skipped';
  else if(listings.status==='failed')status='failed';
  else if(catalog.status==='completed_with_api_errors'||listings.status==='completed_with_failures')status='completed_with_failures';
  const summary={catalog,listings};
  await env.DB.prepare(`UPDATE worker_runs SET status=?,summary_json=?,finished_at=? WHERE id=?`).bind(status,JSON.stringify(summary),nowIso(),run?.id).run();
  return {ok:!['failed'].includes(status),status,...summary};
}

function scoreRow(row){
  const clicks=Number(row.clicks||0),impressions=Math.max(Number(row.impressions||0),1),days=Math.min(Number(row.days_since||30),21);
  const ctr=(clicks+1)/(impressions+20);
  const exploration=Math.sqrt(Math.log(Number(row.total_impressions||0)+2)/(impressions+1));
  const freshness=days/21,featured=row.featured?0.08:0,linkBonus=Math.min(Number(row.verified_links||0),5)*0.035;
  return ctr*2+exploration*.55+freshness*.35+featured+linkBonus;
}

async function dailySelection(env){
  const run=await env.DB.prepare(`INSERT INTO worker_runs(run_type,status) VALUES('daily_selection','running') RETURNING id`).first();
  const rows=await env.DB.prepare(`SELECT p.id,p.title_pt,p.category,p.featured,
      COUNT(DISTINCT l.id) verified_links,
      (SELECT COUNT(*) FROM events e WHERE e.product_id=p.id AND e.channel='site' AND e.event_type='outbound_click' AND e.created_at>=COALESCE((SELECT value FROM system_settings WHERE key='learning_epoch'),'2000-01-01')) clicks,
      (SELECT COUNT(*) FROM events e WHERE e.product_id=p.id AND e.channel='site' AND e.event_type='impression' AND e.created_at>=COALESCE((SELECT value FROM system_settings WHERE key='learning_epoch'),'2000-01-01')) impressions,
      (SELECT COUNT(*) FROM events e WHERE e.channel='site' AND e.event_type='impression' AND e.created_at>=COALESCE((SELECT value FROM system_settings WHERE key='learning_epoch'),'2000-01-01')) total_impressions,
      CAST(julianday('now')-julianday(COALESCE((SELECT MAX(c.campaign_date) FROM campaigns c WHERE c.product_id=p.id),'2000-01-01')) AS INTEGER) days_since
    FROM products p JOIN product_links l ON l.product_id=p.id
      AND l.is_active=1 AND l.health_status='verified' AND l.variant_match=1
      AND l.marketplace_identity_status='verified_exact'
      AND datetime(l.marketplace_last_checked_at)>=datetime('now','-18 hours')
      AND l.marketplace_catalog_product_id=p.marketplace_catalog_product_id
    WHERE p.status='active' AND p.market='BR' AND p.affiliate_ready=1 AND p.image_status='approved'
      AND p.marketplace_identity_status='catalog_verified' AND p.marketplace_catalog_product_id IS NOT NULL
      AND datetime(p.marketplace_last_checked_at)>=datetime('now','-18 hours')
    GROUP BY p.id HAVING verified_links>0`).all();
  const ranked=(rows.results||[]).map(r=>({...r,score:scoreRow(r)})).sort((a,b)=>b.score-a.score);
  const picked=[],used=new Set();
  for(const r of ranked){if(picked.length>=3)break;if(!used.has(r.category)||ranked.length<=3){picked.push(r);used.add(r.category)}}
  const day=new Date().toISOString().slice(0,10);
  for(const [i,r] of picked.entries()){
    const id=`bg-${day.replaceAll('-','')}-site-${i+1}`;
    await env.DB.prepare(`INSERT OR REPLACE INTO campaigns(id,campaign_date,channel,product_id,status,score,decision_json) VALUES(?,?,?,?,?,?,?)`)
      .bind(id,day,'site_daily',r.id,'prepared',r.score,JSON.stringify({category:r.category,clicks:r.clicks||0,impressions:r.impressions||0,verified_links:r.verified_links,days_since:r.days_since,identity_gate:'fresh_catalog_verified+fresh_verified_exact'})).run();
  }
  const summary={date:day,selected:picked.map(x=>({id:x.id,title:x.title_pt,category:x.category,score:x.score,clicks:x.clicks||0,impressions:x.impressions||0,verified_links:x.verified_links}))};
  await env.DB.prepare(`UPDATE worker_runs SET status='completed',summary_json=?,finished_at=? WHERE id=?`).bind(JSON.stringify(summary),nowIso(),run?.id).run();
  return summary;
}

export default{
  async scheduled(controller,env,ctx){
    if(controller.cron==='15 */6 * * *')ctx.waitUntil(marketplaceGuardian(env));
    else ctx.waitUntil(dailySelection(env));
  },
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return json({ok:true,worker:'blackgold-rebuild-v5',guardian:'catalog+listing-api',publishing:'prepare_only'});
    if(request.headers.get('x-bg-service')!=='pages-admin-v1')return json({error:'forbidden'},403);
    if(request.method!=='POST')return json({error:'method_not_allowed'},405);
    if(url.pathname==='/run/link-guardian'||url.pathname==='/run/marketplace-guardian')return json(await marketplaceGuardian(env));
    if(url.pathname==='/run/catalog-guardian')return json(await verifyCanonicalCatalog(env));
    if(url.pathname==='/run/listing-guardian')return json(await verifyAffiliateListings(env));
    if(url.pathname==='/run/daily-selection')return json(await dailySelection(env));
    return json({error:'not_found'},404);
  }
};