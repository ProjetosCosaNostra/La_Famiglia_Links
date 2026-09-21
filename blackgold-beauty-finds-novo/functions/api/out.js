const clean=(v,max=120)=>String(v??"").trim().slice(0,max);
const allowedPlacement=new Set(["selection","showcase","catalog","detail","unknown"]);
const botPattern=/(bot|crawler|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|preview|headlesschrome|lighthouse)/i;

async function recordClick(context,product,placement){
  try{
    await context.env.BG_DB.prepare(
      "INSERT INTO outbound_clicks (id,product_id,product_title,placement,clicked_at) VALUES (?,?,?,?,?)"
    ).bind(
      crypto.randomUUID(),
      product.id,
      String(product.title||"").slice(0,160),
      placement,
      new Date().toISOString()
    ).run();
    return true;
  }catch{
    return false;
  }
}

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const id=clean(url.searchParams.get("id"),80);
  const placementRaw=clean(url.searchParams.get("placement"),30).toLowerCase();
  const placement=allowedPlacement.has(placementRaw)?placementRaw:"unknown";
  if(!id)return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});

  let product;
  try{
    product=await context.env.BG_DB.prepare(
      "SELECT id,title,destination_url,status FROM products WHERE id=?"
    ).bind(id).first();
  }catch{
    return new Response("Unavailable",{
      status:503,
      headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}
    });
  }

  if(!product||product.status!=="published"||!/^https:\/\//i.test(String(product.destination_url||""))){
    return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  }

  const ua=context.request.headers.get("user-agent")||"";
  const shouldTrack=!botPattern.test(ua);
  let tracking="skipped";

  if(shouldTrack){
    const task=recordClick(context,product,placement);
    if(typeof context.waitUntil==="function"){
      context.waitUntil(task);
      tracking="queued";
    }else{
      tracking=(await task)?"complete":"failed";
    }
  }

  return new Response(null,{
    status:302,
    headers:{
      "location":product.destination_url,
      "cache-control":"no-store, no-cache, must-revalidate",
      "referrer-policy":"no-referrer",
      "x-content-type-options":"nosniff",
      "x-blackgold-click-tracking":tracking
    }
  });
}
