import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const chrome=process.env.CHROME_BIN||"";
if(!chrome)throw new Error("CHROME_BIN missing");
const out=path.resolve(".visual-gate","tuning");
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});

const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]});
try{
  const page=await browser.newPage();
  await page.setViewport({width:1448,height:1086,deviceScaleFactor:1});
  await page.goto(base+"/?tuning="+Date.now(),{waitUntil:"networkidle0",timeout:30000});
  await page.waitForFunction(()=>document.body.dataset.catalogCount==="11",{timeout:10000});
  await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})))}); 

  async function applyStyle(css){
    await page.evaluate(cssText=>{
      document.getElementById("__tune_style")?.remove();
      const s=document.createElement("style");
      s.id="__tune_style";
      s.textContent=cssText;
      document.head.appendChild(s);
    },css);
  }
  const selection=[];
  const showcase=[];
  async function snap(id,meta,css){
    await applyStyle(css);
    await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:678,width:1328,height:150},captureBeyondViewport:false});
    showcase.push({id,...meta});
  }

  await applyStyle("");
  await page.screenshot({path:path.join(out,"sel-current.png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
  selection.push({id:"sel-current",kind:"baseline"});

  const baseCss=
    ".showcase-live .product{height:146px!important}"+
    ".showcase-live .media{height:100px!important;flex:0 0 100px!important}"+
    ".showcase-live .media img{transform:scale(.9)!important;transform-origin:center center!important}";
  await snap("show-best-v5",{kind:"baseline-v5",cardH:146,mediaH:100,scale:0.9},baseCss);

  for(const alpha of [0.3,0.45,0.55,0.65,0.75,0.82,0.9,1]){
    for(const mediaBg of ["#fbf3e8","#f9efe4","#f8eee2","#f6eadc"]){
      const id="show-tone-a"+String(alpha).replace(".","p")+"-m"+mediaBg.slice(1);
      const css=
        ".showcase-live .product{height:146px!important;background:rgba(255,255,255,"+alpha+")!important}"+
        ".showcase-live .media{height:100px!important;flex:0 0 100px!important;background:"+mediaBg+"!important}"+
        ".showcase-live .media img{transform:scale(.9)!important;transform-origin:center center!important}";
      await snap(id,{kind:"tone",cardH:146,mediaH:100,scale:0.9,alpha,mediaBg},css);
    }
  }

  await page.evaluate(()=>document.getElementById("__tune_style")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_V6=PASS");
}finally{
  await browser.close();
}
