const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

function authorized(context){
  const expected=String(context.env.ADMIN_PANEL_TOKEN||"").trim();
  const supplied=(context.request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  return Boolean(expected&&supplied&&expected===supplied);
}

const TABLES={
  products:["id","slug","title","brand","category","description","currency","price_cents","image_key","image_url","destination_url","status","featured","sort_order","created_at","updated_at","published_at"],
  revisions:["id","product_id","snapshot_json","reason","created_at"],
  archives:["revision_id","product_id","original_key","archive_key","content_type","archived_at","restored_at"],
  audit:["id","event_type","product_id","detail_json","created_at"]
};

async function rows(db,sql){
  const r=await db.prepare(sql).all();
  return r.results||[];
}

export async function onRequestGet(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  try{
    const [products,revisions,archives,audit]=await Promise.all([
      rows(context.env.BG_DB,"SELECT * FROM products ORDER BY created_at ASC,id ASC"),
      rows(context.env.BG_DB,"SELECT * FROM product_revisions ORDER BY created_at ASC,id ASC"),
      rows(context.env.BG_DB,"SELECT * FROM revision_media_archives ORDER BY archived_at ASC,revision_id ASC"),
      rows(context.env.BG_DB,"SELECT * FROM audit_events ORDER BY created_at ASC,id ASC")
    ]);
    return json({
      ok:true,
      schema:"blackgold-db-snapshot-v1",
      createdAt:new Date().toISOString(),
      counts:{products:products.length,revisions:revisions.length,archives:archives.length,audit:audit.length},
      data:{products,revisions,archives,audit}
    });
  }catch(error){
    return json({ok:false,code:"snapshot_export_failed",message:String(error?.message||error)},500);
  }
}

function insertStatement(db,table,columns,row){
  const placeholders=columns.map(()=>"?").join(",");
  const values=columns.map(c=>row[c]??null);
  return db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`).bind(...values);
}

export async function onRequestPost(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  let body;try{body=await context.request.json()}catch{return json({ok:false,code:"invalid_json"},400)}
  if(body.confirm!=="RESTORE_BLACKGOLD_SNAPSHOT"){
    return json({ok:false,code:"restore_confirmation_required"},428);
  }
  const snap=body.snapshot||{};
  if(snap.schema!=="blackgold-db-snapshot-v1"||!snap.data){
    return json({ok:false,code:"unsupported_snapshot"},400);
  }
  try{
    const current=await context.env.BG_DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM product_revisions) AS revisions,
        (SELECT COUNT(*) FROM revision_media_archives) AS archives,
        (SELECT COUNT(*) FROM audit_events) AS audit`
    ).first();
    const occupied=Object.values(current||{}).some(v=>Number(v||0)>0);
    if(occupied){
      const allowed=String(context.env.ALLOW_DESTRUCTIVE_RESTORE||"").toLowerCase()==="true";
      if(!allowed||body.replace!==true||body.replaceConfirm!=="REPLACE_ALL_BLACKGOLD_DATA"){
        return json({
          ok:false,
          code:"destination_not_empty",
          message:"Restore destrutivo bloqueado neste ambiente.",
          counts:current
        },409);
      }
    }

    const d=snap.data;
    const statements=[
      context.env.BG_DB.prepare("DELETE FROM audit_events"),
      context.env.BG_DB.prepare("DELETE FROM revision_media_archives"),
      context.env.BG_DB.prepare("DELETE FROM product_revisions"),
      context.env.BG_DB.prepare("DELETE FROM products")
    ];
    for(const row of d.products||[])statements.push(insertStatement(context.env.BG_DB,"products",TABLES.products,row));
    for(const row of d.revisions||[])statements.push(insertStatement(context.env.BG_DB,"product_revisions",TABLES.revisions,row));
    for(const row of d.archives||[])statements.push(insertStatement(context.env.BG_DB,"revision_media_archives",TABLES.archives,row));
    for(const row of d.audit||[])statements.push(insertStatement(context.env.BG_DB,"audit_events",TABLES.audit,row));
    await context.env.BG_DB.batch(statements);

    const counts={
      products:(d.products||[]).length,
      revisions:(d.revisions||[]).length,
      archives:(d.archives||[]).length,
      audit:(d.audit||[]).length
    };
    return json({ok:true,schema:snap.schema,restored:counts});
  }catch(error){
    return json({ok:false,code:"snapshot_restore_failed",message:String(error?.message||error)},500);
  }
}
