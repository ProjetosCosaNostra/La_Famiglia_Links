import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const sha256=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");

export async function restoreCatalog({
  base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788",
  token=process.env.BLACKGOLD_ADMIN_TOKEN||"",
  dir=process.env.BLACKGOLD_BACKUP_DIR||"",
  confirm=process.env.BLACKGOLD_RESTORE_CONFIRM||"",
  replace=process.env.BLACKGOLD_RESTORE_REPLACE==="1"
}={}){
  if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
  if(!dir)throw new Error("BLACKGOLD_BACKUP_DIR missing");
  if(confirm!=="RESTORE")throw new Error("Restore blocked: set BLACKGOLD_RESTORE_CONFIRM=RESTORE");

  const manifest=JSON.parse(await fs.readFile(path.join(dir,"manifest.json"),"utf8"));
  if(manifest.schema!=="blackgold-beauty-finds-disaster-backup-v2")throw new Error("unsupported backup schema");

  const auth={authorization:"Bearer "+token};
  async function jsonCall(url,opt={}){
    const h=new Headers(opt.headers||{});h.set("authorization","Bearer "+token);
    if(opt.body&&!(opt.body instanceof FormData)&&!h.has("content-type"))h.set("content-type","application/json");
    const r=await fetch(base+url,{...opt,headers:h,cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(url+" "+r.status+" "+JSON.stringify(d)),{status:r.status,data:d});
    return d;
  }

  const uploaded=[];
  try{
    for(const meta of manifest.media||[]){
      const bytes=await fs.readFile(path.join(dir,...String(meta.file).split("/")));
      if(sha256(bytes)!==meta.sha256)throw new Error("media checksum mismatch "+meta.key);
      const r=await fetch(base+"/api/admin/disaster-media?key="+encodeURIComponent(meta.key),{
        method:"POST",
        headers:{
          ...auth,
          "content-type":meta.contentType||"application/octet-stream",
          "x-blackgold-restore-confirm":"RESTORE_MEDIA"
        },
        body:bytes
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error("media restore failed "+meta.key+" "+r.status+" "+JSON.stringify(d));
      uploaded.push(meta.key);
    }

    const restored=await jsonCall("/api/admin/snapshot",{
      method:"POST",
      body:JSON.stringify({
        confirm:"RESTORE_BLACKGOLD_SNAPSHOT",
        replace,
        replaceConfirm:replace?"REPLACE_ALL_BLACKGOLD_DATA":"",
        snapshot:manifest.dbSnapshot
      })
    });

    const check=await jsonCall("/api/admin/snapshot");
    const expected=manifest.dbSnapshot.counts||{};
    for(const k of ["products","revisions","archives","audit"]){
      if(Number(check.counts?.[k]||0)!==Number(expected[k]||0))throw new Error("restored count mismatch "+k);
    }
    console.log(JSON.stringify({ok:true,restored:restored.restored,media:uploaded.length,sourceCreatedAt:manifest.createdAt},null,2));
    console.log("BLACKGOLD_DISASTER_RESTORE_V2=PASS");
    return {restored,media:uploaded.length};
  }catch(error){
    for(const key of uploaded.reverse()){
      try{
        await fetch(base+"/api/admin/disaster-media?key="+encodeURIComponent(key),{
          method:"DELETE",
          headers:{...auth,"x-blackgold-restore-confirm":"DELETE_RESTORE_MEDIA"}
        });
      }catch{}
    }
    throw error;
  }
}

if(import.meta.url===new URL("file://"+path.resolve(process.argv[1]).replace(/\\/g,"/")).href){
  restoreCatalog().catch(e=>{console.error(e?.stack||e);process.exit(2)});
}
