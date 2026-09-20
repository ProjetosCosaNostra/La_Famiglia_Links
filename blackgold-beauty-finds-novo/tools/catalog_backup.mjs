import fs from "node:fs/promises";
import path from "node:path";

export async function backupCatalog({
  base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788",
  token=process.env.BLACKGOLD_ADMIN_TOKEN||"",
  out=process.env.BLACKGOLD_BACKUP_DIR||path.resolve("backups","catalog-"+new Date().toISOString().replace(/[:.]/g,"-"))
}={}){
  if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
  const auth={authorization:"Bearer "+token};
  async function getJson(url){
    const r=await fetch(base+url,{headers:auth,cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(url+" "+r.status+" "+JSON.stringify(d));
    return d;
  }

  const products=(await getJson("/api/admin/products")).products||[];
  const audit=(await getJson("/api/admin/audit?limit=200")).events||[];

  await fs.mkdir(path.join(out,"media"),{recursive:true});
  const media=[];
  for(const p of products){
    if(!p.imageKey)continue;
    const url=base+"/media/"+encodeURIComponent(p.imageKey);
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error("media backup failed "+p.imageKey+" "+r.status);
    const bytes=Buffer.from(await r.arrayBuffer());
    const target=path.join(out,"media",p.imageKey);
    await fs.writeFile(target,bytes);
    media.push({
      key:p.imageKey,
      file:"media/"+p.imageKey,
      bytes:bytes.length,
      contentType:r.headers.get("content-type")||"application/octet-stream"
    });
  }

  const snapshot={
    schema:"blackgold-beauty-finds-catalog-backup-v1",
    createdAt:new Date().toISOString(),
    source:base,
    productCount:products.length,
    mediaCount:media.length,
    products,
    media,
    audit
  };
  await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(snapshot,null,2),"utf8");
  console.log(JSON.stringify({ok:true,out,productCount:products.length,mediaCount:media.length},null,2));
  console.log("BLACKGOLD_CATALOG_BACKUP=PASS");
  return {out,snapshot};
}

if(import.meta.url===new URL("file://"+path.resolve(process.argv[1]).replace(/\\/g,"/")).href){
  backupCatalog().catch(e=>{console.error(e?.stack||e);process.exit(2)});
}
