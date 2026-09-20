import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const sha256=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const safeRelative=key=>key.split("/").map(part=>part.replace(/[^a-zA-Z0-9._-]/g,"_")).join("/");

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

  const dbSnapshot=await getJson("/api/admin/snapshot");
  if(dbSnapshot.schema!=="blackgold-db-snapshot-v1")throw new Error("unexpected snapshot schema");

  const keys=new Set();
  for(const p of dbSnapshot.data?.products||[])if(p.image_key)keys.add(p.image_key);
  for(const a of dbSnapshot.data?.archives||[])if(a.archive_key)keys.add(a.archive_key);

  const media=[];
  for(const key of keys){
    const r=await fetch(base+"/api/admin/disaster-media?key="+encodeURIComponent(key),{
      headers:auth,
      cache:"no-store"
    });
    if(!r.ok)throw new Error("protected media backup failed "+key+" "+r.status);
    const bytes=Buffer.from(await r.arrayBuffer());
    const rel="media/"+safeRelative(key);
    const target=path.join(out,...rel.split("/"));
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,bytes);
    media.push({
      key,
      file:rel,
      bytes:bytes.length,
      sha256:sha256(bytes),
      contentType:(r.headers.get("content-type")||"application/octet-stream").split(";")[0]
    });
  }

  const snapshot={
    schema:"blackgold-beauty-finds-disaster-backup-v2",
    createdAt:new Date().toISOString(),
    source:base,
    counts:{
      products:Number(dbSnapshot.counts?.products||0),
      revisions:Number(dbSnapshot.counts?.revisions||0),
      archives:Number(dbSnapshot.counts?.archives||0),
      audit:Number(dbSnapshot.counts?.audit||0),
      media:media.length
    },
    dbSnapshot,
    media
  };
  await fs.mkdir(out,{recursive:true});
  const body=JSON.stringify(snapshot,null,2);
  await fs.writeFile(path.join(out,"manifest.json"),body,"utf8");
  await fs.writeFile(path.join(out,"manifest.sha256"),sha256(Buffer.from(body,"utf8"))+"  manifest.json\n","utf8");
  console.log(JSON.stringify({ok:true,out,counts:snapshot.counts},null,2));
  console.log("BLACKGOLD_DISASTER_BACKUP_V2=PASS");
  return {out,snapshot};
}

if(import.meta.url===new URL("file://"+path.resolve(process.argv[1]).replace(/\\/g,"/")).href){
  backupCatalog().catch(e=>{console.error(e?.stack||e);process.exit(2)});
}
