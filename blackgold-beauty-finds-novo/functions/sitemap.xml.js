const baseOf=context=>String(context.env.PUBLIC_BASE_URL||new URL(context.request.url).origin).replace(/\/$/,"");
const xml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));

export async function onRequestGet(context){
  let rows=[];
  try{
    const result=await context.env.BG_DB.prepare(
      "SELECT slug,updated_at FROM products WHERE status='published' ORDER BY updated_at DESC"
    ).all();
    rows=result.results||[];
  }catch{
    return new Response("Sitemap unavailable",{status:503,headers:{"cache-control":"no-store"}});
  }
  const base=baseOf(context);
  const fixed=[
    {loc:base+"/"},
    {loc:base+"/legal.html"}
  ];
  const dynamic=rows.map(row=>({
    loc:base+"/achado/"+encodeURIComponent(row.slug),
    lastmod:String(row.updated_at||"").slice(0,10)
  }));
  const body='<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
    [...fixed,...dynamic].map(item=>
      '  <url><loc>'+xml(item.loc)+'</loc>'+(item.lastmod?'<lastmod>'+xml(item.lastmod)+'</lastmod>':'')+'</url>'
    ).join("\n")+
    '\n</urlset>\n';
  return new Response(body,{
    headers:{
      "content-type":"application/xml; charset=utf-8",
      "cache-control":"public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      "x-content-type-options":"nosniff"
    }
  });
}
