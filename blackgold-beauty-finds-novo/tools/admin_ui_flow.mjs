import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const token=process.env.BLACKGOLD_ADMIN_TOKEN||"";
const chrome=process.env.CHROME_BIN||"";
if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
if(!chrome)throw new Error("CHROME_BIN missing");

const work=path.resolve(".visual-gate");
await fs.mkdir(work,{recursive:true});
const fixture=path.join(work,"admin-ui-fixture.png");
await fs.writeFile(
  fixture,
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7n8AAAAASUVORK5CYII=","base64")
);

const auth={authorization:"Bearer "+token};
async function adminProducts(){
  const r=await fetch(base+"/api/admin/products",{headers:auth,cache:"no-store"});
  if(!r.ok)throw new Error("admin list "+r.status);
  return r.json();
}
async function publicProducts(){
  const r=await fetch(base+"/api/products?ui="+Date.now(),{cache:"no-store"});
  if(!r.ok)throw new Error("public list "+r.status);
  return r.json();
}
async function waitPublic(predicate,timeout=8000){
  const start=Date.now();
  let last=null;
  while(Date.now()-start<timeout){
    last=await publicProducts();
    if(predicate(last))return last;
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error("public state timeout: "+JSON.stringify(last));
}
async function cleanup(){
  const data=await adminProducts();
  for(const p of data.products||[]){
    const r=await fetch(base+"/api/admin/products?id="+encodeURIComponent(p.id),{method:"DELETE",headers:auth});
    if(!r.ok)throw new Error("cleanup delete "+p.id+" "+r.status);
  }
}
async function waitText(page,selector,fragment,timeout=10000){
  await page.waitForFunction(
    ({selector,fragment})=>(document.querySelector(selector)?.textContent||"").includes(fragment),
    {timeout},
    {selector,fragment}
  );
}
async function setInput(page,selector,value){
  await page.$eval(selector,(el,v)=>{
    el.value=String(v);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  },value);
}

await cleanup();
const result={};
let browser;
try{
  browser=await puppeteer.launch({
    headless:true,
    executablePath:chrome,
    args:["--no-sandbox","--disable-gpu","--hide-scrollbars"]
  });
  const page=await browser.newPage();
  page.on("pageerror",e=>{throw e});
  await page.goto(base+"/admin.html",{waitUntil:"networkidle0",timeout:30000});

  if(!(await page.evaluate(()=>!document.body.classList.contains("unlocked"))))throw new Error("admin did not start locked");
  result.lockedByDefault=true;

  await page.type("#token","wrong-token");
  await page.click("#unlock button[type=submit]");
  await waitText(page,"#lockStatus","Chave incorreta.");
  result.wrongTokenRejected=true;

  await page.$eval("#token",el=>{el.value="";});
  await page.type("#token",token);
  await page.click("#unlock button[type=submit]");
  await page.waitForFunction(()=>document.body.classList.contains("unlocked"),{timeout:10000});
  await waitText(page,"#count","0 produtos");
  result.correctTokenUnlocks=true;

  // Upload then cancel: no orphan media may remain.
  await page.click("#new");
  let input=await page.$("#imageFile");
  await input.uploadFile(fixture);
  await page.waitForFunction(()=>document.querySelector("#form").elements.imageKey.value.startsWith("product-"),{timeout:10000});
  const abandonedKey=await page.$eval("#form",f=>f.elements.imageKey.value);
  await page.click("#cancel");
  await page.waitForFunction(()=>!document.querySelector("#modal").classList.contains("open"),{timeout:10000});
  const abandonedMedia=await fetch(base+"/media/"+encodeURIComponent(abandonedKey),{cache:"no-store"});
  if(abandonedMedia.status!==404)throw new Error("abandoned upload was not removed: "+abandonedMedia.status);
  result.cancelCleansUpload=404;

  // Create one draft through the actual admin form.
  await page.click("#new");
  await setInput(page,'input[name="title"]',"BlackGold Admin UI Test");
  await setInput(page,'input[name="brand"]',"BlackGold QA");
  await setInput(page,'input[name="category"]',"Beleza");
  await setInput(page,'textarea[name="description"]',"Temporary UI regression record.");
  await setInput(page,'input[name="destinationUrl"]',"https://example.com/blackgold-admin-ui");
  await setInput(page,'input[name="price"]',"29.90");
  await page.click('input[name="featured"]');
  input=await page.$("#imageFile");
  await input.uploadFile(fixture);
  await page.waitForFunction(()=>document.querySelector("#form").elements.imageKey.value.startsWith("product-"),{timeout:10000});
  const firstKey=await page.$eval("#form",f=>f.elements.imageKey.value);
  await page.click("#save");
  await page.waitForFunction(()=>document.querySelector("#count").textContent.startsWith("1 "),{timeout:10000});
  await waitText(page,"#list","Rascunho".toLowerCase(),1000).catch(()=>{});
  const afterDraft=await adminProducts();
  if(afterDraft.products?.length!==1||afterDraft.products[0].status!=="draft")throw new Error("draft create via UI failed");
  await waitPublic(data=>data.total===0);
  result.draftViaUi="PASS";

  // Publish through the actual row action.
  await page.click("[data-toggle]");
  await page.waitForFunction(()=>document.querySelector("#list").textContent.includes("published"),{timeout:10000});
  const pub=await waitPublic(data=>data.total===1&&data.products?.[0]?.title==="BlackGold Admin UI Test");
  result.publishViaUi={status:"PASS",total:pub.total};

  // Replace image through edit form; old R2 object must be deleted after save.
  await page.click("[data-edit]");
  input=await page.$("#imageFile");
  await input.uploadFile(fixture);
  await page.waitForFunction(
    old=>document.querySelector("#form").elements.imageKey.value!==old,
    {timeout:10000},
    firstKey
  );
  const secondKey=await page.$eval("#form",f=>f.elements.imageKey.value);
  await page.click("#save");
  await page.waitForFunction(()=>!document.querySelector("#modal").classList.contains("open"),{timeout:10000});
  const oldMedia=await fetch(base+"/media/"+encodeURIComponent(firstKey),{cache:"no-store"});
  const newMedia=await fetch(base+"/media/"+encodeURIComponent(secondKey),{cache:"no-store"});
  if(oldMedia.status!==404||newMedia.status!==200)throw new Error("image replacement cleanup failed "+oldMedia.status+"/"+newMedia.status);
  result.replaceImageCleanup={old:404,current:200};

  // Delete from UI; confirm dialog, row, public record and media must all disappear.
  page.once("dialog",dialog=>dialog.accept());
  await page.click("[data-del]");
  await page.waitForFunction(()=>document.querySelector("#count").textContent.startsWith("0 "),{timeout:10000});
  await waitPublic(data=>data.total===0);
  const deletedMedia=await fetch(base+"/media/"+encodeURIComponent(secondKey),{cache:"no-store"});
  if(deletedMedia.status!==404)throw new Error("deleted UI product media orphan "+deletedMedia.status);
  result.deleteViaUi={catalog:0,media:404};

  await page.goto(base+"/",{waitUntil:"networkidle0",timeout:30000});
  const finalCount=await page.evaluate(()=>document.body.dataset.catalogCount);
  if(finalCount!=="0")throw new Error("storefront did not finish at zero");
  result.storefrontFinalZero=true;

  console.log(JSON.stringify(result,null,2));
  console.log("BLACKGOLD_ADMIN_UI_FLOW=PASS");
}catch(error){
  try{await cleanup()}catch{}
  console.error(error?.stack||error);
  process.exitCode=2;
}finally{
  if(browser)await browser.close();
}
