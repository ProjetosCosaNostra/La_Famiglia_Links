const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
  }
});

export async function onRequestGet(context){
  const started=Date.now();
  const checks={database:false,media:false,adminSecret:false};
  try{
    const db=await context.env.BG_DB.prepare("SELECT COUNT(*) AS n FROM products").first();
    checks.database=Number.isFinite(Number(db?.n));
  }catch{}
  try{
    await context.env.BG_MEDIA.list({limit:1});
    checks.media=true;
  }catch{}
  const adminToken=String(context.env.ADMIN_PANEL_TOKEN||"").trim();
  checks.adminSecret=adminToken.length>=32;
  const ok=checks.database&&checks.media&&checks.adminSecret;
  return json({
    ok,
    service:"BlackGold Beauty Finds",
    checks,
    latencyMs:Date.now()-started,
    timestamp:new Date().toISOString()
  },ok?200:503);
}
