import fs from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root=path.resolve(new URL("..",import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,m=>m.slice(1)));
const expectBlocked=process.argv.includes("--expect-blocked");
const errors=[];

async function readJson(file){
  try{return JSON.parse(await fs.readFile(path.join(root,file),"utf8"))}
  catch{return null}
}
async function readText(file){
  try{return await fs.readFile(path.join(root,file),"utf8")}
  catch{return ""}
}

const guard=await readJson("preview-guard.json");
const manifest=await readJson("assets/authority-zero-manifest.json");
const approval=await readJson("release-approval.json");
const wrangler=await readText("wrangler.toml");

let head="";
try{
  head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
}catch{
  errors.push("Git HEAD unavailable.");
}

if(!guard)errors.push("preview-guard.json missing.");
if(guard?.productionDeployAllowed!==true)errors.push("preview-guard blocks production deployment.");
if(guard?.productionRequiresExplicitHumanApproval!==true)errors.push("human approval contract missing.");
if(guard?.previewRequiresExactVisualGatePass!==true)errors.push("exact visual gate contract missing.");

if(!manifest)errors.push("authority manifest missing.");
if(manifest?.catalogInitialCount!==0)errors.push("catalog must remain zero before release approval.");
if(manifest?.previewAutoOpenAllowed!==false)errors.push("preview auto-open must remain disabled before approval.");

if(!approval)errors.push("release-approval.json missing.");
if(approval?.humanApproved!==true)errors.push("explicit human approval missing.");
if(!approval?.approvedCommit||approval.approvedCommit!==head)errors.push("approval is not pinned to current commit.");
if(!approval?.approvedAt)errors.push("approval timestamp missing.");
if(
  approval?.approvedMockups?.desktopApprovedSha256!==manifest?.desktop?.approvedSha256 ||
  approval?.approvedMockups?.mobileApprovedSha256!==manifest?.mobile?.approvedSha256
){
  errors.push("approval mockup hashes do not match the pinned authorities.");
}

if(/11111111-1111-4111-8111-111111111111/.test(wrangler))errors.push("D1 production database id is still a placeholder.");
if(/local-only placeholder/i.test(wrangler))errors.push("wrangler.toml is still marked local-only.");

const result={
  ok:errors.length===0,
  mode:expectBlocked?"expect-blocked":"release",
  head,
  errors
};

console.log(JSON.stringify(result,null,2));

if(expectBlocked){
  if(errors.length===0){
    console.error("BLACKGOLD_RELEASE_GATE_EXPECTED_BLOCK_BUT_PASSED");
    process.exit(3);
  }
  console.log("BLACKGOLD_RELEASE_GATE=BLOCKED_AS_REQUIRED");
  process.exit(0);
}

if(errors.length){
  console.error("BLACKGOLD_RELEASE_GATE=BLOCKED");
  process.exit(2);
}
console.log("BLACKGOLD_RELEASE_GATE=PASS");
