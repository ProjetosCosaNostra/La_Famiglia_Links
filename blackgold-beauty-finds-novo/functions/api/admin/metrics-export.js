import {authorized} from "../../_lib/admin-auth.js";

const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';

export async function onRequestGet(context){
  if(!authorized(context))return new Response("unauthorized",{status:401,headers:{"cache-control":"no-store"}});
  try{
    const rows=await context.env.BG_DB.prepare(
      `SELECT
        product_id AS productId,
        MAX(product_title) AS title,
        COUNT(*) AS total,
        SUM(CASE WHEN clicked_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) AS d1,
        SUM(CASE WHEN clicked_at >= datetime('now','-7 day') THEN 1 ELSE 0 END) AS d7,
        SUM(CASE WHEN clicked_at >= datetime('now','-30 day') THEN 1 ELSE 0 END) AS d30
       FROM outbound_clicks
       GROUP BY product_id
       ORDER BY d30 DESC,total DESC,title ASC`
    ).all();

    const lines=[
      ["product_id","title","clicks_1d","clicks_7d","clicks_30d","clicks_total"].map(q).join(","),
      ...(rows.results||[]).map(r=>[
        r.productId||"",
        r.title||"",
        Number(r.d1||0),
        Number(r.d7||0),
        Number(r.d30||0),
        Number(r.total||0)
      ].map(q).join(","))
    ];

    const stamp=new Date().toISOString().slice(0,10);
    return new Response("\ufeff"+lines.join("\r\n")+"\r\n",{
      status:200,
      headers:{
        "content-type":"text/csv; charset=utf-8",
        "content-disposition":`attachment; filename="blackgold-click-metrics-${stamp}.csv"`,
        "cache-control":"no-store",
        "x-content-type-options":"nosniff"
      }
    });
  }catch(error){
    return new Response("metrics export unavailable",{status:500,headers:{"cache-control":"no-store"}});
  }
}
