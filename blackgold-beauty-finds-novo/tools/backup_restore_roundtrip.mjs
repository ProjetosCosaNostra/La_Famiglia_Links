import fs from "node:fs/promises";
import path from "node:path";
import {backupCatalog} from "./catalog_backup.mjs";
import {restoreCatalog} from "./catalog_restore.mjs";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const token=process.env.BLACKGOLD_ADMIN_TOKEN||"";
if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
const auth={authorization:"Bearer "+token};
const out=path.resolve(".visual-gate","backup-roundtrip");

async function call(url,opt={}){
  const h=new Headers(opt.headers||{});h.set("authorization","Bearer "+token);
  if(opt.body&&!(opt.body instanceof FormData))h.set("content-type","application/json");
  const r=await fetch(base+url,{...opt,headers:h,cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(url+" "+r.status+" "+JSON.stringify(d));
  return d;
}
async function cleanup(){
  const d=await call("/api/admin/products");
  for(const p of d.products||[])await call("/api/admin/products?id="+encodeURIComponent(p.id),{method:"DELETE"});
}
async function upload(name){
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7n8AAAAASUVORK5CYII=","base64");
  const form=new FormData();form.append("file",new Blob([png],{type:"image/png"}),name);
  return call("/api/admin/upload",{method:"POST",body:form});
}

await fs.rm(out,{recursive:true,force:true});
await cleanup();
try{
  const up=await upload("backup-roundtrip.png");
  await call("/api/admin/products",{method:"POST",body:JSON.stringify({
    title:"Backup Published",brand:"BlackGold QA",category:"Beleza",description:"roundtrip",
    currency:"BRL",price:"49.90",imageKey:up.key,destinationUrl:"https://example.com/published",
    status:"published",featured:true,order:1
  })});
  await call("/api/admin/products",{method:"POST",body:JSON.stringify({
    title:"Backup Draft",brand:"BlackGold QA",category:"Moda",description:"draft roundtrip",
    currency:"USD",price:"12.50",imageUrl:"https://example.com/image.png",destinationUrl:"",
    status:"draft",featured:false,order:2
  })});

  const before=await call("/api/admin/products");
  if(before.products.length!==2)throw new Error("seed count mismatch");

  await backupCatalog({base,token,out});
  const manifest=JSON.parse(await fs.readFile(path.join(out,"manifest.json"),"utf8"));
  if(manifest.productCount!==2||manifest.mediaCount!==1)throw new Error("backup manifest mismatch");

  await cleanup();
  const empty=await call("/api/admin/products");
  if(empty.products.length!==0)throw new Error("cleanup before restore failed");

  let blocked=false;
  try{await restoreCatalog({base,token,dir:out,confirm:"NO"})}catch{blocked=true}
  if(!blocked)throw new Error("restore confirmation gate failed");

  await restoreCatalog({base,token,dir:out,confirm:"RESTORE"});
  const after=await call("/api/admin/products");
  const published=after.products.filter(p=>p.status==="published");
  const drafts=after.products.filter(p=>p.status==="draft");
  if(after.products.length!==2||published.length!==1||drafts.length!==1)throw new Error("restored state mismatch");
  const publicData=await (await fetch(base+"/api/products?roundtrip=1",{cache:"no-store"})).json();
  if(publicData.total!==1||publicData.products[0].title!=="Backup Published")throw new Error("restored public state mismatch");

  console.log(JSON.stringify({backupProducts:2,backupMedia:1,restoredProducts:2,published:1,drafts:1,publicTotal:1},null,2));
  console.log("BLACKGOLD_BACKUP_RESTORE_ROUNDTRIP=PASS");
}finally{
  await cleanup().catch(()=>{});
}
