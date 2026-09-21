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
  await page.evaluate(async()=>{const imgs=[...document.querySelectorAll(".authority-picture img,.selection-live img,.showcase-live img")].filter(img=>{const r=img.getBoundingClientRect(),s=getComputedStyle(img);return s.display!=="none"&&r.width>0&&r.height>0});await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})))}); 

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

  for(const dx of [-16,-12,-8,-4,0,4]){
    const id="show-x"+String(dx).replace("-","m");
    const css=".showcase-live .media img{transform:translateX("+dx+"px) translateY(-15px) scale(1.15)!important;transform-origin:center center!important}";
    await snap(id,{kind:"horizontal",dx,scale:1.15,dy:-15},css);
  }

  await page.evaluate(()=>document.getElementById("__tune_style")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_V9=PASS");
}finally{
  await browser.close();
}
