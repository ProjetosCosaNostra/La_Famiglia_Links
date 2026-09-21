import fs from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root=path.resolve(new URL("..",import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,m=>m.slice(1)));
const expectBlocked=process.argv.includes("--expect-blocked");
const blockers=[];
const defects=[];

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
const deployScript=await readText("tools/deploy-production.ps1");
const buildScript=await readText("tools/build-production.mjs");
const robots=await readText("robots.txt");
const indexHtml=await readText("index.html");

let head="";
try{
  head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
}catch{
  defects.push("Git HEAD unavailable.");
}

if(!guard){
  defects.push("preview-guard.json missing.");
}else{
  if(guard.productionDeployAllowed!==true)blockers.push("preview-guard blocks production deployment.");
  if(guard.productionRequiresExplicitHumanApproval!==true)defects.push("human approval contract missing.");
  if(guard.previewRequiresApprovedShellGatePass!==true)defects.push("approved shell gate contract missing.");
  if(guard.outsideDynamicRegionTolerancePixels!==0)defects.push("outside-dynamic-region tolerance must remain zero.");
  if(guard.previewRequiresProductFootprintGatePass!==true)defects.push("preview is not locked to product footprint validation.");
  if(guard.previewRequiresProductStyleGatePass!==true)defects.push("preview is not locked to product style validation.");
  if(guard.previewRequiresProductRegionAcceptancePass!==true)defects.push("preview is not locked to product-region acceptance.");
  if(guard.productRegionPixelDiagnosticCanApprove!==false)defects.push("pixel diagnostic must never approve release by itself.");
}

if(!manifest){
  defects.push("authority manifest missing.");
}else{
  if(manifest.catalogInitialCount!==0)defects.push("catalog must remain zero before release approval.");
  if(manifest.previewAutoOpenAllowed!==false)defects.push("preview auto-open must remain disabled before approval.");
}

if(!approval){
  blockers.push("release-approval.json missing.");
}else{
  if(approval.humanApproved!==true)blockers.push("explicit human approval missing.");
  if(!approval.approvedCommit||approval.approvedCommit!==head)blockers.push("approval is not pinned to current commit.");
  if(!approval.approvedAt)blockers.push("approval timestamp missing.");
  if(
    manifest&&(
      approval?.approvedMockups?.desktopApprovedSha256!==manifest?.desktop?.approvedSha256 ||
      approval?.approvedMockups?.mobileApprovedSha256!==manifest?.mobile?.approvedSha256
    )
  ){
    blockers.push("approval mockup hashes do not match the pinned authorities.");
  }
}

if(!wrangler){
  defects.push("wrangler.toml missing.");
}else{
  if(wrangler.includes("\\n")||wrangler.includes("\\r"))defects.push("wrangler.toml contains escaped newline characters instead of real line breaks.");
  const baseMatch=wrangler.match(/PUBLIC_BASE_URL\s*=\s*"([^"]+)"/);
  if(!baseMatch||!/^https:\/\//.test(baseMatch[1]))defects.push("PUBLIC_BASE_URL HTTPS production origin is missing.");
  if(!/pages_build_output_dir\s*=\s*"\.\/dist"/.test(wrangler))defects.push("Pages production output must remain ./dist.");
  if(/11111111-1111-4111-8111-111111111111/.test(wrangler))blockers.push("D1 production database id is still a placeholder.");
  if(/local-only placeholder/i.test(wrangler))blockers.push("wrangler.toml is still marked local-only.");
  if(baseMatch){
    const expectedRoot=baseMatch[1].replace(/\/$/,"")+"/";
    const expectedSitemap=expectedRoot+"sitemap.xml";
    if(!robots.includes("Sitemap: "+expectedSitemap))defects.push("robots.txt sitemap origin does not match PUBLIC_BASE_URL.");
    if(!indexHtml.includes('<link rel="canonical" href="'+expectedRoot+'">'))defects.push("home canonical does not match PUBLIC_BASE_URL.");
    if(!indexHtml.includes('<meta property="og:url" content="'+expectedRoot+'">'))defects.push("home og:url does not match PUBLIC_BASE_URL.");
  }
}
if(!robots){
  defects.push("robots.txt missing.");
}else if(robots.includes("\\n")||robots.includes("\\r")){
  defects.push("robots.txt contains escaped newline characters instead of real line breaks.");
}
if(!/class="authority-picture"[\s\S]*fetchpriority="high"/.test(indexHtml)){
  defects.push("approved authority/LCP image is not fetchpriority=high.");
}

if(!buildScript){
  defects.push("production bundle builder missing.");
}else{
  for(const marker of ["preview-guard.json","release-approval","wrangler.toml","authority-zero","tools\\/","database\\/","functions\\/"]){
    if(!buildScript.includes(marker))defects.push("production bundle builder is missing isolation rule: "+marker);
  }
}

if(!deployScript){
  defects.push("production deploy script missing.");
}else{
  if(!/\[switch\]\$Execute/.test(deployScript))defects.push("production deploy script lacks explicit -Execute gate.");
  if(!/release_preflight\.mjs/.test(deployScript))defects.push("production deploy script does not run release preflight.");
  if(!/catalog_backup\.mjs/.test(deployScript))defects.push("production deploy script lacks mandatory pre-deploy backup.");
  if(!/build-production\.mjs/.test(deployScript))defects.push("production deploy does not build isolated static bundle.");
  if(!/wrangler pages deploy dist/.test(deployScript))defects.push("production deploy must publish dist instead of repository root.");
  if(!/--commit-hash/.test(deployScript))defects.push("production deploy is not pinned to the approved commit.");
  if(!/BLACKGOLD_PRODUCTION_DEPLOY_RECEIPT_V1/.test(deployScript))defects.push("production deploy receipt contract missing.");
  if(!/AdminToken must contain between 32 and 512/.test(deployScript))defects.push("production deploy does not reject weak admin tokens before backup/deploy.");
  if(!/PUBLIC_BASE_URL/.test(deployScript)||!/BaseUrl does not match PUBLIC_BASE_URL/.test(deployScript))defects.push("production deploy does not enforce configured canonical origin.");
  if(/DEPLOY INTENTIONALLY STOPPED/i.test(deployScript))defects.push("obsolete unconditional production stop remains.");
}

const result={
  ok:blockers.length===0&&defects.length===0,
  mode:expectBlocked?"expect-blocked":"release",
  head,
  blockers,
  defects
};

console.log(JSON.stringify(result,null,2));

if(expectBlocked){
  if(defects.length){
    console.error("BLACKGOLD_RELEASE_GATE=STRUCTURAL_DEFECT");
    process.exit(4);
  }
  if(blockers.length===0){
    console.error("BLACKGOLD_RELEASE_GATE_EXPECTED_BLOCK_BUT_PASSED");
    process.exit(3);
  }
  console.log("BLACKGOLD_RELEASE_GATE=BLOCKED_AS_REQUIRED");
  process.exit(0);
}

if(defects.length||blockers.length){
  console.error("BLACKGOLD_RELEASE_GATE=BLOCKED");
  process.exit(2);
}
console.log("BLACKGOLD_RELEASE_GATE=PASS");
