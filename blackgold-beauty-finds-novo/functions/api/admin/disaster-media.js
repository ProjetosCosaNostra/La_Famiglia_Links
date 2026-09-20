const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

function authorized(context){
  const expected=String(context.env.ADMIN_PANEL_TOKEN||"").trim();
  const supplied=(context.request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  return Boolean(expected&&supplied&&expected===supplied);
}

function validKey(key){
  const k=String(key||"");
  if(/^product-[0-9a-f-]+\.(jpg|jpeg|png|webp|avif)$/i.test(k))return true;
  if(/^revision-archive\/[0-9a-f-]+\/[0-9a-f-]+\.(jpg|jpeg|png|webp|avif)$/i.test(k))return true;
  return false;
}

function keyFrom(context){
  const raw=new URL(context.request.url).searchParams.get("key")||"";
  try{return decodeURIComponent(raw)}catch{return raw}
}

export async function onRequestGet(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  const key=keyFrom(context);
  if(!validKey(key))return json({ok:false,code:"invalid_key"},400);
  const object=await context.env.BG_MEDIA.get(key);
  if(!object)return json({ok:false,code:"not_found"},404);
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control","private, max-age=0, no-store");
  headers.set("x-content-type-options","nosniff");
  headers.set("x-blackgold-media-key",key);
  return new Response(object.body,{status:200,headers});
}

export async function onRequestPost(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  if(context.request.headers.get("x-blackgold-restore-confirm")!=="RESTORE_MEDIA"){
    return json({ok:false,code:"restore_confirmation_required"},428);
  }
  const key=keyFrom(context);
  if(!validKey(key))return json({ok:false,code:"invalid_key"},400);
  const type=(context.request.headers.get("content-type")||"application/octet-stream").split(";")[0].trim();
  const allowed=["image/jpeg","image/png","image/webp","image/avif"];
  if(!allowed.includes(type))return json({ok:false,code:"invalid_type"},415);
  const bytes=await context.request.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>8*1024*1024)return json({ok:false,code:"invalid_size"},413);
  try{
    await context.env.BG_MEDIA.put(key,bytes,{
      httpMetadata:{
        contentType:type,
        cacheControl:key.startsWith("revision-archive/")?"private, max-age=0, no-store":"public, max-age=31536000, immutable"
      },
      customMetadata:{source:"disaster-restore",restoredAt:new Date().toISOString()}
    });
    return json({ok:true,key,bytes:bytes.byteLength},201);
  }catch(error){
    return json({ok:false,code:"media_restore_failed",message:String(error?.message||error)},500);
  }
}

export async function onRequestDelete(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  if(context.request.headers.get("x-blackgold-restore-confirm")!=="DELETE_RESTORE_MEDIA"){
    return json({ok:false,code:"delete_confirmation_required"},428);
  }
  const key=keyFrom(context);
  if(!validKey(key))return json({ok:false,code:"invalid_key"},400);
  await context.env.BG_MEDIA.delete(key).catch(()=>{});
  return json({ok:true,key});
}
