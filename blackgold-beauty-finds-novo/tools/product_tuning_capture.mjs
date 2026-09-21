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
  await applyStyle("");
  await page.screenshot({path:path.join(out,"sel-current.png"),clip:{x:60,y:476,width:1328,height:157},captureBeyondViewport:false});
  selection.push({id:"sel-current",kind:"baseline"});

  const showcase=[];
  async function snap(id,meta,css){
    await applyStyle(css);
    await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:678,width:1328,height:150},captureBeyondViewport:false});
    showcase.push({id,...meta});
  }

  await snap("show-baseline",{kind:"baseline"},"");

  // Geometry search against the full approved Vitrine product region (y=678..827).
  for(const top of [678,682,686,690,694,698]){
    for(const cardH of [138,142,144,146]){
      const id=`show-geo-t${top}-h${cardH}`;
      await snap(id,{kind:"geometry",top,cardH},`
        .showcase-live{top:${top}px!important;height:150px!important}
        .showcase-live .product{height:${cardH}px!important;align-self:start!important}
      `);
    }
  }

  // Tonal search. The approved mockup is warmer/darker than the current opaque #fffdf9 override.
  for(const alpha of [0.55,0.65,0.75,0.82,0.9]){
    for(const mediaBg of ["#fbf3e8","#f8eee2","#f7ecdf"]){
      const tag=mediaBg.slice(1);
      const id=`show-tone-a${String(alpha).replace(".","p")}-m${tag}`;
      await snap(id,{kind:"tone",top:678,cardH:138,alpha,mediaBg},`
        .showcase-live{top:678px!important;height:150px!important}
        .showcase-live .product{height:138px!important;align-self:start!important;background:rgba(255,255,255,${alpha})!important}
        .showcase-live .media{background:${mediaBg}!important}
      `);
    }
  }

  // Combined geometry + original historical translucent card treatment.
  for(const top of [678,682,686]){
    for(const cardH of [138,142]){
      const id=`show-historic-t${top}-h${cardH}`;
      await snap(id,{kind:"historic",top,cardH,alpha:0.82,mediaBg:"#fbf3e8"},`
        .showcase-live{top:${top}px!important;height:150px!important}
        .showcase-live .product{height:${cardH}px!important;align-self:start!important;background:rgba(255,255,255,.82)!important}
        .showcase-live .media{background:#fbf3e8!important}
        .showcase-live .media img{transform:scale(.9)!important}
      `);
    }
  }

  await page.evaluate(()=>document.getElementById("__tune_style")?.remove());
  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_TUNING_CAPTURE_V4=PASS");
}finally{
  await browser.close();
}
