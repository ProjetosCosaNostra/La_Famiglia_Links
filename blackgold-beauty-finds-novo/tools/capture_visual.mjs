import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const args=process.argv.slice(2);
const get=(name,fallback="")=>{
  const i=args.indexOf(name);
  return i>=0&&args[i+1]?args[i+1]:fallback;
};
const base=get("--base","http://127.0.0.1:8799");
const out=path.resolve(get("--out",".visual-gate"));
const prefix=get("--prefix","candidate");
const chrome=process.env.CHROME_BIN || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].find(p=>fs.existsSync(p));

if(!chrome)throw new Error("Chrome/Edge executable not found.");
fs.mkdirSync(out,{recursive:true});

const browser=await puppeteer.launch({
  headless:true,
  executablePath:chrome,
  args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]
});
try{
  for(const [name,width,height] of [["desktop",1448,1086],["mobile",390,1152]]){
    const page=await browser.newPage();
    await page.setViewport({width,height,deviceScaleFactor:1,isMobile:name==="mobile"});
    await page.goto(base,{waitUntil:"networkidle0",timeout:30000});
    await page.screenshot({
      path:path.join(out,`${prefix}-${name}.png`),
      fullPage:false,
      captureBeyondViewport:false
    });
    const metrics=await page.evaluate(()=>({
      innerWidth:window.innerWidth,
      innerHeight:window.innerHeight,
      renderWidth:Number(document.documentElement.dataset.renderWidth||0),
      viewportWidth:Number(document.documentElement.dataset.viewportWidth||0),
      overflow:document.documentElement.dataset.horizontalOverflow||""
    }));
    if(metrics.innerWidth!==width||metrics.innerHeight!==height){
      throw new Error(`${name} viewport mismatch ${metrics.innerWidth}x${metrics.innerHeight} != ${width}x${height}`);
    }
    await page.close();
  }
  console.log("BLACKGOLD_EXPLICIT_VIEWPORT_CAPTURE=PASS");
}finally{
  await browser.close();
}
