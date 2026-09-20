const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const clean=(v,max=700)=>String(v??"").trim().slice(0,max);
const slugify=v=>clean(v,160).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90);
const httpsUrl=v=>/^https:\/\//i.test(String(v||"").trim());

function authorized(context){
  const expected=clean(context.env.ADMIN_PANEL_TOKEN,300);
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

async function saveRevision(db,row,reason="update"){
  if(!row?.id)return "";
  const revisionId=crypto.randomUUID();
  await db.prepare(
    "INSERT INTO product_revisions (id,product_id,snapshot_json,reason) VALUES (?,?,?,?)"
  ).bind(revisionId,row.id,JSON.stringify(row),reason).run();
  return revisionId;
}

function parseInput(body={},current={}){
  const hasPrice=Object.prototype.hasOwnProperty.call(body,"price");
  const price=hasPrice
    ?(body.price===""||body.price==null?null:Number(body.price))
    :(Number.isInteger(current.price_cents)?current.price_cents/100:null);
  const status=Object.prototype.hasOwnProperty.call(body,"status")
    ?(body.status==="published"?"published":"draft")
    :(current.status||"draft");
  const featured=Object.prototype.hasOwnProperty.call(body,"featured")
    ?(body.featured?1:0)
    :Number(current.featured||0);
  return {
    title:clean(body.title??current.title,160),
    brand:clean(body.brand??current.brand,120),
    category:clean(body.category??current.category,120),
    description:clean(body.description??current.description,700),
    currency:["BRL","USD","EUR"].includes(body.currency)?body.currency:(current.currency||"BRL"),
    price_cents:price!=null&&Number.isFinite(price)&&price>=0?Math.round(price*100):null,
    image_key:clean(body.imageKey??current.image_key,500),
    image_url:clean(body.imageUrl??current.image_url,1200),
    destination_url:clean(body.destinationUrl??current.destination_url,1600),
    status,featured,
    sort_order:Object.prototype.hasOwnProperty.call(body,"order")&&Number.isFinite(Number(body.order))
      ?Math.trunc(Number(body.order))
      :Number(current.sort_order||0)
  };
}

async function validatePublish(context,p){
  if(p.status!=="published")return "";
  if(!p.title)return "Nome do produto é obrigatório.";
  if(!p.category)return "Categoria é obrigatória.";
  if(!httpsUrl(p.destination_url))return "URL de destino HTTPS é obrigatória para publicar.";
  if(p.image_key){
    const object=await context.env.BG_MEDIA.head(p.image_key).catch(()=>null);
    if(!object)return "A imagem enviada não foi encontrada. Envie novamente antes de publicar.";
  }else if(!httpsUrl(p.image_url)){
    return "Imagem enviada ou URL HTTPS de imagem é obrigatória para publicar.";
  }
  return "";
}

async function deleteMediaIfUnused(context,key,exceptId=""){
  if(!key)return;
  const row=await context.env.BG_DB.prepare(
    "SELECT COUNT(*) AS n FROM products WHERE image_key=? AND id<>?"
  ).bind(key,exceptId).first();
  if(Number(row?.n||0)===0)await context.env.BG_MEDIA.delete(key).catch(()=>{});
}

export async function onRequestGet(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  try{
    const result=await context.env.BG_DB.prepare(
      "SELECT * FROM products ORDER BY sort_order ASC,updated_at DESC"
    ).all();
    return json({ok:true,products:(result.results||[]).map(toProduct)});
  }catch(error){
    return json({ok:false,code:"admin_products_error",message:String(error?.message||error)},500);
  }
}

export async function onRequestPost(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  let body;try{body=await context.request.json()}catch{return json({ok:false,code:"invalid_json"},400)}
  const id=crypto.randomUUID(),input=parseInput(body);
  if(!input.title)return json({ok:false,code:"title_required",message:"Nome do produto é obrigatório."},400);
  const validation=await validatePublish(context,input);
  if(validation)return json({ok:false,code:"publication_gate",message:validation},409);
  const slug=(slugify(input.title)||"produto")+"-"+id.slice(0,8);
  const publishedAt=input.status==="published"?new Date().toISOString():null;
  try{
    await context.env.BG_DB.prepare(
      `INSERT INTO products
       (id,slug,title,brand,category,description,currency,price_cents,image_key,image_url,destination_url,status,featured,sort_order,published_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
    ).bind(
      id,slug,input.title,input.brand,input.category,input.description,input.currency,
      input.price_cents,input.image_key||null,input.image_url||null,input.destination_url,
      input.status,input.featured,input.sort_order,publishedAt
    ).run();
    await audit(context.env.BG_DB,"product_created",id,{status:input.status,imageKey:Boolean(input.image_key)});
    const row=await context.env.BG_DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
    return json({ok:true,product:toProduct(row)},201);
  }catch(error){
    return json({ok:false,code:"create_failed",message:String(error?.message||error)},500);
  }
}

export async function onRequestPatch(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  let body;try{body=await context.request.json()}catch{return json({ok:false,code:"invalid_json"},400)}
  const id=clean(body.id,80);
  if(!id)return json({ok:false,code:"id_required"},400);
  const current=await context.env.BG_DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
  if(!current)return json({ok:false,code:"not_found"},404);
  const input=parseInput(body,current);
  const validation=await validatePublish(context,input);
  if(validation)return json({ok:false,code:"publication_gate",message:validation},409);
  const publishedAt=input.status==="published"?(current.published_at||new Date().toISOString()):null;
  try{
    const revisionId=await saveRevision(context.env.BG_DB,current,"update");
    await context.env.BG_DB.prepare(
      `UPDATE products SET title=?,brand=?,category=?,description=?,currency=?,price_cents=?,image_key=?,image_url=?,destination_url=?,status=?,featured=?,sort_order=?,published_at=?,updated_at=datetime('now') WHERE id=?`
    ).bind(
      input.title,input.brand,input.category,input.description,input.currency,input.price_cents,
      input.image_key||null,input.image_url||null,input.destination_url,input.status,input.featured,
      input.sort_order,publishedAt,id
    ).run();
    const replacedKey=current.image_key&&current.image_key!==input.image_key?current.image_key:"";
    if(replacedKey)await deleteMediaIfUnused(context,replacedKey,id);
    await audit(context.env.BG_DB,"product_updated",id,{
      status:input.status,
      imageReplaced:Boolean(replacedKey),
      revisionId
    });
    const row=await context.env.BG_DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
    return json({ok:true,product:toProduct(row)});
  }catch(error){
    return json({ok:false,code:"update_failed",message:String(error?.message||error)},500);
  }
}

export async function onRequestDelete(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  const id=clean(new URL(context.request.url).searchParams.get("id"),80);
  if(!id)return json({ok:false,code:"id_required"},400);
  try{
    const row=await context.env.BG_DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
    if(!row)return json({ok:false,code:"not_found"},404);
    const revisionId=await saveRevision(context.env.BG_DB,row,"delete");
    await context.env.BG_DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
    if(row.image_key)await deleteMediaIfUnused(context,row.image_key,id);
    await audit(context.env.BG_DB,"product_deleted",id,{imageKey:Boolean(row.image_key),revisionId});
    return json({ok:true,id});
  }catch(error){
    return json({ok:false,code:"delete_failed",message:String(error?.message||error)},500);
  }
}
