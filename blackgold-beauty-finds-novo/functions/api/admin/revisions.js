const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const clean=(v,max=500)=>String(v??"").trim().slice(0,max);

function authorized(context){
  const expected=String(context.env.ADMIN_PANEL_TOKEN||"").trim();
  const supplied=(context.request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  return Boolean(expected&&supplied&&expected===supplied);
}

const toProduct=row=>({
  id:row.id,slug:row.slug,title:row.title,brand:row.brand||"",category:row.category||"",
  description:row.description||"",currency:row.currency||"BRL",
  price:Number.isInteger(row.price_cents)?row.price_cents/100:null,
  imageKey:row.image_key||"",
  image:row.image_key?"/media/"+encodeURIComponent(row.image_key):(row.image_url||""),
  imageUrl:row.image_url||"",
  destinationUrl:row.destination_url||"",
  status:row.status,featured:Boolean(row.featured),order:Number(row.sort_order||0),
  createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at
});

async function audit(db,eventType,productId,detail={}){
  await db.prepare("INSERT INTO audit_events (id,event_type,product_id,detail_json) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(),eventType,productId||null,JSON.stringify(detail)).run();
}

async function saveRevision(db,row,reason){
  if(!row?.id)return "";
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO product_revisions (id,product_id,snapshot_json,reason) VALUES (?,?,?,?)")
    .bind(id,row.id,JSON.stringify(row),reason).run();
  return id;
}

async function mediaExists(bucket,key){
  if(!key)return false;
  return Boolean(await bucket.head(key).catch(()=>null));
}

function publishable(row){
  return Boolean(
    row.title &&
    row.category &&
    /^https:\/\//i.test(String(row.destination_url||"")) &&
    (row.image_key || /^https:\/\//i.test(String(row.image_url||"")))
  );
}

export async function onRequestGet(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  const url=new URL(context.request.url);
  const productId=clean(url.searchParams.get("productId"),80);
  const limit=Math.max(1,Math.min(50,Number(url.searchParams.get("limit")||20)));
  if(!productId)return json({ok:false,code:"product_id_required"},400);
  try{
    const result=await context.env.BG_DB.prepare(
      "SELECT id,product_id,snapshot_json,reason,created_at FROM product_revisions WHERE product_id=? ORDER BY created_at DESC LIMIT ?"
    ).bind(productId,limit).all();
    const revisions=(result.results||[]).map(row=>{
      let snapshot={};
      try{snapshot=JSON.parse(row.snapshot_json||"{}")}catch{}
      return {
        id:row.id,
        productId:row.product_id,
        reason:row.reason,
        createdAt:row.created_at,
        snapshot:{
          title:snapshot.title||"",
          brand:snapshot.brand||"",
          category:snapshot.category||"",
          status:snapshot.status||"draft",
          featured:Boolean(snapshot.featured),
          order:Number(snapshot.sort_order||0),
          imagePresent:Boolean(snapshot.image_key||snapshot.image_url)
        }
      };
    });
    return json({ok:true,total:revisions.length,revisions});
  }catch(error){
    return json({ok:false,code:"revisions_unavailable",message:String(error?.message||error)},500);
  }
}

export async function onRequestPost(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  let body;try{body=await context.request.json()}catch{return json({ok:false,code:"invalid_json"},400)}
  const revisionId=clean(body.revisionId,80);
  if(!revisionId)return json({ok:false,code:"revision_id_required"},400);

  try{
    const revision=await context.env.BG_DB.prepare(
      "SELECT * FROM product_revisions WHERE id=?"
    ).bind(revisionId).first();
    if(!revision)return json({ok:false,code:"revision_not_found"},404);

    let snapshot;
    try{snapshot=JSON.parse(revision.snapshot_json||"{}")}catch{
      return json({ok:false,code:"invalid_revision_snapshot"},500);
    }
    const productId=revision.product_id;
    const current=await context.env.BG_DB.prepare("SELECT * FROM products WHERE id=?").bind(productId).first();

    let imageKey=snapshot.image_key||"";
    let imageUrl=snapshot.image_url||"";
    let imageRecovered=true;
    if(imageKey && !(await mediaExists(context.env.BG_MEDIA,imageKey))){
      imageRecovered=false;
      if(current?.image_key && await mediaExists(context.env.BG_MEDIA,current.image_key)){
        imageKey=current.image_key;
        imageUrl=current.image_url||"";
      }else{
        imageKey="";
        imageUrl=current?.image_url||imageUrl||"";
      }
    }

    const row={
      id:productId,
      slug:snapshot.slug||("produto-"+productId.slice(0,8)),
      title:snapshot.title||"",
      brand:snapshot.brand||"",
      category:snapshot.category||"",
      description:snapshot.description||"",
      currency:["BRL","USD","EUR"].includes(snapshot.currency)?snapshot.currency:"BRL",
      price_cents:Number.isInteger(snapshot.price_cents)?snapshot.price_cents:null,
      image_key:imageKey||null,
      image_url:imageUrl||null,
      destination_url:snapshot.destination_url||"",
      status:snapshot.status==="published"?"published":"draft",
      featured:snapshot.featured?1:0,
      sort_order:Number(snapshot.sort_order||0),
      created_at:snapshot.created_at||new Date().toISOString(),
      published_at:snapshot.published_at||null
    };

    if(row.status==="published" && !publishable(row)){
      row.status="draft";
      row.published_at=null;
    }

    const slugConflict=await context.env.BG_DB.prepare(
      "SELECT id FROM products WHERE slug=? AND id<>?"
    ).bind(row.slug,row.id).first();
    if(slugConflict)row.slug=(row.slug+"-restored-"+row.id.slice(0,8)).slice(0,100);

    let preRollbackRevisionId="";
    if(current)preRollbackRevisionId=await saveRevision(context.env.BG_DB,current,"pre_rollback");

    if(current){
      await context.env.BG_DB.prepare(
        `UPDATE products SET slug=?,title=?,brand=?,category=?,description=?,currency=?,price_cents=?,image_key=?,image_url=?,destination_url=?,status=?,featured=?,sort_order=?,published_at=?,updated_at=datetime('now') WHERE id=?`
      ).bind(
        row.slug,row.title,row.brand,row.category,row.description,row.currency,row.price_cents,
        row.image_key,row.image_url,row.destination_url,row.status,row.featured,row.sort_order,
        row.status==="published"?(row.published_at||new Date().toISOString()):null,row.id
      ).run();
    }else{
      await context.env.BG_DB.prepare(
        `INSERT INTO products
        (id,slug,title,brand,category,description,currency,price_cents,image_key,image_url,destination_url,status,featured,sort_order,created_at,updated_at,published_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?)`
      ).bind(
        row.id,row.slug,row.title,row.brand,row.category,row.description,row.currency,row.price_cents,
        row.image_key,row.image_url,row.destination_url,row.status,row.featured,row.sort_order,
        row.created_at,row.status==="published"?(row.published_at||new Date().toISOString()):null
      ).run();
    }

    await audit(context.env.BG_DB,"product_rollback",row.id,{
      revisionId,
      preRollbackRevisionId:preRollbackRevisionId||null,
      recreated:!current,
      imageRecovered
    });

    const restored=await context.env.BG_DB.prepare("SELECT * FROM products WHERE id=?").bind(row.id).first();
    return json({
      ok:true,
      product:toProduct(restored),
      warning:imageRecovered?null:"A imagem antiga não existia mais; a restauração manteve uma imagem disponível ou voltou para rascunho."
    });
  }catch(error){
    return json({ok:false,code:"rollback_failed",message:String(error?.message||error)},500);
  }
}
