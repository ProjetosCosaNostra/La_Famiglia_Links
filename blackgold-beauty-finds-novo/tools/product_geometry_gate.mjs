import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const chrome=process.env.CHROME_BIN||[
  "/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].find(p=>fs.existsSync(p));
if(!chrome)throw new Error("Chrome/Edge executable not found");

const tol=0.30;
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=tol;
function assertRect(actual,expected,label){
  for(const k of ["x","y","width","height"]){
    if(!near(actual[k],expected[k]))throw new Error(label+" "+k+" "+actual[k]+" != "+expected[k]);
  }
}
function expectedDesktop(){
  return {
    selection:{x:60,y:460,width:1328,height:157},
    selectionCards:[
      {x:65,y:460,width:432,height:157},
      {x:508,y:460,width:432,height:157},
      {x:951,y:460,width:432,height:157}
    ],
    showcase:{x:60,y:678,width:1328,height:150},
    showcaseCards:Array.from({length:8},(_,i)=>({
      x:65+i*165.75,y:678,width:157.75,height:150
    }))
  };
}
function expectedMobile(){
  const showcaseWidth=(294-(294*.012)*2)/3;
  const gap=294*.012;
  return {
    selection:{x:8,y:380,width:294,height:100},
    selectionCards:[{x:8,y:380,width:294,height:100}],
    showcase:{x:8,y:538,width:294,height:107},
    showcaseCards:Array.from({length:3},(_,i)=>({
      x:8+i*(showcaseWidth+gap),y:538,width:showcaseWidth,height:107
    }))
  };
}

const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]});
const report={contract:"BLACKGOLD_APPROVED_PRODUCT_FOOTPRINT_GATE_V1",tolerancePx:tol,profiles:{}};
try{
  for(const profile of [
    {name:"desktop",width:1448,height:1086,mobile:false,expected:expectedDesktop()},
    {name:"mobile",width:310,height:896,mobile:true,expected:expectedMobile()}
  ]){
    const page=await browser.newPage();
    await page.setViewport({width:profile.width,height:profile.height,deviceScaleFactor:1,isMobile:profile.mobile});
    await page.goto(base+"/?footprint="+Date.now(),{waitUntil:"networkidle0",timeout:30000});
    await page.waitForFunction(()=>document.body.dataset.catalogCount==="11",{timeout:10000});
    await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.addEventListener("load",r,{once:true});img.addEventListener("error",r,{once:true})})))});
    const actual=await page.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
      const visible=el=>getComputedStyle(el).display!=="none"&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
      const selection=document.querySelector(".selection-live");
      const showcase=document.querySelector(".showcase-live");
      return{
        selection:rect(selection),
        selectionCards:[...selection.querySelectorAll(".product")].filter(visible).map(rect),
        showcase:rect(showcase),
        showcaseCards:[...showcase.querySelectorAll(".product")].filter(visible).map(rect),
        overflow:document.documentElement.scrollWidth>window.innerWidth
      };
    });
    if(actual.overflow)throw new Error(profile.name+" horizontal overflow");
    assertRect(actual.selection,profile.expected.selection,profile.name+" selection");
    assertRect(actual.showcase,profile.expected.showcase,profile.name+" showcase");
    if(actual.selectionCards.length!==profile.expected.selectionCards.length)throw new Error(profile.name+" selection visible count "+actual.selectionCards.length);
    if(actual.showcaseCards.length!==profile.expected.showcaseCards.length)throw new Error(profile.name+" showcase visible count "+actual.showcaseCards.length);
    actual.selectionCards.forEach((r,i)=>assertRect(r,profile.expected.selectionCards[i],profile.name+" selection card "+i));
    actual.showcaseCards.forEach((r,i)=>assertRect(r,profile.expected.showcaseCards[i],profile.name+" showcase card "+i));
    report.profiles[profile.name]=actual;
    await page.close();
  }
  console.log(JSON.stringify(report,null,2));
  console.log("BLACKGOLD_PRODUCT_FOOTPRINT_GATE=PASS");
}finally{
  await browser.close();
}
