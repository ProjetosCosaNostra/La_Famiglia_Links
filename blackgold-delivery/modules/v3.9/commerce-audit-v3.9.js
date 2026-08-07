(()=>{"use strict";
const q=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function get(path){const r=await fetch(path,{cache:"no-store"});if(!r.ok)throw new Error(path);return r.json()}
async function run(){
 try{
  const [products,registry,policy]=await Promise.all([get("data/products.json"),get("data/retailer-links.json"),get("data/retailer-policy.json")]);
  const ids=new Set((products.products||[]).map(p=>p.id));
  const byId=new Map((products.products||[]).map(p=>[p.id,p]));
  const results=(registry.links||[]).map(record=>({record,result:BlackGoldRetailerGuard.validate(record,ids,policy)}));
  const ok=results.filter(x=>x.result.allowed).length;
  q("auditTotal").textContent=String(results.length);
  q("auditVerified").textContent=String(ok);
  q("auditBlocked").textContent=String(results.length-ok);
  q("auditAge").textContent=`${policy.max_verification_age_days}d`;
  q("auditNote").textContent=`${ok} of ${results.length} routes currently pass every gate.`;
  q("auditRows").innerHTML=results.map(({record,result})=>{
   const p=byId.get(record.product_id);
   const failed=result.checks.filter(c=>!c.pass).map(c=>c.code);
   return `<tr><td><strong>${esc(p?.name||record.product_id)}</strong><small>${esc(record.product_id)}</small></td><td>${esc(record.retailer||"Not named")}</td><td><span class="audit-pill ${result.allowed?"pass":"block"}">${result.allowed?"VERIFIED":"BLOCKED"}</span></td><td>${esc(record.last_verified_at||"Not verified")}</td><td>${failed.length?failed.map(esc).join(", "):"All gates passed"}</td></tr>`
  }).join("");
  q("auditPolicy").innerHTML=`<dl class="policy-grid"><div><dt>Market</dt><dd>${esc(policy.market)}</dd></div><div><dt>Verification age</dt><dd>${esc(policy.max_verification_age_days)} days max</dd></div><div><dt>Retailer hosts</dt><dd>${(policy.allowed_retailer_hosts||[]).map(esc).join(", ")||"None"}</dd></div><div><dt>Affiliate hosts</dt><dd>${(policy.allowed_affiliate_hosts||[]).map(esc).join(", ")||"None"}</dd></div></dl>`;
 }catch(e){
  q("auditNote").textContent="The current commerce registries could not be fully loaded. Treat every route as blocked.";
 }
}
document.addEventListener("DOMContentLoaded",run);
})();