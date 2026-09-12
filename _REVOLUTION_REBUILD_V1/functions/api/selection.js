export async function onRequestGet({env}){
  const today=new Date().toISOString().slice(0,10);
  const rows=await env.DB.prepare(`
    SELECT c.id AS campaign_id,c.product_id,c.score,c.decision_json,p.title_pt AS name,p.category,p.image_path AS image
    FROM campaigns c JOIN products p ON p.id=c.product_id
    WHERE c.campaign_date=? AND c.channel='site_daily' AND c.status IN ('prepared','published')
      AND p.status='active' AND p.affiliate_ready=1 AND p.image_status='approved'
      AND p.marketplace_identity_status='catalog_verified'
      AND datetime(p.marketplace_last_checked_at)>=datetime('now','-18 hours')
      AND EXISTS(SELECT 1 FROM product_links l WHERE l.product_id=p.id AND l.is_active=1
        AND l.health_status='verified' AND l.variant_match=1 AND l.marketplace_identity_status='verified_exact'
        AND datetime(l.marketplace_last_checked_at)>=datetime('now','-18 hours')
        AND l.marketplace_catalog_product_id=p.marketplace_catalog_product_id)
    ORDER BY c.score DESC,c.id ASC LIMIT 3
  `).bind(today).all();
  return Response.json({date:today,selection:rows.results||[]},{headers:{'cache-control':'public,max-age=300'}});
}
