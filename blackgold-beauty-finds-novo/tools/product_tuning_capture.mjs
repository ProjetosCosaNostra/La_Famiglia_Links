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


  const imageProfiles=await page.evaluate(()=>{
    const rows=[];
    for(const img of document.querySelectorAll(".showcase-live .media img")){
      const product=img.closest(".product");
      const title=product?.querySelector("h3")?.textContent?.trim()||"";
      const nw=img.naturalWidth||0, nh=img.naturalHeight||0;
      let contentBox=null, coverage=null, cornerRGB=null;
      try{
        if(nw&&nh){
          const cv=document.createElement("canvas");
          cv.width=nw; cv.height=nh;
          const ctx=cv.getContext("2d",{willReadFrequently:true});
          ctx.drawImage(img,0,0);
          const d=ctx.getImageData(0,0,nw,nh).data;
          const points=[[0,0],[nw-1,0],[0,nh-1],[nw-1,nh-1]];
          const bg=points.map(([x,y])=>{
            const i=(y*nw+x)*4; return [d[i],d[i+1],d[i+2]];
          }).reduce((a,v)=>a.map((x,j)=>x+v[j]),[0,0,0]).map(x=>x/4);
          let minX=nw,minY=nh,maxX=-1,maxY=-1,count=0;
          for(let y=0;y<nh;y++){
            for(let x=0;x<nw;x++){
              const i=(y*nw+x)*4;
              const dr=d[i]-bg[0], dg=d[i+1]-bg[1], db=d[i+2]-bg[2];
              const dist=Math.sqrt(dr*dr+dg*dg+db*db);
              if(d[i+3]>20 && dist>42){
                count++;
                if(x<minX)minX=x;if(x>maxX)maxX=x;
                if(y<minY)minY=y;if(y>maxY)maxY=y;
              }
            }
          }
          cornerRGB=bg.map(x=>Math.round(x));
          if(maxX>=minX&&maxY>=minY){
            contentBox={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,
              widthRatio:(maxX-minX+1)/nw,heightRatio:(maxY-minY+1)/nh};
            coverage=count/(nw*nh);
          }
        }
      }catch(e){
        contentBox={error:String(e)};
      }
      rows.push({title,naturalWidth:nw,naturalHeight:nh,aspect:nh?nw/nh:null,
        rendered:{width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height},
        cornerRGB,contentBox,coverage});
    }
    return rows;
  });
  console.log(JSON.stringify({contract:"BLACKGOLD_SHOWCASE_IMAGE_PROFILES_V1",images:imageProfiles},null,2));
  await page.evaluate((profiles)=>{
    const imgs=[...document.querySelectorAll(".showcase-live .media img")];
    imgs.forEach((img,i)=>{
      const p=profiles[i]||{};
      const ratio=Number(p.aspect)||0;
      const coverage=Number(p.coverage);
      const widthRatio=Number(p.contentBox?.widthRatio)||0;
      const sparseMedium=ratio>=1.60&&ratio<1.70&&Number.isFinite(coverage)&&coverage>=.20&&coverage<=.31&&widthRatio>=.93;
      const sparseCompact=ratio>0&&ratio<1.50&&Number.isFinite(coverage)&&coverage>=.18&&coverage<=.30&&widthRatio>=.75&&widthRatio<=.95;
      const denseMedium=ratio>=1.60&&ratio<1.70&&Number.isFinite(coverage)&&coverage>=.31&&coverage<=.45&&widthRatio>=.75&&widthRatio<=.90;
      const denseCompact=ratio>0&&ratio<1.50&&Number.isFinite(coverage)&&coverage>=.45&&widthRatio>=.95;
      img.classList.toggle("bg-sparse-medium",sparseMedium);
      img.classList.toggle("bg-sparse-compact",sparseCompact);
      img.classList.toggle("bg-dense-medium",denseMedium);
      img.classList.toggle("bg-dense-compact",denseCompact);
    });
  },imageProfiles);
  await page.evaluate(()=>{
    for(const img of document.querySelectorAll(".showcase-live .media img")){
      const ratio=img.naturalHeight?img.naturalWidth/img.naturalHeight:0;
      img.classList.toggle("bg-extra-wide",ratio>=1.75);
      img.classList.toggle("bg-medium-wide",ratio>=1.60&&ratio<1.70);
      img.classList.toggle("bg-twin-wide",ratio>=1.65&&ratio<1.66);
      img.classList.toggle("bg-mid-narrow",ratio>=1.50&&ratio<1.60);
      img.classList.toggle("bg-upper-wide",ratio>=1.70&&ratio<1.75);
      img.classList.toggle("bg-compact-wide",ratio>0&&ratio<1.50);
    }
  });

  const selection=[];
  for(const top of [474,475,476]){
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
  for(const mediaHeight of [96,100,104,108,112,116,120]){
    const top=698,height=144,alpha=.20;
    const id=`show-media-h${mediaHeight}`;
    await inject(`
      .showcase-live .media{
        height:${mediaHeight}px!important;
      }
    `);
    await page.screenshot({path:path.join(out,id+".png"),clip:{x:60,y:698,width:1328,height:144},captureBeyondViewport:false});
    showcase.push({id,top,height,mediaHeight,alpha,profile:"showcase-media-height"});
  }

  await fs.writeFile(path.join(out,"variants.json"),JSON.stringify({selection,showcase},null,2));
  console.log(JSON.stringify({selection:selection.length,showcase:showcase.length},null,2));
  console.log("BLACKGOLD_PRODUCT_GEOMETRY_TUNING_CAPTURE=PASS");
}finally{
  await browser.close();
}
