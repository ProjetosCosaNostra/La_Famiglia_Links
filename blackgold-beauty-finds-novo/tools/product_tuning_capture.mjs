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
  for(const mediaPct of [44,45,46,47,48]){
    for(const copyLeft of [8,10,12,16,20]){
      const id=`sel-layout-m${mediaPct}-p${copyLeft}`;
      await applyStyle(`
        .selection-live .product{grid-template-columns:${mediaPct}% ${100-mediaPct}%!important}
        .selection-live .copy{padding-left:${copyLeft}px!important}
      `);
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
      selection.push({id,kind:"layout",mediaPct,copyLeft});
    }
  }

  const selectionPresets=[
    {
      id:"sel-historical-v18-12",
      css:`
        .selection-live .product{grid-template-columns:48% 52%!important}
        .selection-live .copy{padding:5px 7px 4px 20px!important}
        .selection-live .product h3{font-size:14px!important;line-height:1.04!important}
        .selection-live .meta{font-size:9px!important}
        .selection-live .desc{font-size:10.5px!important;line-height:1.28!important;margin-top:6px!important;max-width:180px!important}
        .selection-live .media img{transform:none!important;padding:0!important}
        .selection-live .product:nth-child(1) .media img{padding:4px 7px!important}
        .selection-live .product:nth-child(2) .media img{padding:8px 10px!important}
        .selection-live .product:nth-child(3) .media img{padding:7px 10px!important}
      `
    },
    {
      id:"sel-historical-type-current-media",
      css:`
        .selection-live .product{grid-template-columns:48% 52%!important}
        .selection-live .copy{padding:5px 7px 4px 20px!important}
        .selection-live .product h3{font-size:14px!important;line-height:1.04!important}
        .selection-live .meta{font-size:9px!important}
        .selection-live .desc{font-size:10.5px!important;line-height:1.28!important;margin-top:6px!important;max-width:180px!important}
      `
    },
    {
      id:"sel-current-layout-historical-type",
      css:`
        .selection-live .product{grid-template-columns:47% 53%!important}
        .selection-live .copy{padding:5px 7px 4px 10px!important}
        .selection-live .product h3{font-size:14px!important;line-height:1.04!important}
        .selection-live .meta{font-size:9px!important}
        .selection-live .desc{font-size:10.5px!important;line-height:1.28!important;margin-top:6px!important;max-width:180px!important}
      `
    }
  ];
  for(const v of selectionPresets){
    await applyStyle(v.css);
    await page.screenshot({path:path.join(out,v.id+".png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
    selection.push({id:v.id,kind:"preset"});
  }

  const showcase=[];
  for(const h of [94,96,98,100]){
    for(const scale of [0.88,0.9,0.92,0.95,1]){
      const id=`show-fixed-h${h}-s${String(scale).replace(".","p")}`;
      await applyStyle(`
        .showcase-live .media{height:${h}px!important;flex:0 0 ${h}px!important}
        .showcase-live .media img{padding:0!important;transform:scale(${scale})!important;transform-origin:center center!important}
      `);
      await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:698,width:1328,height:144},captureBeyondViewport:false});
      showcase.push({id,kind:"fixed",h,scale});
    }
  }

  const showcasePresets=[
    {
      id:"show-historical-v18-12",
      css:`
        .showcase-live .product{height:145px!important}
        .showcase-live .media{height:96px!important;flex:0 0 96px!important}
        .showcase-live .media img{padding:3px 5px!important;transform:none!important}
      `
    },
    {
      id:"show-historical-v19-8",
      css:`
        .showcase-live .product{height:145px!important}
        .showcase-live .media{height:96px!important;flex:0 0 96px!important}
        .showcase-live .media img{padding:3px 5px!important;transform:none!important}
        .showcase-live .product:nth-child(1) .media img,
        .showcase-live .product:nth-child(3) .media img,
        .showcase-live .product:nth-child(8) .media img{padding:0!important;transform:scale(1.055)!important}
      `
    },
    {
      id:"show-historical-media-only",
      css:`
        .showcase-live .media{height:96px!important;flex:0 0 96px!important}
        .showcase-live .media img{padding:3px 5px!important;transform:none!important}
        .showcase-live .product:nth-child(1) .media img,
        .showcase-live .product:nth-child(3) .media img,
        .showcase-live .product:nth-child(8) .media img{padding:0!important;transform:scale(1.055)!important}
      `
    }
  ];
  for(const v of showcasePresets){
    await applyStyle(v.css);
    await page.screenshot({path:path.join(out,v.id+".png"),clip:{x:60,y:698,width:1328,height:144},captureBeyondViewport:false});
    showcase.push({id:v.id,kind:"preset"});
  }

  await page.evaluate(()=>document.getElementById("__tune_style")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_V3=PASS");
}finally{
  await browser.close();
}
