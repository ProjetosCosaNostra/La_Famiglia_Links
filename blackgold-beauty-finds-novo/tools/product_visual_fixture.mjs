import fs from "node:fs/promises";
const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const token=process.env.BLACKGOLD_ADMIN_TOKEN||"";
const mode=process.argv[2]||"create";
const stateFile=new URL("../.visual-gate/fixture.json",import.meta.url);
if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
const auth={authorization:"Bearer "+token};
async function call(path,opt={}){const r=await fetch(base+path,{...opt,cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+" "+r.status+" "+JSON.stringify(d));return d}
async function cleanupByTitle(){const d=await call("/api/admin/products",{headers:auth});for(const p of d.products||[]){if(p.title==="__BLACKGOLD_VISUAL_FIXTURE__")await call("/api/admin/products?id="+encodeURIComponent(p.id),{method:"DELETE",headers:auth})}}
if(mode==="create"){
  await cleanupByTitle();
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7n8AAAAASUVORK5CYII=","base64");
  const form=new FormData();form.append("file",new Blob([png],{type:"image/png"}),"fixture.png");
  const media=await call("/api/admin/upload",{method:"POST",headers:auth,body:form});
  const product=await call("/api/admin/products",{method:"POST",headers:{...auth,"content-type":"application/json"},body:JSON.stringify({
    title:"__BLACKGOLD_VISUAL_FIXTURE__",brand:"BlackGold QA",category:"Beleza",description:"Visual regression fixture",
    currency:"BRL",price:"19.90",imageKey:media.key,destinationUrl:"https://example.com/fixture",status:"published",featured:true,order:1
  })});
  await fs.mkdir(new URL("../.visual-gate/",import.meta.url),{recursive:true});
  await fs.writeFile(stateFile,JSON.stringify({id:product.product.id,mediaUrl:media.url},null,2));
  const pub=await call("/api/products?fixture=1");
  if(pub.total!==1)throw new Error("fixture not public");
  console.log("BLACKGOLD_PRODUCT_VISUAL_FIXTURE=READY");
}else if(mode==="delete"){
  let saved={};try{saved=JSON.parse(await fs.readFile(stateFile,"utf8"))}catch{}
  if(saved.id)await call("/api/admin/products?id="+encodeURIComponent(saved.id),{method:"DELETE",headers:auth});
  await cleanupByTitle();
  const pub=await call("/api/products?fixture=cleanup");
  if(pub.total!==0)throw new Error("fixture cleanup did not return catalog to zero");
  if(saved.mediaUrl){const r=await fetch(base+saved.mediaUrl,{cache:"no-store"});if(r.status!==404)throw new Error("fixture media orphan "+r.status)}
  console.log("BLACKGOLD_PRODUCT_VISUAL_FIXTURE=CLEAN");
}else throw new Error("mode must be create or delete");
