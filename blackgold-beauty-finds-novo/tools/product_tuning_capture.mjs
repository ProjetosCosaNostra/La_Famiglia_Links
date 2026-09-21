import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const chrome=process.env.CHROME_BIN||"";
if(!chrome)throw new Error("CHROME_BIN missing");
const out=path.resolve(".visual-gate","tuning");
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});

const H=1086;
const pct=v=>(v/H*100).toFixed(9)+"%";
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]});
try{
  const page=await browser.newPage();
  await page.setViewport({width:1448,height:1086,deviceScaleFactor:1});
  await page.goto(base+"/?geometry-tuning="+Date.now(),{waitUntil:"networkidle0",timeout:30000});
  await page.waitForFunction(()=>document.body.dataset.catalogCount==="11",{timeout:10000});
  await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})))}); 

  async function inject(css){
    await page.evaluate(cssText=>{
      document.getElementById("__tune_style")?.remove();
      const s=document.createElement("style");
      s.id="__tune_style";
      s.textContent=cssText;
      document.head.appendChild(s);
    },css);
  }

  const selection=[];
  for(const top of [474,475,476,477,478]){
    for(const imgY of [-16,-14,-12]){
      for(const alpha of [.10,.20,.30]){
        const id=`sel-top${top}-iy${imgY}-a${String(alpha).replace(".","_")}`;
        await inject(`
          .selection-live{top:${pct(top)}!important;height:${pct(157)}!important}
          .selection-live .product{background:rgba(255,255,255,${alpha})!important}
          .selection-live .media{background:#fbf4e9!important}
          .selection-live .media img{transform:translate(-14px,${imgY}px) scale(.94)!important;transform-origin:center center!important}
        `);
        await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
        selection.push({id,top,height:157,imgX:-14,imgY,scale:.94,alpha});
      }
    }
  }

  const showcase=[];
  for(const top of [696,697,698,699,700]){
    for(const height of [142,144,146]){
      for(const imgY of [-22,-20,-18]){
        for(const alpha of [.10,.20,.30]){
          const id=`show-top${top}-h${height}-iy${imgY}-a${String(alpha).replace(".","_")}`;
          await inject(`
            .showcase-live{top:${pct(top)}!important;height:${pct(height)}!important}
            .showcase-live .product{background:rgba(255,255,255,${alpha})!important}
            .showcase-live .media{height:96.234375px!important;background:#fbf3e8!important}
            .showcase-live .media img{transform:translate(-20px,${imgY}px) scale(1.05)!important;transform-origin:center center!important}
          `);
          await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:698,width:1328,height:144},captureBeyondViewport:false});
          showcase.push({id,top,height,imgX:-20,imgY,scale:1.05,alpha});
        }
      }
    }
  }

  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_GEOMETRY_TUNING_CAPTURE=PASS");
}finally{
  await browser.close();
}
