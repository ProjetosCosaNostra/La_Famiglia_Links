(()=>{"use strict";
const DEFAULT_POLICY={schema:"blackgold.retailer-policy/v1",market:"US",max_verification_age_days:14,allowed_retailer_hosts:["sephora.com","ulta.com"],allowed_affiliate_hosts:["sephora.com","ulta.com"],allowed_http_status_min:200,allowed_http_status_max:399};
function parseUrl(value){try{const u=new URL(String(value||""));return u.protocol==="https:"?u:null}catch(e){return null}}
function hostAllowed(host,list){host=String(host||"").toLowerCase();return (list||[]).some(raw=>{const allowed=String(raw||"").toLowerCase().replace(/^\./,"");return host===allowed||host.endsWith("."+allowed)})}
function ageDays(value){const t=Date.parse(String(value||""));if(!Number.isFinite(t))return Infinity;return (Date.now()-t)/86400000}
function validate(record,productIds,policyInput){
 const policy={...DEFAULT_POLICY,...(policyInput||{})},checks=[];
 const add=(code,pass,detail)=>checks.push({code,pass:Boolean(pass),detail});
 const affiliate=parseUrl(record?.affiliate_url),original=parseUrl(record?.original_url),finalUrl=parseUrl(record?.final_destination);
 add("record_exists",!!record,"A registry record exists for this product.");
 add("product_exists",!!record&&productIds.has(record.product_id),"The product id exists in the research dataset.");
 add("public_state",record?.public_state==="verified","public_state must be verified.");
 add("country",record?.country===policy.market,`country must be ${policy.market}.`);
 add("retailer_named",!!record?.retailer&&record.retailer!=="Retailer pending","A named retailer is required.");
 add("original_https",!!original,"Original product URL must be HTTPS.");
 add("affiliate_https",!!affiliate,"Affiliate URL must be HTTPS.");
 add("final_https",!!finalUrl,"Final destination must be HTTPS.");
 add("original_host",!!original&&hostAllowed(original.hostname,policy.allowed_retailer_hosts),"Original host must be approved.");
 add("affiliate_host",!!affiliate&&hostAllowed(affiliate.hostname,[...(policy.allowed_affiliate_hosts||[]),...(policy.allowed_retailer_hosts||[])]),"Affiliate host must be explicitly approved.");
 add("final_host",!!finalUrl&&hostAllowed(finalUrl.hostname,policy.allowed_retailer_hosts),"Final destination host must be approved.");
 const status=Number(record?.http_status);
 add("http_status",Number.isInteger(status)&&status>=Number(policy.allowed_http_status_min||200)&&status<=Number(policy.allowed_http_status_max||399),"Verification HTTP status must be inside the approved range.");
 const age=ageDays(record?.last_verified_at);
 add("verification_date",Number.isFinite(age)&&age>=-1&&age<=Number(policy.max_verification_age_days||14),`Verification must be no older than ${policy.max_verification_age_days||14} days.`);
 if(original&&finalUrl)add("retailer_host_consistency",hostAllowed(original.hostname,[finalUrl.hostname])||hostAllowed(finalUrl.hostname,[original.hostname]),"Original and final retailer hosts must resolve within the same retailer domain.");
 return {allowed:checks.every(c=>c.pass),checks,policy,record};
}
async function fetchJson(path){
 const r=await fetch(path,{cache:"no-store",credentials:"same-origin"});
 if(!r.ok)throw new Error(`${path} unavailable`);
 return r.json();
}
async function load(productId){
 const [products,registry,policyRaw]=await Promise.all([
   fetchJson("data/products.json"),
   fetchJson("data/retailer-links.json"),
   fetchJson("data/retailer-policy.json").catch(()=>DEFAULT_POLICY)
 ]);
 const productIds=new Set((products.products||[]).map(p=>p.id));
 const record=(registry.links||[]).find(x=>x.product_id===productId);
 return validate(record,productIds,policyRaw);
}
window.BlackGoldRetailerGuard={validate,load,DEFAULT_POLICY,parseUrl,hostAllowed,ageDays};
})();