import fs from "node:fs/promises";
import path from "node:path";

export async function restoreCatalog({
  base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788",
  token=process.env.BLACKGOLD_ADMIN_TOKEN||"",
  dir=process.env.BLACKGOLD_BACKUP_DIR||"",
  confirm=process.env.BLACKGOLD_RESTORE_CONFIRM||""
}={}){
  if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
  if(!dir)throw new Error("BLACKGOLD_BACKUP_DIR missing");
  if(confirm!=="RESTORE")throw new Error("Restore blocked: set BLACKGOLD_RESTORE_CONFIRM=RESTORE");
  const auth={authorization:"Bearer "+token};

  async function call(url,opt={}){
    const h=new Headers(opt.headers||{});h.set("authorization","Bearer "+token);
    if(opt.body&&!(opt.body instanceof FormData))h.set("content-type","application/json");
    const r=await fetch(base+url,{...opt,headers:h,cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(url+" "+r.status+" "+JSON.stringify(d));
    return d;
  }

  const manifest=JSON.parse(await fs.readFile(path.join(dir,"manifest.json"),"utf8"));
  if(manifest.schema!=="blackgold-beauty-finds-catalog-backup-v1")throw new Error("unsupported backup schema");

  const existing=(await call("/api/admin/products")).products||[];
  if(existing.length)throw new Error("Restore blocked: destination catalog is not empty");

  const restored=[];
  try{
    for(const p of manifest.products||[]){
      let imageKey="";
      let imageUrl=p.imageUrl||"";
      if(p.imageKey){
        const meta=(manifest.media||[]).find(m=>m.key===p.imageKey);
        if(!meta)throw new Error("missing media manifest for "+p.imageKey);
        const bytes=await fs.readFile(path.join(dir,meta.file));
        const form=new FormData();
        const type=meta.contentType||"application/octet-stream";
        form.append("file",new Blob([bytes],{type}),path.basename(meta.file));
        const upload=await call("/api/admin/upload",{method:"POST",body:form});
        imageKey=upload.key;
        imageUrl="";
      }
      const body={
        title:p.title,
        brand:p.brand||"",
        category:p.category||"",
        description:p.description||"",
        currency:p.currency||"BRL",
        price:p.price,
        imageKey,
        imageUrl,
        destinationUrl:p.destinationUrl||"",
        status:p.status==="published"?"published":"draft",
        featured:Boolean(p.featured),
        order:Number(p.order||0)
      };
      const created=await call("/api/admin/products",{method:"POST",body:JSON.stringify(body)});
      restored.push(created.product.id);
    }
  }catch(error){
    for(const id of restored.reverse()){
      try{await call("/api/admin/products?id="+encodeURIComponent(id),{method:"DELETE"})}catch{}
    }
    throw error;
  }

  console.log(JSON.stringify({ok:true,restored:restored.length,sourceCreatedAt:manifest.createdAt},null,2));
  console.log("BLACKGOLD_CATALOG_RESTORE=PASS");
  return {restored};
}

if(import.meta.url===new URL("file://"+path.resolve(process.argv[1]).replace(/\\/g,"/")).href){
  restoreCatalog().catch(e=>{console.error(e?.stack||e);process.exit(2)});
}
