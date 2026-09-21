import {authorized} from "../../_lib/admin-auth.js";

const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

export async function onRequestGet(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  const limit=Math.max(1,Math.min(100,Number(new URL(context.request.url).searchParams.get("limit")||50)));
  try{
    const result=await context.env.BG_DB.prepare(
      `SELECT pr.id,pr.product_id,pr.snapshot_json,pr.created_at,
              rma.archive_key,rma.original_key,rma.restored_at
       FROM product_revisions pr
       LEFT JOIN revision_media_archives rma ON rma.revision_id=pr.id
       WHERE pr.reason='delete'
         AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id=pr.product_id)
       ORDER BY pr.created_at DESC
       LIMIT ?`
    ).bind(limit).all();

    const items=(result.results||[]).map(row=>{
      let snapshot={};
      try{snapshot=JSON.parse(row.snapshot_json||"{}")}catch{}
      return {
        revisionId:row.id,
        productId:row.product_id,
        deletedAt:row.created_at,
        title:snapshot.title||"Produto",
        brand:snapshot.brand||"",
        category:snapshot.category||"",
        status:snapshot.status||"draft",
        featured:Boolean(snapshot.featured),
        order:Number(snapshot.sort_order||0),
        imageKey:snapshot.image_key||"",
        imageUrl:snapshot.image_url||"",
        imageArchived:Boolean(row.archive_key),
        imageRecoverable:Boolean(row.archive_key||snapshot.image_url),
        archiveKey:row.archive_key||"",
        restoredAt:row.restored_at||null
      };
    });
    return json({ok:true,total:items.length,items});
  }catch(error){
    return json({ok:false,code:"trash_unavailable",message:String(error?.message||error)},500);
  }
}
