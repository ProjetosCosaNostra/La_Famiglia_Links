const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

function authorized(context){
  const expected=String(context.env.ADMIN_PANEL_TOKEN||"").trim();
  const supplied=(context.request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  return Boolean(expected&&supplied&&expected===supplied);
}

export async function onRequestGet(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  try{
    const summary=await context.env.BG_DB.prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN clicked_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) AS d1,
        SUM(CASE WHEN clicked_at >= datetime('now','-7 day') THEN 1 ELSE 0 END) AS d7,
        SUM(CASE WHEN clicked_at >= datetime('now','-30 day') THEN 1 ELSE 0 END) AS d30
       FROM outbound_clicks`
    ).first();

    const products=await context.env.BG_DB.prepare(
      `SELECT
        product_id AS productId,
        MAX(product_title) AS title,
        COUNT(*) AS total,
        SUM(CASE WHEN clicked_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) AS d1,
        SUM(CASE WHEN clicked_at >= datetime('now','-7 day') THEN 1 ELSE 0 END) AS d7,
        SUM(CASE WHEN clicked_at >= datetime('now','-30 day') THEN 1 ELSE 0 END) AS d30
       FROM outbound_clicks
       GROUP BY product_id
       ORDER BY d30 DESC,total DESC,title ASC
       LIMIT 200`
    ).all();

    const placement=await context.env.BG_DB.prepare(
      `SELECT placement,COUNT(*) AS total
       FROM outbound_clicks
       GROUP BY placement
       ORDER BY total DESC`
    ).all();

    return json({
      ok:true,
      privacy:"No IP address, user agent, email, cookie, or personal identifier is stored by this endpoint.",
      summary:{
        d1:Number(summary?.d1||0),
        d7:Number(summary?.d7||0),
        d30:Number(summary?.d30||0),
        total:Number(summary?.total||0)
      },
      products:(products.results||[]).map(x=>({
        productId:x.productId,
        title:x.title||"",
        d1:Number(x.d1||0),
        d7:Number(x.d7||0),
        d30:Number(x.d30||0),
        total:Number(x.total||0)
      })),
      placement:(placement.results||[]).map(x=>({
        placement:x.placement||"unknown",
        total:Number(x.total||0)
      }))
    });
  }catch(error){
    return json({ok:false,code:"metrics_unavailable",message:String(error?.message||error)},500);
  }
}
