const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

const rowToPublic=row=>({
  id:row.id,
  slug:row.slug,
  title:row.title,
  brand:row.brand||"",
  category:row.category||"",
  description:row.description||"",
  currency:row.currency||"BRL",
  price:Number.isInteger(row.price_cents)?row.price_cents/100:null,
  image:row.image_key?"/media/"+encodeURIComponent(row.image_key):(row.image_url||""),
  featured:Boolean(row.featured),
  order:Number(row.sort_order||0)
});

export async function onRequestGet(context){
  try{
    const result=await context.env.BG_DB.prepare(
      `SELECT id,slug,title,brand,category,description,currency,price_cents,image_key,image_url,featured,sort_order
       FROM products WHERE status='published'
       ORDER BY featured DESC,sort_order ASC,updated_at DESC`
    ).all();
    const products=(result.results||[]).map(rowToPublic);
    return json({ok:true,total:products.length,products});
  }catch(error){
    return json({ok:false,code:"products_unavailable",message:String(error?.message||error)},500);
  }
}
