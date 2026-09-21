const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const jsonLd=v=>JSON.stringify(v).replace(/</g,"\\u003c");
const baseOf=context=>String(context.env.PUBLIC_BASE_URL||new URL(context.request.url).origin).replace(/\/$/,"");
const permissionsPolicy="camera=(), microphone=(), geolocation=(), payment=()";
const cspFor=nonce=>[
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  "connect-src 'none'",
  nonce?"script-src 'nonce-"+nonce+"'":"script-src 'none'"
].join("; ");
const htmlSecurityHeaders=nonce=>({
  "x-content-type-options":"nosniff",
  "x-frame-options":"DENY",
  "referrer-policy":"strict-origin-when-cross-origin",
  "permissions-policy":permissionsPolicy,
  "content-security-policy":cspFor(nonce)
});

function notFound(){
  return new Response("<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>Achado não encontrado</title><h1>Achado não encontrado</h1>",{
    status:404,
    headers:{
      "content-type":"text/html; charset=utf-8",
      "cache-control":"no-store",
      "x-robots-tag":"noindex, nofollow, noarchive",
      ...htmlSecurityHeaders("")
    }
  });
}

export async function onRequestGet(context){
  const slug=String(context.params.slug||"").trim().slice(0,120);
  if(!slug)return notFound();

  let row;
  try{
    row=await context.env.BG_DB.prepare(
      `SELECT id,slug,title,brand,category,description,currency,price_cents,image_key,image_url,updated_at
       FROM products WHERE slug=? AND status='published' LIMIT 1`
    ).bind(slug).first();
  }catch{
    return new Response("Unavailable",{status:503,headers:{
      "cache-control":"no-store",
      "x-robots-tag":"noindex, nofollow, noarchive",
      "x-content-type-options":"nosniff"
    }});
  }
  if(!row)return notFound();

  const base=baseOf(context);
  const canonical=base+"/achado/"+encodeURIComponent(row.slug);
  const outbound=base+"/api/out?id="+encodeURIComponent(row.id)+"&placement=detail";
  const image=row.image_key
    ?base+"/media/"+encodeURIComponent(row.image_key)
    :String(row.image_url||"");
  const description=String(row.description||"").trim()||("Curadoria BlackGold: "+row.title+".");
  const price=Number.isInteger(row.price_cents)?row.price_cents/100:null;
  const currency=String(row.currency||"BRL");
  const product={
    "@context":"https://schema.org",
    "@type":"Product",
    name:String(row.title),
    description,
    ...(image?{image:[image]}:{}),
    ...(row.brand?{brand:{"@type":"Brand",name:String(row.brand)}}:{}),
    ...(row.category?{category:String(row.category)}:{}),
    ...(price!=null?{offers:{"@type":"Offer",url:outbound,price,priceCurrency:currency}}:{})
  };
  const nonce=crypto.randomUUID().replaceAll("-","");
  const structured=price!=null
    ?`<script nonce="${nonce}" type="application/ld+json">${jsonLd(product)}</script>`
    :"";
  const priceText=price==null?"":new Intl.NumberFormat("pt-BR",{style:"currency",currency}).format(price);
  const updated=String(row.updated_at||"");
  const title=String(row.title)+" · BlackGold Beauty Finds";

  const body=`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080604">
<meta name="robots" content="index,follow,max-image-preview:large">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description.slice(0,240))}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(row.title)}">
<meta property="og:description" content="${esc(description.slice(0,240))}">
<meta property="og:url" content="${esc(canonical)}">
${image?`<meta property="og:image" content="${esc(image)}">`:""}
<meta name="twitter:card" content="summary_large_image">
${structured}
<style>
*{box-sizing:border-box}body{margin:0;background:#080604;color:#21170f;font:16px/1.55 Inter,"Segoe UI",Arial,sans-serif}
main{width:min(1080px,calc(100% - 28px));margin:0 auto;padding:34px 0 54px}.back{color:#d5aa4a;text-decoration:none;font-weight:700}
.card{margin-top:24px;background:#fffaf2;border:1px solid #b98425;border-radius:18px;overflow:hidden;display:grid;grid-template-columns:minmax(280px,.9fr) minmax(0,1.1fr);box-shadow:0 28px 80px #0009}
.media{min-height:420px;background:#f8eee2;display:grid;place-items:center;padding:30px}.media img{max-width:100%;max-height:520px;object-fit:contain}
.copy{padding:clamp(28px,5vw,64px)}.eyebrow{letter-spacing:.16em;text-transform:uppercase;color:#967024;font-size:12px;font-weight:800}
h1{font:600 clamp(36px,6vw,68px)/.98 Georgia,"Times New Roman",serif;margin:12px 0 14px}.desc{color:#685a4c;max-width:62ch}
.price{display:block;margin:26px 0 12px;font:700 clamp(26px,4vw,40px)/1 Georgia,serif;color:#4d3211}
.cta{display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:0 22px;border-radius:8px;background:linear-gradient(#dda939,#a5680a);color:#fffaf1;text-decoration:none;font-weight:800}
.note{margin-top:22px;color:#796b5c;font-size:13px}.note a{color:#875b14}.updated{display:block;margin-top:8px;color:#9a8b7b;font-size:12px}
@media(max-width:720px){main{padding-top:20px}.card{grid-template-columns:1fr}.media{min-height:300px}.copy{padding:28px 22px 34px}}
</style>
</head>
<body><main>
<a class="back" href="/">← BlackGold Beauty Finds</a>
<article class="card">
<div class="media">${image?`<img src="${esc(image)}" alt="${esc(row.title)}" width="640" height="640">`:""}</div>
<div class="copy">
<div class="eyebrow">${esc([row.brand,row.category].filter(Boolean).join(" · ")||"Curadoria BlackGold")}</div>
<h1>${esc(row.title)}</h1>
<p class="desc">${esc(description)}</p>
${priceText?`<strong class="price">${esc(priceText)}</strong>`:""}
<a class="cta" href="${esc(outbound)}" rel="nofollow sponsored">Ver no site parceiro →</a>
<p class="note">Link de afiliado: a BlackGold pode receber comissão sem custo adicional para você. Preço, estoque, frete e condições são confirmados no site de destino. <a href="/legal.html">Transparência e privacidade</a>.</p>
${updated?`<small class="updated">Atualizado em ${esc(updated.slice(0,10))}</small>`:""}
</div>
</article>
</main></body></html>`;

  return new Response(body,{
    headers:{
      "content-type":"text/html; charset=utf-8",
      "cache-control":"public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      ...htmlSecurityHeaders(nonce)
    }
  });
}
