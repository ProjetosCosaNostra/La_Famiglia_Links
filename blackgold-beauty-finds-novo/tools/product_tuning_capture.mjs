import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const chrome=process.env.CHROME_BIN||"";
if(!chrome)throw new Error("CHROME_BIN missing");

const out=path.resolve(".visual-gate","tuning");
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});

const scales=[1.05,1.10,1.15,1.20,1.25];
const dxs=[-6,0,6];
const dys=[-21,-15,-9];

const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]});
try{
  const page=await browser.newPage();
  await page.setViewport({width:1448,height:1086,deviceScaleFactor:1});
  await page.goto(base+"/?tuning="+Date.now(),{waitUntil:"networkidle0",timeout:30000});
  await page.waitForFunction(()=>document.body.dataset.catalogCount==="11",{timeout:10000});
  await page.evaluate(async()=>{
    const imgs=[...document.querySelectorAll(".showcase-live img")].filter(img=>{
      const r=img.getBoundingClientRect();
      return r.width>0&&r.height>0&&getComputedStyle(img).display!=="none";
    });
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
      img.addEventListener("load",resolve,{once:true});
      img.addEventListener("error",resolve,{once:true});
    })));
  });

  async function apply(index,scale,dx,dy){
    const css=".showcase-live .product:nth-child("+index+") .media img{transform:translateX("+dx+"px) translateY("+dy+"px) scale("+scale+")!important;transform-origin:center center!important}";
    await page.evaluate(cssText=>{
      document.getElementById("__card_tune")?.remove();
      const s=document.createElement("style");
      s.id="__card_tune";
      s.textContent=cssText;
      document.head.appendChild(s);
    },css);
  }

  const cards=[];
  for(let index=1;index<=8;index++){
    const rect=await page.$eval(".showcase-live .product:nth-child("+index+")",el=>{
      const r=el.getBoundingClientRect();
      return{x:r.x,y:r.y,width:r.width,height:r.height};
    });
    const clip={
      x:Math.max(0,Math.round(rect.x)),
      y:Math.max(0,Math.round(rect.y)),
      width:Math.max(1,Math.round(rect.width)),
      height:Math.max(1,Math.round(rect.height))
    };
    const variants=[];
    for(const scale of scales){
      for(const dx of dxs){
        for(const dy of dys){
          await apply(index,scale,dx,dy);
          const id="card"+index+"-s"+String(scale).replace(".","p")+"-x"+String(dx).replace("-","m")+"-y"+String(dy).replace("-","m");
          await page.screenshot({path:path.join(out,id+".png"),clip,captureBeyondViewport:false});
          variants.push({id,index,scale,dx,dy,clip,baseline:scale===1.15&&dx===0&&dy===-15});
        }
      }
    }
    cards.push({index,clip,variants});
  }

  await page.evaluate(()=>document.getElementById("__card_tune")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({
    contract:"BLACKGOLD_PER_CARD_STRUCTURAL_TUNING_V1",
    scales,dxs,dys,cards
  },null,2));
  console.log(JSON.stringify({cards:cards.length,variantsPerCard:cards[0]?.variants.length||0,total:cards.reduce((n,c)=>n+c.variants.length,0)},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_PER_CARD=PASS");
}finally{
  await browser.close();
}
