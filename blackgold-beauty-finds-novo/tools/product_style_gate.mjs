import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const chrome=process.env.CHROME_BIN||[
  "/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].find(p=>fs.existsSync(p));
if(!chrome)throw new Error("Chrome/Edge executable not found");

const expected={
  selection:{
    borderColor:"rgb(234, 223, 208)",
    borderRadius:"8px",
    backgroundAlpha:.10,
    padding:"7px",
    mediaBg:"rgb(251, 244, 233)",
    mediaRadius:"7px",
    titleSize:"13px",
    metaSize:"9px",
    descSize:"10px",
    priceSize:"14px",
    detailHeight:28
  },
  showcase:{
    borderColor:"rgb(229, 216, 200)",
    borderRadius:"7px",
    backgroundAlpha:.20,
    padding:"5px",
    mediaBg:"rgb(251, 243, 232)",
    mediaRadius:"5px",
    mediaHeight:96.234375,
    titleSize:"9px",
    priceSize:"9px"
  }
};

function alphaOf(bg){
  const m=String(bg).match(/rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([0-9.]+))?\)/i);
  return m?(m[1]===undefined?1:Number(m[1])):null;
}
const near=(a,b,t=.02)=>Math.abs(Number(a)-Number(b))<=t;
const fail=(cond,msg)=>{if(!cond)throw new Error(msg)};

const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]});
const report={contract:"BLACKGOLD_APPROVED_PRODUCT_STYLE_GATE_V1",profiles:{}};
try{
  for(const p of [
    {name:"desktop",width:1448,height:1086,mobile:false},
    {name:"mobile",width:390,height:1152,mobile:true}
  ]){
    const page=await browser.newPage();
    await page.setViewport({width:p.width,height:p.height,deviceScaleFactor:1,isMobile:p.mobile});
    await page.goto(base+"/?style-gate="+Date.now(),{waitUntil:"networkidle0",timeout:30000});
    await page.waitForFunction(()=>document.body.dataset.catalogCount==="11",{timeout:10000});
    await page.waitForFunction(()=>[...document.querySelectorAll("#showcase .media img")].every(img=>img.complete&&img.naturalWidth>0),{timeout:10000});
    const data=await page.evaluate(()=>{
      const style=el=>getComputedStyle(el);
      const one=(root,selector)=>root.querySelector(selector);
      const selections=[...document.querySelectorAll("#selection .product")].filter(el=>style(el).display!=="none");
      const showcases=[...document.querySelectorAll("#showcase .product")].filter(el=>style(el).display!=="none");
      const pack=el=>{
        const s=style(el),media=one(el,".media"),title=one(el,"h3"),price=one(el,".price");
        return{
          display:s.display,borderColor:s.borderColor,borderRadius:s.borderRadius,background:s.backgroundColor,
          padding:s.padding,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,
          media:media?{background:style(media).backgroundColor,borderRadius:style(media).borderRadius,width:media.getBoundingClientRect().width,height:media.getBoundingClientRect().height,objectFit:media.querySelector("img")?style(media.querySelector("img")).objectFit:""}:null,
          title:title?{fontSize:style(title).fontSize,fontFamily:style(title).fontFamily}:null,
          price:price?{fontSize:style(price).fontSize}:null
        };
      };
      const sel=selections[0];
      const showcaseImages=showcases.map(el=>one(el,".media img")).filter(Boolean).map(img=>{const s=style(img);const m=new DOMMatrix(s.transform==="none"?"matrix(1,0,0,1,0,0)":s.transform);return{extraWide:img.classList.contains("fit-extra-wide"),upperWide:img.classList.contains("fit-upper-wide"),midNarrow:img.classList.contains("fit-mid-narrow"),compactWide:img.classList.contains("fit-compact-wide"),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,ratio:img.naturalHeight?img.naturalWidth/img.naturalHeight:0,transform:{a:m.a,d:m.d,x:m.e,y:m.f}}});
      return{
        selectionCount:selections.length,
        showcaseCount:showcases.length,
        selection:sel?{
          ...pack(sel),
          meta:one(sel,".meta")?style(one(sel,".meta")).fontSize:"",
          desc:one(sel,".desc")?style(one(sel,".desc")).fontSize:"",
          detail:one(sel,".detail")?{height:one(sel,".detail").getBoundingClientRect().height}:null
        }:null,
        showcase:showcases[0]?pack(showcases[0]):null,
        showcaseImages,
        overflow:document.documentElement.scrollWidth>window.innerWidth
      };
    });
    fail(!data.overflow,p.name+" overflow");
    if(p.name==="desktop"){
      fail(data.selectionCount===3,"desktop selection count");
      fail(data.showcaseCount===8,"desktop showcase count");
      const a=data.selection,b=data.showcase;
      fail(a.borderColor===expected.selection.borderColor,"selection border color "+a.borderColor);
      fail(a.borderRadius===expected.selection.borderRadius,"selection radius "+a.borderRadius);
      fail(near(alphaOf(a.background),expected.selection.backgroundAlpha,.02),"selection background alpha "+a.background);
      fail(a.padding===expected.selection.padding,"selection padding "+a.padding);
      fail(a.media.background===expected.selection.mediaBg,"selection media background "+a.media.background);
      fail(a.media.borderRadius===expected.selection.mediaRadius,"selection media radius "+a.media.borderRadius);
      fail(a.media.objectFit==="contain","selection object-fit");
      fail(a.title.fontSize===expected.selection.titleSize,"selection title size "+a.title.fontSize);
      fail(a.meta===expected.selection.metaSize,"selection meta size "+a.meta);
      fail(a.desc===expected.selection.descSize,"selection desc size "+a.desc);
      fail(a.price.fontSize===expected.selection.priceSize,"selection price size "+a.price.fontSize);
      fail(near(a.detail.height,expected.selection.detailHeight,.35),"selection detail height "+a.detail.height);
      fail(/Cormorant Garamond|Georgia/.test(a.title.fontFamily),"selection title family "+a.title.fontFamily);

      fail(b.borderColor===expected.showcase.borderColor,"showcase border color "+b.borderColor);
      fail(b.borderRadius===expected.showcase.borderRadius,"showcase radius "+b.borderRadius);
      fail(near(alphaOf(b.background),expected.showcase.backgroundAlpha,.02),"showcase background alpha "+b.background);
      fail(b.padding===expected.showcase.padding,"showcase padding "+b.padding);
      fail(b.media.background===expected.showcase.mediaBg,"showcase media background "+b.media.background);
      fail(b.media.borderRadius===expected.showcase.mediaRadius,"showcase media radius "+b.media.borderRadius);
      fail(near(b.media.height,expected.showcase.mediaHeight,.35),"showcase media height "+b.media.height);
      fail(b.media.objectFit==="contain","showcase object-fit");
      fail(b.title.fontSize===expected.showcase.titleSize,"showcase title size "+b.title.fontSize);
      fail(b.price.fontSize===expected.showcase.priceSize,"showcase price size "+b.price.fontSize);
      const wide=data.showcaseImages.filter(x=>x.extraWide);
      fail(wide.length===1,"showcase extra-wide profile count "+wide.length);
      fail(wide[0].ratio>=1.75,"showcase extra-wide ratio "+wide[0].ratio);
      fail(near(wide[0].transform.a,1.34,.005)&&near(wide[0].transform.d,1.34,.005),"showcase extra-wide scale "+JSON.stringify(wide[0].transform));
      fail(near(wide[0].transform.x,-38,.05)&&near(wide[0].transform.y,-19,.05),"showcase extra-wide framing "+JSON.stringify(wide[0].transform));
      const upper=data.showcaseImages.filter(x=>x.upperWide);
      fail(upper.length===1,"showcase upper-wide profile count "+upper.length);
      fail(upper[0].ratio>=1.70&&upper[0].ratio<1.75,"showcase upper-wide ratio "+upper[0].ratio);
      fail(near(upper[0].transform.a,.85,.005)&&near(upper[0].transform.d,.85,.005),"showcase upper-wide scale "+JSON.stringify(upper[0].transform));
      fail(near(upper[0].transform.x,-30,.05)&&near(upper[0].transform.y,-10,.05),"showcase upper-wide framing "+JSON.stringify(upper[0].transform));
      const mid=data.showcaseImages.filter(x=>x.midNarrow);
      fail(mid.length===1,"showcase mid-narrow profile count "+mid.length);
      fail(mid[0].ratio>=1.50&&mid[0].ratio<1.60,"showcase mid-narrow ratio "+mid[0].ratio);
      fail(near(mid[0].transform.a,.95,.005)&&near(mid[0].transform.d,.95,.005),"showcase mid-narrow scale "+JSON.stringify(mid[0].transform));
      fail(near(mid[0].transform.x,-30,.05)&&near(mid[0].transform.y,-20,.05),"showcase mid-narrow framing "+JSON.stringify(mid[0].transform));
      const compact=data.showcaseImages.filter(x=>x.compactWide);
      fail(compact.length===2,"showcase compact-wide profile count "+compact.length);
      fail(compact.every(x=>x.ratio>0&&x.ratio<1.50),"showcase compact-wide ratio "+JSON.stringify(compact.map(x=>x.ratio)));
      fail(compact.every(x=>near(x.transform.a,.95,.005)&&near(x.transform.d,.95,.005)),"showcase compact-wide scale "+JSON.stringify(compact.map(x=>x.transform)));
      fail(compact.every(x=>near(x.transform.x,-20,.05)&&near(x.transform.y,0,.05)),"showcase compact-wide framing "+JSON.stringify(compact.map(x=>x.transform)));
      const normal=data.showcaseImages.find(x=>!x.extraWide&&!x.upperWide&&!x.midNarrow&&!x.compactWide);
      fail(!!normal,"showcase normal profile missing");
      fail(near(normal.transform.x,-20,.05)&&near(normal.transform.y,-20,.05),"showcase normal framing "+JSON.stringify(normal.transform));
    }else{
      fail(data.selectionCount===1,"mobile selection count");
      fail(data.showcaseCount===3,"mobile showcase count");
      fail(data.selection.width>=373&&data.selection.width<=375,"mobile selection width "+data.selection.width);
      fail(data.showcase.width>=125&&data.showcase.width<=127,"mobile showcase card width "+data.showcase.width);
      fail(data.selection.media.objectFit==="contain","mobile selection object-fit");
      fail(data.showcase.media.objectFit==="contain","mobile showcase object-fit");
    }
    report.profiles[p.name]=data;
    await page.close();
  }
  console.log(JSON.stringify(report,null,2));
  console.log("BLACKGOLD_APPROVED_PRODUCT_STYLE_GATE=PASS");
}finally{
  await browser.close();
}
