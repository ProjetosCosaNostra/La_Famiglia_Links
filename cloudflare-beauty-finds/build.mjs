import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });

const publicFiles = [
  'index.html','destaque.html','vitrine.html','ecossistema.html',
  'blackgold-home-v18.css','blackgold-home-v18-calibration.css',
  'blackgold-v9.css','blackgold-v9.js','blackgold-v10-overrides.css','blackgold-v12-final.css','blackgold-v13-exact.css','blackgold-v14-calibration.css','blackgold-v15-contract-final.css','blackgold-v16-measured-calibration.css',
  'product-placeholder-v12.svg','ecosystem-crest-v12.svg','exact-brand-v13.webp','exact-ecosystem-center-v13.webp','styles.css','app.js','admin.html','admin.js','mercadolivre-callback.html','_headers'
];
for (const file of publicFiles) await fs.copyFile(path.join(here,file), path.join(out,file));

await fs.cp(path.join(here,'approved-home'), path.join(out,'approved-home'), {recursive:true});
await fs.cp(path.join(here,'approved-v5'), path.join(out,'approved-v5'), {recursive:true});
await fs.copyFile(path.join(here,'hero-approved.webp'), path.join(out,'hero-approved.webp'));

const ecosystemAuthorityB64 = (await fs.readFile(path.join(here,'assets-source','ecosystem-authority-v17.webp.b64'),'utf8')).replace(/\s+/g,'');
const ecosystemAuthority = Buffer.from(ecosystemAuthorityB64,'base64');
if (ecosystemAuthority.length !== 10502) throw new Error(`V17 ecosystem authority size mismatch: ${ecosystemAuthority.length}`);
if (ecosystemAuthority.subarray(0,4).toString('ascii')!=='RIFF' || ecosystemAuthority.subarray(8,12).toString('ascii')!=='WEBP') throw new Error('V17 ecosystem authority is not a valid WEBP container');
await fs.writeFile(path.join(out,'ecosystem-authority-v17.webp'), ecosystemAuthority);

for (const asset of ['logo-cn-round.png','logo-cn-square.png']) { try { await fs.copyFile(path.join(root,'assets',asset),path.join(out,'assets',asset)); } catch {} }

// Clean Home V18: isolated from every V9–V16 visual stylesheet. Calibration is
// temporary and will be folded into the base V18 stylesheet before user approval.
{
  const file = path.join(out,'index.html');
  let html = await fs.readFile(file,'utf8');
  html = html
    .replace('./approved-home/ysl-loulou.webp','./approved-v5/ysl-loulou.webp')
    .replace('./approved-home/swarovski-brinco.webp','./approved-v5/swarovski-brinco.webp');
  if (!html.includes('blackgold-home-v18-calibration.css')) {
    html = html.replace('</head>','<link rel="stylesheet" href="./blackgold-home-v18-calibration.css?v=20260908-v18c"/></head>');
  }
  await fs.writeFile(file,html,'utf8');
}

for (const page of ['destaque.html','vitrine.html','ecossistema.html']) {
  const file = path.join(out,page);
  let html = await fs.readFile(file,'utf8');
  html = html.replaceAll('./assets/header-lockup-v9.webp','./approved-v5/header-lockup.webp').replaceAll('./assets/product-placeholder-v9.webp','./product-placeholder-v12.svg').replaceAll('./assets/logo-cn-square.png','./product-placeholder-v12.svg');
  if (!html.includes('blackgold-v10-overrides.css')) html = html.replace('</head>','<link href="./blackgold-v10-overrides.css?v=20260907-v11" rel="stylesheet"/></head>');
  if (!html.includes('blackgold-v12-final.css')) html = html.replace('</head>','<link href="./blackgold-v12-final.css?v=20260907-v12" rel="stylesheet"/></head>');
  if (!html.includes('blackgold-v13-exact.css')) html = html.replace('</head>','<link href="./blackgold-v13-exact.css?v=20260907-v13" rel="stylesheet"/></head>');
  if (!html.includes('blackgold-v14-calibration.css')) html = html.replace('</head>','<link href="./blackgold-v14-calibration.css?v=20260907-v14" rel="stylesheet"/></head>');
  if (!html.includes('blackgold-v15-contract-final.css')) html = html.replace('</head>','<link href="./blackgold-v15-contract-final.css?v=20260908-v15" rel="stylesheet"/></head>');
  if (!html.includes('blackgold-v16-measured-calibration.css')) html = html.replace('</head>','<link href="./blackgold-v16-measured-calibration.css?v=20260908-v16" rel="stylesheet"/></head>');
  await fs.writeFile(file,html,'utf8');
}

try { await fs.copyFile(path.join(root,'ecosystem.json'),path.join(out,'ecosystem.json')); } catch { await fs.writeFile(path.join(out,'ecosystem.json'),JSON.stringify({}),'utf8'); }

const productsRaw = JSON.parse(await fs.readFile(path.join(root,'produtos.json'),'utf8'));
const activeProducts = (Array.isArray(productsRaw)?productsRaw:productsRaw.products||[]).filter(p=>p&&p.active!==false);
let dailySelection={campaign_id:'organic',selected:[]}; try{dailySelection=JSON.parse(await fs.readFile(path.join(root,'data','daily_selection.json'),'utf8'));}catch{}
const dailyRows=Array.isArray(dailySelection.selected)?dailySelection.selected:[];
const dailyBySku=new Map(dailyRows.map(row=>[String(row?.sku||''),row]));
const products=activeProducts.map(p=>({sku:p.sku||'',title:p.title||'BlackGold Find',category:p.categoria_principal||'Beleza',secondary:Array.isArray(p.categorias_secundarias)?p.categorias_secundarias:[],badges:Array.isArray(p.badges)?p.badges:[],price:p.price_text||p.preco_atual||p.price_current||p.price||'',description:p.descricao_curta||p.short_description||p.description||p.notes||'',image:p.image||p.image_original||'',card_image:p.card_image||(Array.isArray(p.images)?p.images[0]:'')||p.image||p.image_original||'',url:p.active_affiliate_url||p.open_url||p.short_url||p.canonical_url||p.check_url||'#',featured:p.featured===true||p.quick_home===true,daily_position:Number(dailyBySku.get(String(p.sku||''))?.position||0)}));
await fs.writeFile(path.join(out,'catalog.json'),JSON.stringify({updated_at:new Date().toISOString(),total_active:activeProducts.length,products}),'utf8');
await fs.writeFile(path.join(out,'daily-selection.json'),JSON.stringify({campaign_id:dailySelection.campaign_id||'organic',date:dailySelection.date||'',selected:dailyRows.map(row=>({sku:row.sku||'',position:Number(row.position||0)}))}),'utf8');

const home=await fs.readFile(path.join(out,'index.html'),'utf8');
if(!home.includes('blackgold-home-v18.css?v=20260908-v18')) throw new Error('Home V18 stylesheet missing');
if(!home.includes('blackgold-home-v18-calibration.css?v=20260908-v18c')) throw new Error('Home V18 calibration missing');
for(const forbidden of ['blackgold-v9.css','blackgold-v10-overrides.css','blackgold-v12-final.css','blackgold-v13-exact.css','blackgold-v14-calibration.css','blackgold-v15-contract-final.css','blackgold-v16-measured-calibration.css']) if(home.includes(forbidden)) throw new Error(`Legacy layer leaked into clean Home V18: ${forbidden}`);
if(!home.includes('approved-home/miss-dior.webp')||!home.includes('bg18-eco')) throw new Error('V18 approved visual stand-ins missing');

for(const page of ['destaque.html','vitrine.html','ecossistema.html']){
  const html=await fs.readFile(path.join(out,page),'utf8');
  for(const required of ['blackgold-v9.css','blackgold-v10-overrides.css?v=20260907-v11','blackgold-v12-final.css?v=20260907-v12','blackgold-v13-exact.css?v=20260907-v13','blackgold-v14-calibration.css?v=20260907-v14','blackgold-v15-contract-final.css?v=20260908-v15','blackgold-v16-measured-calibration.css?v=20260908-v16','blackgold-v9.js']) if(!html.includes(required)) throw new Error(`${page} missing ${required}`);
}
for(const required of ['blackgold-home-v18.css','blackgold-home-v18-calibration.css','approved-v5/header-lockup.webp','hero-approved.webp','approved-home/ecosystem-approved-exact.webp','ecosystem-authority-v17.webp']) await fs.access(path.join(out,required));
console.log(`BlackGold clean Home V18 calibrated package ready; ${products.length} legacy products remain backend-only -> ${out}`);
