const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

function authorized(context){
  const expected=String(context.env.ADMIN_PANEL_TOKEN||"").trim();
  const supplied=(context.request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  return Boolean(expected&&supplied&&expected===supplied);
}

const allowed=new Map([
  ["image/jpeg","jpg"],
  ["image/png","png"],
  ["image/webp","webp"],
  ["image/avif","avif"]
]);

const safeKey=key=>/^product-[0-9a-f-]+\.(jpg|png|webp|avif)$/i.test(String(key||""));

export async function onRequestPost(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  let form;try{form=await context.request.formData()}catch{return json({ok:false,code:"invalid_form"},400)}
  const file=form.get("file");
  if(!(file instanceof File))return json({ok:false,code:"file_required"},400);

  const ext=allowed.get(file.type);
  if(!ext)return json({ok:false,code:"invalid_type",message:"Use JPG, PNG, WEBP ou AVIF."},415);
  if(file.size<=0)return json({ok:false,code:"empty_file",message:"A imagem está vazia."},400);
  if(file.size>8*1024*1024)return json({ok:false,code:"file_too_large",message:"Imagem acima de 8 MB."},413);

  const key="product-"+crypto.randomUUID()+"."+ext;
  try{
    await context.env.BG_MEDIA.put(key,await file.arrayBuffer(),{
      httpMetadata:{
        contentType:file.type,
        cacheControl:"public, max-age=31536000, immutable"
      },
      customMetadata:{
        source:"admin-upload",
        createdAt:new Date().toISOString()
      }
    });
    return json({ok:true,key,url:"/media/"+encodeURIComponent(key)},201);
  }catch(error){
    return json({ok:false,code:"upload_failed",message:String(error?.message||error)},500);
  }
}

export async function onRequestDelete(context){
  if(!authorized(context))return json({ok:false,code:"unauthorized"},401);
  const key=new URL(context.request.url).searchParams.get("key")||"";
  if(!safeKey(key))return json({ok:false,code:"invalid_key"},400);

  try{
    const used=await context.env.BG_DB.prepare(
      "SELECT COUNT(*) AS n FROM products WHERE image_key=?"
    ).bind(key).first();
    if(Number(used?.n||0)>0){
      return json({ok:false,code:"media_in_use",message:"A imagem está vinculada a um produto."},409);
    }
    await context.env.BG_MEDIA.delete(key);
    return json({ok:true,key});
  }catch(error){
    return json({ok:false,code:"delete_upload_failed",message:String(error?.message||error)},500);
  }
}
