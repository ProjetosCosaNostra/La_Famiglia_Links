import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const chrome=process.env.CHROME_BIN||"";
const fullSearch=process.env.BLACKGOLD_TUNING_FULL==="1";
if(!chrome)throw new Error("CHROME_BIN missing");

const out=path.resolve(".visual-gate","tuning");
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});

const baselines=[
  {scale:1.05,dx:-6,dy:-21},
  {scale:1.05,dx:-6,dy:-9},
  {scale:1.15,dx:0,dy:-15},
  {scale:1.05,dx:-6,dy:-21},
  {scale:1.05,dx:-6,dy:-9},
  {scale:1.05,dx:-6,dy:-15},
  {scale:1.15,dx:0,dy:-15},
  {scale:1.15,dx:0,dy:-15}
];

function key(v){return [v.scale.toFixed(2),v.dx,v.dy].join("|")}
function localVariants(base){
  const raw=[
    {...base},
    {...base,scale:Number((base.scale-.05).toFixed(2))},
    {...base,scale:Number((base.scale+.05).toFixed(2))},
    {...base,dx:base.dx-4},
    {...base,dx:base.dx+4},
    {...base,dy:base.dy-4},
    {...base,dy:base.dy+4}
  ];
  return [...new Map(raw.map(v=>[key(v),v])).values()];
}
function broadVariants(base){
  const scales=[Math.max(.9,base.scale-.10),Math.max(.9,base.scale-.05),base.scale,base.scale+.05,base.scale+.10].map(v=>Number(v.toFixed(2)));
  const dxs=[base.dx-6,base.dx,base.dx+6];
  const dys=[base.dy-6,base.dy,base.dy+6];
  const out=[];
  for(const scale of scales)for(const dx of dxs)for(const dy of dys)out.push({scale,dx,dy});
  return out;
}

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
    const baseline=baselines[index-1];
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
    const candidates=fullSearch?broadVariants(baseline):localVariants(baseline);
    const variants=[];
    for(const v of candidates){
      await apply(index,v.scale,v.dx,v.dy);
      const id="card"+index+"-s"+String(v.scale).replace(".","p")+"-x"+String(v.dx).replace("-","m")+"-y"+String(v.dy).replace("-","m");
      await page.screenshot({path:path.join(out,id+".png"),clip,captureBeyondViewport:false});
      variants.push({
        id,index,scale:v.scale,dx:v.dx,dy:v.dy,clip,
        baseline:key(v)===key(baseline)
      });
    }
    cards.push({index,clip,baseline,variants});
  }

  await page.evaluate(()=>document.getElementById("__card_tune")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({
    contract:"BLACKGOLD_PER_CARD_STRUCTURAL_TUNING_V2",
    mode:fullSearch?"full":"local-audit",
    cards
  },null,2));
  console.log(JSON.stringify({
    mode:fullSearch?"full":"local-audit",
    cards:cards.length,
    total:cards.reduce((n,c)=>n+c.variants.length,0)
  },null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_PER_CARD=PASS");
}finally{
  await browser.close();
}
