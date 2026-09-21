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
  // Stage A: retain the already-proven image transform search.
  for(const y of [-4,0,4,8]){
    for(const scale of [0.96,1,1.04,1.08]){
      const id=`sel-img-y${y}-s${String(scale).replace(".","p")}`;
      await applyStyle(`
        .selection-live .media img{transform:translateY(${y}px) scale(${scale})!important;transform-origin:center center!important}
      `);
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
      selection.push({id,kind:"image",y,scale});
    }
  }

  // Stage B: measure the media/copy split and copy inset against the approved cards.
  // Current implementation is 50/50 with 12px copy inset; variants are diagnostic only.
  for(const mediaPct of [47,48,49,50]){
    for(const copyLeft of [8,10,12]){
      const id=`sel-layout-m${mediaPct}-p${copyLeft}`;
      await applyStyle(`
        .selection-live .product{grid-template-columns:${mediaPct}% ${100-mediaPct}%!important}
        .selection-live .copy{padding-left:${copyLeft}px!important}
      `);
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
      selection.push({id,kind:"layout",mediaPct,copyLeft});
    }
  }

  const showcase=[];
  // Stage A: preserve the existing flexible-media search.
  for(const h of [90,96,102,108]){
    for(const scale of [0.9,1,1.1,1.2,1.3]){
      const id=`show-flex-h${h}-s${String(scale).replace(".","p")}`;
      await applyStyle(`
        .showcase-live .media{height:${h}px!important}
        .showcase-live .media img{transform:scale(${scale})!important;transform-origin:center center!important}
      `);
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:698,width:1328,height:144},captureBeyondViewport:false});
      showcase.push({id,kind:"flex",h,scale});
    }
  }

  // Stage B: test fixed media footprints. This avoids flex shrink hiding the true approved height.
  for(const h of [90,94,98,102]){
    for(const scale of [0.9,0.95,1,1.05]){
      const id=`show-fixed-h${h}-s${String(scale).replace(".","p")}`;
      await applyStyle(`
        .showcase-live .media{height:${h}px!important;flex:0 0 ${h}px!important}
        .showcase-live .media img{transform:scale(${scale})!important;transform-origin:center center!important}
      `);
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:698,width:1328,height:144},captureBeyondViewport:false});
      showcase.push({id,kind:"fixed",h,scale});
    }
  }

  await page.evaluate(()=>document.getElementById("__tune_style")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_V2=PASS");
}finally{
  await browser.close();
}
