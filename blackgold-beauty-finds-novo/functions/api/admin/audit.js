import {authorized} from "../../_lib/admin-auth.js";

const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
export async function onRequestGet(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  try{
    const limit=Math.max(1,Math.min(200,Number(new URL(context.request.url).searchParams.get("limit")||50)));
    const result=await context.env.BG_DB.prepare(
      "SELECT id,event_type,product_id,detail_json,created_at FROM audit_events ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all();
    const events=(result.results||[]).map(row=>({
      id:row.id,
      type:row.event_type,
      productId:row.product_id||null,
      detail:(()=>{try{return JSON.parse(row.detail_json||"{}")}catch{return {raw:row.detail_json||""}}})(),
      createdAt:row.created_at
    }));
    return json({ok:true,total:events.length,events});
  }catch(error){
    return json({ok:false,code:"audit_unavailable",message:String(error?.message||error)},500);
  }
}
