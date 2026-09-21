import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const token=process.env.BLACKGOLD_ADMIN_TOKEN||"";
const chrome=process.env.CHROME_BIN||"";
if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
if(!chrome)throw new Error("CHROME_BIN missing");

const auth={authorization:"Bearer "+token};
const work=path.resolve(".visual-gate");
await fs.mkdir(work,{recursive:true});
const fixture=path.join(work,"storefront-ui-fixture.png");
await fs.writeFile(
  fixture,
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7n8AAAAASUVORK5CYII=","base64")
);

async function call(url,opt={}){
  const h=new Headers(opt.headers||{});
  h.set("authorization","Bearer "+token);
  if(opt.body&&!(opt.body instanceof FormData))h.set("content-type","application/json");
  const r=await fetch(base+url,{...opt,headers:h,cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(url+" "+r.status+" "+JSON.stringify(d));
  return d;
}
async function publicProducts(){
  const r=await fetch(base+"/api/products?store-ui="+Date.now(),{cache:"no-store"});
  if(!r.ok)throw new Error("public products "+r.status);
  return r.json();
}
async function cleanup(){
  const d=await call("/api/admin/products");
  for(const p of d.products||[])await call("/api/admin/products?id="+encodeURIComponent(p.id),{method:"DELETE"});
}
async function upload(name){
  const bytes=await fs.readFile(fixture);
  const form=new FormData();
  form.append("file",new Blob([bytes],{type:"image/png"}),name);
  return call("/api/admin/upload",{method:"POST",body:form});
}
async function createProduct({title,category,featured,order,url}){
  const media=await upload(title.replace(/\s+/g,"-").toLowerCase()+".png");
  return call("/api/admin/products",{
    method:"POST",
    body:JSON.stringify({
      title,
      brand:"BlackGold QA",
      category,
      description:"Temporary storefront browser regression record.",
      currency:"BRL",
      price:"39.90",
      imageKey:media.key,
      destinationUrl:url,
      status:"published",
      featured,
      order
    })
  });
}
async function waitCatalog(page,count){
  await page.waitForFunction(
    n=>Number(document.body.dataset.catalogCount||-1)===n,
    {timeout:10000},
    count
  );
}
async function setInput(page,selector,value){
  await page.$eval(selector,(el,v)=>{
    el.value=String(v);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  },value);
}

await cleanup();
let browser;
const result={};
try{
  await createProduct({
    title:"BlackGold QA Beleza",
    category:"Beleza",
    featured:true,
    order:1,
    url:"https://example.com/qa-beleza"
  });
  await createProduct({
    title:"BlackGold QA Moda",
    category:"Moda",
    featured:false,
    order:2,
    url:"https://example.com/qa-moda"
  });
  const pub=await publicProducts();
  if(pub.total!==2)throw new Error("storefront seed failed");
  result.seedPublished=2;

  browser=await puppeteer.launch({
    headless:true,
    executablePath:chrome,
    args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]
  });

  const page=await browser.newPage();
  await page.setViewport({width:1448,height:1086,deviceScaleFactor:1});
  await page.goto(base+"/?storefront-ui="+Date.now(),{waitUntil:"networkidle0",timeout:30000});
  await waitCatalog(page,2);

  const shell=await page.evaluate(()=>({
    selection:document.querySelectorAll("#selection .product").length,
    showcase:document.querySelectorAll("#showcase .product").length,
    overflow:document.documentElement.scrollWidth>window.innerWidth,
    width:window.innerWidth,
    renderWidth:Number(document.documentElement.dataset.renderWidth||0)
  }));
  if(shell.selection!==1||shell.showcase!==1||shell.overflow||shell.renderWidth!==1448){
    throw new Error("desktop shell/product render mismatch "+JSON.stringify(shell));
  }
  result.desktopRender=shell;

  await page.evaluate(()=>document.querySelector(".all-showcase").click());
  await page.waitForFunction(()=>document.querySelector("#catalogDialog")?.open===true,{timeout:5000});
  if((await page.$eval("#catalogGrid",el=>el.children.length))!==2)throw new Error("catalog dialog must list both products");
  const catalogImageLoading=await page.$eval("#catalogGrid .catalog-card img",imgs=>imgs.map(img=>({loading:img.loading,decoding:img.decoding})));
  if(!catalogImageLoading.length||catalogImageLoading.some(x=>x.loading!=="lazy"||x.decoding!=="async")){
    throw new Error("catalog images must be lazy/async "+JSON.stringify(catalogImageLoading));
  }
  result.catalogImageLoading="PASS";

  await setInput(page,"#catalogSearch","Moda");
  await page.waitForFunction(()=>document.querySelector("#catalogGrid")?.children.length===1,{timeout:5000});
  const searchTitle=await page.$eval("#catalogGrid .catalog-card h3",el=>el.textContent);
  if(searchTitle!=="BlackGold QA Moda")throw new Error("catalog search failed");
  result.search="PASS";

  await setInput(page,"#catalogSearch","");
  await page.click('[data-filter="Beleza"]');
  await page.waitForFunction(()=>document.querySelector("#catalogGrid")?.children.length===1,{timeout:5000});
  const filterTitle=await page.$eval("#catalogGrid .catalog-card h3",el=>el.textContent);
  if(filterTitle!=="BlackGold QA Beleza")throw new Error("category filter failed");
  result.categoryFilter="PASS";

  const legalHref=await page.$eval("#affiliateNote a",el=>el.getAttribute("href")||"");
  if(legalHref!=="./legal.html")throw new Error("affiliate transparency link missing");

  await page.evaluate(()=>document.querySelector('[data-lang="en"]').click());
  if((await page.$eval("#catalogTitle",el=>el.textContent))!=="Full showcase")throw new Error("EN catalog language failed");
  if(!(await page.$eval("#affiliateNote",el=>el.textContent||"")).includes("affiliate links"))throw new Error("EN affiliate disclosure failed");

  await page.evaluate(()=>document.querySelector('[data-lang="es"]').click());
  if((await page.$eval("#catalogTitle",el=>el.textContent))!=="Vitrina completa")throw new Error("ES catalog language failed");
  if(!(await page.$eval("#affiliateNote",el=>el.textContent||"")).includes("enlaces pueden ser de afiliados"))throw new Error("ES affiliate disclosure failed");

  await page.evaluate(()=>document.querySelector('[data-lang="pt"]').click());
  if((await page.$eval("#catalogTitle",el=>el.textContent))!=="Vitrine completa")throw new Error("PT catalog language failed");
  if(!(await page.$eval("#affiliateNote",el=>el.textContent||"")).includes("links podem ser afiliados"))throw new Error("PT affiliate disclosure failed");
  result.catalogLanguages=["pt","en","es"];
  result.affiliateTransparency="PASS";

  const linkInfo=await page.$eval("#catalogGrid .catalog-card",el=>({
    href:el.getAttribute("href")||"",
    target:el.getAttribute("target")||"",
    rel:el.getAttribute("rel")||"",
    tag:el.tagName
  }));
  if(linkInfo.tag!=="A"||linkInfo.target!=="_blank"||!linkInfo.rel.includes("sponsored")||!linkInfo.rel.includes("noopener")){
    throw new Error("affiliate semantic link contract failed "+JSON.stringify(linkInfo));
  }
  if(!linkInfo.href.startsWith("/api/out?id=")||!linkInfo.href.includes("placement=catalog")){
    throw new Error("tracked product destination href failed "+linkInfo.href);
  }
  const trackedUrl=new URL(linkInfo.href,base);
  const redirect=await fetch(trackedUrl,{redirect:"manual",cache:"no-store"});
  if(redirect.status!==302||redirect.headers.get("location")!=="https://example.com/qa-beleza"||redirect.headers.get("x-blackgold-click-tracking")!=="queued"){
    throw new Error("tracked affiliate redirect failed "+redirect.status+" "+redirect.headers.get("location"));
  }
  let metricRecorded=false;
  for(let attempt=0;attempt<40&&!metricRecorded;attempt++){
    const metrics=await call("/api/admin/metrics");
    metricRecorded=Boolean(metrics.summary?.total>=1&&metrics.products?.some(x=>x.productId===pub.products[0].id||x.title==="BlackGold QA Beleza"));
    if(!metricRecorded)await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(!metricRecorded)throw new Error("affiliate click metric not recorded after async queue");
  result.destinationClick={redirect:302,tracking:"queued",metric:"PASS",semanticLink:"PASS"};

  await page.$eval("#catalogDialog",d=>d.close());
  await page.setViewport({width:310,height:896,deviceScaleFactor:1,isMobile:true});
  await page.goto(base+"/?storefront-mobile="+Date.now(),{waitUntil:"networkidle0",timeout:30000});
  await waitCatalog(page,2);
  await page.evaluate(()=>document.querySelector(".search-hit").click());
  await page.waitForFunction(()=>document.querySelector("#catalogDialog")?.open===true,{timeout:5000});
  const mobile=await page.evaluate(()=>{
    const d=document.querySelector("#catalogDialog").getBoundingClientRect();
    return {
      innerWidth:window.innerWidth,
      innerHeight:window.innerHeight,
      dialogLeft:d.left,
      dialogRight:d.right,
      dialogWidth:d.width,
      pageOverflow:document.documentElement.scrollWidth>window.innerWidth,
      catalogCards:document.querySelectorAll("#catalogGrid .catalog-card").length
    };
  });
  if(mobile.innerWidth!==310||mobile.pageOverflow||mobile.dialogLeft<0||mobile.dialogRight>310.5||mobile.catalogCards!==2){
    throw new Error("mobile catalog interaction mismatch "+JSON.stringify(mobile));
  }
  result.mobileCatalog=mobile;

  console.log(JSON.stringify(result,null,2));
  console.log("BLACKGOLD_STOREFRONT_UI_FLOW=PASS");
}catch(error){
  console.error(error?.stack||error);
  process.exitCode=2;
}finally{
  try{await cleanup()}catch{}
  if(browser)await browser.close();
  const final=await publicProducts().catch(()=>null);
  if(final&&final.total!==0){
    console.error("storefront cleanup failed "+JSON.stringify(final));
    process.exitCode=3;
  }
}
