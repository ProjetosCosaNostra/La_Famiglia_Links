import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root=path.resolve(new URL("..",import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,m=>m.slice(1)));
const dist=path.join(root,"dist");
const receiptDir=path.join(root,".release");

const publicFiles=[
  "_headers",
  "admin.html",
  "admin.js",
  "app.js",
  "index.html",
  "legal.html",
  "robots.txt",
  "styles.css"
];

const publicAssets=[
  "authority-desktop-approved.png",
  "authority-mobile-v24.webp"
];

await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(path.join(dist,"assets"),{recursive:true});
await fs.mkdir(receiptDir,{recursive:true});

for(const file of publicFiles){
  await fs.copyFile(path.join(root,file),path.join(dist,file));
}
for(const file of publicAssets){
  await fs.copyFile(path.join(root,"assets",file),path.join(dist,"assets",file));
}

async function walk(dir,prefix=""){
  const out=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const rel=prefix?prefix+"/"+entry.name:entry.name;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full,rel));
    else out.push(rel);
  }
  return out.sort();
}

const files=await walk(dist);
const expected=[
  ...publicFiles,
  ...publicAssets.map(x=>"assets/"+x)
].sort();

if(JSON.stringify(files)!==JSON.stringify(expected)){
  throw new Error("Production bundle contains unexpected or missing files: "+JSON.stringify({files,expected}));
}

const forbidden=[
  /^tools\//,
  /^database\//,
  /^functions\//,
  /^\.dev\.vars/,
  /^preview-guard\.json$/,
  /^release-approval/,
  /^wrangler\.toml$/,
  /^package\.json$/,
  /authority-zero/,
  /manifest/i
];
for(const file of files){
  if(forbidden.some(re=>re.test(file)))throw new Error("Forbidden internal file in production bundle: "+file);
}

const details=[];
for(const rel of files){
  const data=await fs.readFile(path.join(dist,rel));
  details.push({
    path:rel,
    bytes:data.length,
    sha256:crypto.createHash("sha256").update(data).digest("hex")
  });
}

const totalBytes=details.reduce((n,x)=>n+x.bytes,0);
const receipt={
  contract:"BLACKGOLD_PRODUCTION_BUNDLE_V1",
  generatedAt:new Date().toISOString(),
  output:"dist",
  fileCount:details.length,
  totalBytes,
  files:details,
  forbiddenInternalFilesPresent:false
};

await fs.writeFile(path.join(receiptDir,"production-bundle.json"),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({fileCount:receipt.fileCount,totalBytes:receipt.totalBytes,files:files},null,2));
console.log("BLACKGOLD_PRODUCTION_BUNDLE=PASS");
