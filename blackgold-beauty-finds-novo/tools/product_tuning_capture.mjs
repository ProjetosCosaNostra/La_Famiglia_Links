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

  await snap("show-baseline",{kind:"baseline"},"");
  await snap("show-card146",{kind:"geometry",cardH:146},
    ".showcase-live .product{height:146px!important}");

  for(const mediaH of [98,100,102,104,106]){
    for(const scale of [0.9,0.95,1,1.05,1.1,1.15,1.2]){
      const id="show-media-h"+mediaH+"-s"+String(scale).replace(".","p");
      const css=
        ".showcase-live .product{height:146px!important}"+
        ".showcase-live .media{height:"+mediaH+"px!important;flex:0 0 "+mediaH+"px!important}"+
        ".showcase-live .media img{transform:scale("+scale+")!important;transform-origin:center center!important}";
      await snap(id,{kind:"media",cardH:146,mediaH,scale},css);
    }
  }

  for(const alpha of [0.55,0.65,0.75,0.82,0.9,1]){
    for(const mediaBg of ["#fbf3e8","#f8eee2","#f7ecdf"]){
      const id="show-tone-a"+String(alpha).replace(".","p")+"-m"+mediaBg.slice(1);
      const css=
        ".showcase-live .product{height:146px!important;background:rgba(255,255,255,"+alpha+")!important}"+
        ".showcase-live .media{height:102px!important;flex:0 0 102px!important;background:"+mediaBg+"!important}"+
        ".showcase-live .media img{transform:scale(1.05)!important;transform-origin:center center!important}";
      await snap(id,{kind:"tone",cardH:146,mediaH:102,scale:1.05,alpha,mediaBg},css);
    }
  }

  await page.evaluate(()=>document.getElementById("__tune_style")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_V5=PASS");
}finally{
  await browser.close();
}
