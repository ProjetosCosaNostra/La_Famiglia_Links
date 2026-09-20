export async function onRequestGet(context){
  const raw=Array.isArray(context.params.path)?context.params.path.join("/"):String(context.params.path||"");
  let key=raw;
  try{key=decodeURIComponent(raw)}catch{}
  if(!key||key.startsWith("revision-archive/"))return new Response("Not found",{status:404});
  const object=await context.env.BG_MEDIA.get(key);
  if(!object)return new Response("Not found",{status:404});
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag",object.httpEtag);
  headers.set("cache-control",headers.get("cache-control")||"public, max-age=31536000, immutable");
  headers.set("x-content-type-options","nosniff");
  return new Response(object.body,{headers});
}
