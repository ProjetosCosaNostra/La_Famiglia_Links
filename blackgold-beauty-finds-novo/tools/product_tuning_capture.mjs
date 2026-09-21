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

  const original=await page.evaluate(()=>({
    selection:document.querySelector(".selection-live .media img")?.getAttribute("style")||"",
    showcase:document.querySelector(".showcase-live .media img")?.getAttribute("style")||""
  }));

  const selection=[];
  for(const y of [-4,0,4,8]){
    for(const scale of [0.96,1,1.04,1.08]){
      const id=`sel-y${y}-s${String(scale).replace(".","p")}`;
      await page.$eval("#__tune_style",el=>el.remove()).catch(()=>{});
      await page.addStyleTag({content:`
        .selection-live .media img{transform:translateY(${y}px) scale(${scale})!important;transform-origin:center center!important}
      `,id:"__tune_style"}).catch(async()=>{
        await page.evaluate(css=>{const s=document.createElement("style");s.id="__tune_style";s.textContent=css;document.head.appendChild(s)},`
          .selection-live .media img{transform:translateY(${y}px) scale(${scale})!important;transform-origin:center center!important}
        `);
      });
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:460,width:1328,height:157},captureBeyondViewport:false});
      selection.push({id,y,scale});
    }
  }

  const showcase=[];
  for(const h of [90,96,102,108]){
    for(const scale of [0.9,1,1.1,1.2,1.3]){
      const id=`show-h${h}-s${String(scale).replace(".","p")}`;
      await page.$eval("#__tune_style",el=>el.remove()).catch(()=>{});
      await page.evaluate(css=>{const s=document.createElement("style");s.id="__tune_style";s.textContent=css;document.head.appendChild(s)},`
        .showcase-live .media{height:${h}px!important}
        .showcase-live .media img{transform:scale(${scale})!important;transform-origin:center center!important}
      `);
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:678,width:1328,height:150},captureBeyondViewport:false});
      showcase.push({id,h,scale});
    }
  }
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE=PASS");
}finally{
  await browser.close();
}
