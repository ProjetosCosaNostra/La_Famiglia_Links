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
  for(const x of [-8,-4,0,4]){
    for(const y of [-6,-4,-2,0]){
      for(const scale of [0.94,0.96,0.98]){
        const id=`sel-x${x}-y${y}-s${String(scale).replace(".","p")}`;
        await inject(`.selection-live .media img{transform:translate(${x}px,${y}px) scale(${scale})!important;transform-origin:center center!important}`);
        await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
        selection.push({id,x,y,scale});
      }
    }
  }

  const showcase=[];
  for(const x of [-16,-12,-8,-4,0]){
    for(const y of [-4,0,4]){
      for(const h of [96,102,108]){
        for(const scale of [0.85,0.9,0.95]){
          const id=`show-x${x}-y${y}-h${h}-s${String(scale).replace(".","p")}`;
          await inject(`.showcase-live .media{height:${h}px!important}.showcase-live .media img{transform:translate(${x}px,${y}px) scale(${scale})!important;transform-origin:center center!important}`);
          await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:698,width:1328,height:144},captureBeyondViewport:false});
          showcase.push({id,x,y,h,scale});
        }
      }
    }
  }
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE=PASS");
}finally{
  await browser.close();
}
