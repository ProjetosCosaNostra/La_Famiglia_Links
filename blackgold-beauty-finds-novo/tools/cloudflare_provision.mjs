import fs from "node:fs/promises";
import path from "node:path";

const root=path.resolve(new URL("..",import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,m=>m.slice(1)));
const execute=process.argv.includes("--execute");
const planOnly=!execute;
const confirm=String(process.env.BLACKGOLD_PROVISION_CONFIRM||"");
const expectedConfirm="PROVISION_BLACKGOLD_BEAUTY_INFRA";
const token=String(process.env.CLOUDFLARE_API_TOKEN||"");
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||"");
const project="blackgold-beauty-finds-br";
const d1Name="blackgold-beauty-finds-novo";
const r2Names=["blackgold-beauty-finds-novo-media","blackgold-beauty-finds-novo-media-preview"];
const outDir=path.join(root,".provision");
await fs.mkdir(outDir,{recursive:true});

const receipt={
  contract:"BLACKGOLD_CLOUDFLARE_PROVISION_V1",
  mode:execute?"execute":"plan",
  checkedAt:new Date().toISOString(),
  targetPagesProject:project,
  d1Name,
  r2Buckets:r2Names,
  writesAttempted:false,
  writesCompleted:[],
  blockers:[],
  resources:{pages:null,d1:null,r2:[]}
};

const writeReceipt=async()=>fs.writeFile(path.join(outDir,"cloudflare-provision.json"),JSON.stringify(receipt,null,2));
const fail=async(message,code=2)=>{
  receipt.blockers.push(message);
  await writeReceipt();
  console.error(message);
  process.exit(code);
};

if(!token||!account)await fail("Cloudflare credentials are unavailable.",3);
if(execute&&confirm!==expectedConfirm)await fail("Explicit provisioning confirmation is missing.",4);

const api="https://api.cloudflare.com/client/v4/accounts/"+account;
const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};

async function cf(method,url,body){
  const r=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined});
  let data=null;
  try{data=await r.json()}catch{}
  return{status:r.status,ok:r.ok,data};
}

const pages=await cf("GET",api+"/pages/projects/"+encodeURIComponent(project));
receipt.resources.pages={status:pages.status,exists:Boolean(pages.ok&&pages.data?.success&&pages.data?.result?.name===project)};
if(!receipt.resources.pages.exists)await fail("Target Pages project "+project+" is not available.",5);

const d1List=await cf("GET",api+"/d1/database?per_page=100");
if(!d1List.ok||!d1List.data?.success)await fail("D1 list failed. Token requires D1 Read; execute also requires D1 Write.",6);
let db=(Array.isArray(d1List.data.result)?d1List.data.result:[]).find(x=>x?.name===d1Name)||null;
receipt.resources.d1={status:d1List.status,exists:Boolean(db),databaseId:db?.uuid||null};

const r2List=await cf("GET",api+"/r2/buckets?per_page=100");
if(!r2List.ok||!r2List.data?.success){
  await fail("R2 list failed. Token requires Workers R2 Storage Read; execute requires Workers R2 Storage Write.",7);
}
const existingBuckets=Array.isArray(r2List.data?.result?.buckets)?r2List.data.result.buckets:[];
receipt.resources.r2=r2Names.map(name=>({name,exists:existingBuckets.some(x=>x?.name===name)}));

if(planOnly){
  if(!db)receipt.blockers.push("D1 database will need creation.");
  for(const b of receipt.resources.r2)if(!b.exists)receipt.blockers.push("R2 bucket will need creation: "+b.name);
  await writeReceipt();
  console.log(JSON.stringify(receipt,null,2));
  console.log("BLACKGOLD_CLOUDFLARE_PROVISION=PLAN_ONLY");
  process.exit(0);
}

receipt.writesAttempted=true;

for(const bucket of receipt.resources.r2){
  if(bucket.exists)continue;
  const created=await cf("POST",api+"/r2/buckets",{name:bucket.name});
  if(!created.ok||!created.data?.success)await fail("Failed to create R2 bucket "+bucket.name+".",8);
  bucket.exists=true;
  receipt.writesCompleted.push("r2:"+bucket.name);
}

if(!db){
  const created=await cf("POST",api+"/d1/database",{name:d1Name});
  if(!created.ok||!created.data?.success||!created.data?.result?.uuid)await fail("Failed to create D1 database "+d1Name+".",9);
  db=created.data.result;
  receipt.resources.d1={status:created.status,exists:true,databaseId:db.uuid};
  receipt.writesCompleted.push("d1:"+d1Name);
}

const wranglerPath=path.join(root,"wrangler.toml");
let wrangler=await fs.readFile(wranglerPath,"utf8");
const placeholder="11111111-1111-4111-8111-111111111111";
if(wrangler.includes(placeholder)){
  wrangler=wrangler.replace(placeholder,db.uuid);
  wrangler=wrangler.replace(" # local-only placeholder; replace after explicit human approval","");
  await fs.writeFile(wranglerPath,wrangler);
  receipt.writesCompleted.push("config:wrangler-d1-id");
}else if(!wrangler.includes(db.uuid)){
  await fail("wrangler.toml already contains a different non-placeholder D1 id.",10);
}

await writeReceipt();
console.log(JSON.stringify(receipt,null,2));
console.log("BLACKGOLD_CLOUDFLARE_PROVISION=PASS");
