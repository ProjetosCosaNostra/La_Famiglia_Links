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

  for(const alpha of [0.2,0.25,0.3,0.35,0.4]){
    for(const mediaH of [98,100,102]){
      for(const scale of [0.85,0.9,0.95,1]){
        const id="show-a"+String(alpha).replace(".","p")+"-h"+mediaH+"-s"+String(scale).replace(".","p");
        const css=
          ".showcase-live .product{height:146px!important;background:rgba(255,255,255,"+alpha+")!important}"+
          ".showcase-live .media{height:"+mediaH+"px!important;flex:0 0 "+mediaH+"px!important;background:#f8eee2!important}"+
          ".showcase-live .media img{transform:scale("+scale+")!important;transform-origin:center center!important}";
        await snap(id,{kind:"fine",cardH:146,alpha,mediaH,scale,mediaBg:"#f8eee2"},css);
      }
    }
  }

  await page.evaluate(()=>document.getElementById("__tune_style")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_V7=PASS");
}finally{
  await browser.close();
}
