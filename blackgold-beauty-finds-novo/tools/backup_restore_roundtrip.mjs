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
  if(opt.body&&!(opt.body instanceof FormData)&&!h.has("content-type"))h.set("content-type","application/json");
  const r=await fetch(base+url,{...opt,headers:h,cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(url+" "+r.status+" "+JSON.stringify(d));
  return d;
}
async function upload(name){
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7n8AAAAASUVORK5CYII=","base64");
  const form=new FormData();form.append("file",new Blob([png],{type:"image/png"}),name);
  return call("/api/admin/upload",{method:"POST",body:form});
}
async function clearDb(){
  const empty={
    schema:"blackgold-db-snapshot-v1",
    createdAt:new Date().toISOString(),
    counts:{products:0,revisions:0,archives:0,audit:0},
    data:{products:[],revisions:[],archives:[],audit:[]}
  };
  return call("/api/admin/snapshot",{
    method:"POST",
    body:JSON.stringify({
      confirm:"RESTORE_BLACKGOLD_SNAPSHOT",
      replace:true,
      replaceConfirm:"REPLACE_ALL_BLACKGOLD_DATA",
      snapshot:empty
    })
  });
}
async function cleanupProducts(){
  const d=await call("/api/admin/products");
  for(const p of d.products||[])await call("/api/admin/products?id="+encodeURIComponent(p.id),{method:"DELETE"});
}
async function deleteMedia(key){
  const r=await fetch(base+"/api/admin/disaster-media?key="+encodeURIComponent(key),{
    method:"DELETE",
    headers:{...auth,"x-blackgold-restore-confirm":"DELETE_RESTORE_MEDIA"},
    cache:"no-store"
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error("media delete "+key+" "+r.status+" "+JSON.stringify(d));
}

await fs.rm(out,{recursive:true,force:true});
await clearDb();

try{
  const activeMedia=await upload("backup-active.png");
  const active=await call("/api/admin/products",{method:"POST",body:JSON.stringify({
    title:"Backup Published",brand:"BlackGold QA",category:"Beleza",description:"roundtrip active",
    currency:"BRL",price:"49.90",imageKey:activeMedia.key,destinationUrl:"https://example.com/published",
    status:"published",featured:true,order:1
  })});
  await call("/api/admin/products",{method:"POST",body:JSON.stringify({
    title:"Backup Draft",brand:"BlackGold QA",category:"Moda",description:"draft roundtrip",
    currency:"USD",price:"12.50",imageUrl:"https://example.com/image.png",destinationUrl:"",
    status:"draft",featured:false,order:2
  })});

  const deletedMedia=await upload("backup-deleted.png");
  const deleted=await call("/api/admin/products",{method:"POST",body:JSON.stringify({
    title:"Backup Deleted",brand:"BlackGold QA",category:"Skincare",description:"trash roundtrip",
    currency:"BRL",price:"27.00",imageKey:deletedMedia.key,destinationUrl:"https://example.com/deleted",
    status:"published",featured:false,order:3
  })});
  await call("/api/admin/products?id="+encodeURIComponent(deleted.product.id),{method:"DELETE"});

  const seeded=await call("/api/admin/snapshot");
  if(seeded.counts.products!==2||seeded.counts.archives<1||seeded.counts.revisions<1)throw new Error("seeded snapshot mismatch "+JSON.stringify(seeded.counts));

  const trashBefore=await call("/api/admin/trash?limit=20");
  const deletedTrash=trashBefore.items?.find(x=>x.productId===deleted.product.id);
  if(!deletedTrash?.imageArchived||!deletedTrash?.archiveKey)throw new Error("deleted product archive missing");

  const publicArchiveBefore=await fetch(base+"/media/"+deletedTrash.archiveKey,{cache:"no-store"});
  if(publicArchiveBefore.status!==404)throw new Error("private archive leaked publicly "+publicArchiveBefore.status);

  const protectedArchiveBefore=await fetch(base+"/api/admin/disaster-media?key="+encodeURIComponent(deletedTrash.archiveKey),{
    headers:auth,cache:"no-store"
  });
  if(protectedArchiveBefore.status!==200)throw new Error("protected archive unavailable");

  await backupCatalog({base,token,out});
  const manifest=JSON.parse(await fs.readFile(path.join(out,"manifest.json"),"utf8"));
  if(manifest.schema!=="blackgold-beauty-finds-disaster-backup-v2")throw new Error("backup schema mismatch");
  if(manifest.counts.products!==2||manifest.counts.archives<1||manifest.counts.revisions<1||manifest.counts.media<2){
    throw new Error("backup v2 counts mismatch "+JSON.stringify(manifest.counts));
  }

  await clearDb();
  for(const m of manifest.media||[])await deleteMedia(m.key);

  const cleared=await call("/api/admin/snapshot");
  if(Object.values(cleared.counts).some(v=>Number(v)!==0))throw new Error("database clear failed "+JSON.stringify(cleared.counts));

  for(const m of manifest.media||[]){
    const r=await fetch(base+"/api/admin/disaster-media?key="+encodeURIComponent(m.key),{headers:auth,cache:"no-store"});
    if(r.status!==404)throw new Error("media clear failed "+m.key+" "+r.status);
  }

  let blocked=false;
  try{await restoreCatalog({base,token,dir:out,confirm:"NO",replace:true})}catch{blocked=true}
  if(!blocked)throw new Error("restore confirmation gate failed");

  await restoreCatalog({base,token,dir:out,confirm:"RESTORE",replace:true});

  const restored=await call("/api/admin/snapshot");
  for(const k of ["products","revisions","archives","audit"]){
    if(Number(restored.counts[k])!==Number(manifest.dbSnapshot.counts[k]))throw new Error("exact restored DB count mismatch "+k);
  }

  const after=await call("/api/admin/products");
  const published=after.products.filter(p=>p.status==="published");
  const drafts=after.products.filter(p=>p.status==="draft");
  if(after.products.length!==2||published.length!==1||drafts.length!==1)throw new Error("restored active state mismatch");

  const activeMediaAfter=await fetch(base+"/media/"+encodeURIComponent(activeMedia.key),{cache:"no-store"});
  if(activeMediaAfter.status!==200)throw new Error("active product media was not restored");

  const trashAfter=await call("/api/admin/trash?limit=20");
  const deletedAfter=trashAfter.items?.find(x=>x.productId===deleted.product.id);
  if(!deletedAfter?.imageArchived||deletedAfter.archiveKey!==deletedTrash.archiveKey)throw new Error("trash metadata was not restored exactly");

  const archivePublicAfter=await fetch(base+"/media/"+deletedAfter.archiveKey,{cache:"no-store"});
  if(archivePublicAfter.status!==404)throw new Error("restored private archive leaked publicly");

  const restoreDeleted=await call("/api/admin/revisions",{
    method:"POST",
    body:JSON.stringify({revisionId:deletedAfter.revisionId})
  });
  if(restoreDeleted.product?.id!==deleted.product.id||restoreDeleted.product?.imageKey!==deletedMedia.key){
    throw new Error("restored trash product mismatch "+JSON.stringify(restoreDeleted));
  }
  const recoveredDeletedMedia=await fetch(base+"/media/"+encodeURIComponent(deletedMedia.key),{cache:"no-store"});
  if(recoveredDeletedMedia.status!==200)throw new Error("restored trash media unavailable");

  const publicData=await (await fetch(base+"/api/products?roundtrip=1",{cache:"no-store"})).json();
  if(publicData.total!==2)throw new Error("public restored state mismatch "+JSON.stringify(publicData));

  console.log(JSON.stringify({
    backupSchema:manifest.schema,
    activeProducts:2,
    revisions:manifest.counts.revisions,
    archives:manifest.counts.archives,
    media:manifest.counts.media,
    privateArchivePublicStatus:404,
    restoredTrashProduct:"PASS",
    restoredTrashMedia:200
  },null,2));
  console.log("BLACKGOLD_DISASTER_BACKUP_RESTORE_ROUNDTRIP=PASS");
}finally{
  await cleanupProducts().catch(()=>{});
}
