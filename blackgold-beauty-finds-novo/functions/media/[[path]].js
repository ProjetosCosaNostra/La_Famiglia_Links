export async function onRequestGet(context){
  const key=String(context.params.path||"");
  if(!key)return new Response("Not found",{status:404});
  const object=await context.env.BG_MEDIA.get(key);
  if(!object)return new Response("Not found",{status:404});
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag",object.httpEtag);
  headers.set("cache-control",headers.get("cache-control")||"public, max-age=31536000, immutable");
  return new Response(object.body,{headers});
}
