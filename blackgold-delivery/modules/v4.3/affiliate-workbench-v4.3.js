(()=>{
"use strict";
const KEY="blackgold.retailer-link-proposals.v1";
const $=id=>document.getElementById(id);
const safeParse=(s,fallback)=>{try{const v=JSON.parse(s);return v??fallback}catch{return fallback}};
const safeRead=()=>{const v=safeParse(localStorage.getItem(KEY),[]);return Array.isArray(v)?v:[]};
const safeWrite=v=>localStorage.setItem(KEY,JSON.stringify(v.slice(-100)));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const host=u=>{try{return new URL(u).hostname.toLowerCase()}catch{return""}};
const https=u=>{try{return new URL(u).protocol==="https:"}catch{return false}};
const ageOk=s=>{const d=new Date(s);if(Number.isNaN(d.getTime()))return false;const age=(Date.now()-d.getTime())/86400000;return age>=0&&age<=7};
const exactRetailerHost=(program,h)=>{
 if(program==="sephora-rakuten-us")return h==="sephora.com"||h==="www.sephora.com";
 if(program==="ulta-impact-us")return h==="ulta.com"||h==="www.ulta.com";
 return false;
};
let products=[],programs=[],registry={links:[]},last=null;
async function getJson(path,fallback){try{const r=await fetch(path,{cache:"no-store"});if(!r.ok)throw 0;return await r.json()}catch{return fallback}}
function renderPrograms(){
 $("program").innerHTML=programs.map(p=>`<option value="${esc(p.program_id)}">${esc(p.retailer)} · ${esc(p.network)}</option>`).join("");
 $("programs").innerHTML=programs.map(p=>`<article class="program"><strong>${esc(p.retailer)}</strong> · ${esc(p.network)}<br><span class="status pass">${esc(p.program_status)}</span> · account: <strong>${esc(p.application_status)}</strong> · shopper route: <strong>${esc(p.shopper_link_state)}</strong><br><a href="${esc(p.official_program_url)}" target="_blank" rel="noopener">Official program source</a></article>`).join("");
}
function renderRegistry(){
 const links=Array.isArray(registry.links)?registry.links:[];
 const verified=links.filter(x=>x&&x.public_state==="verified").length;
 $("registryStatus").innerHTML=`${links.length} route records · <strong>${verified}</strong> verified.<br><span class="muted">A verified record still has to pass retailer policy at click time.</span>`;
}
function data(){
 const p=products.find(x=>String(x.id)===$("product").value);
 const pr=programs.find(x=>x.program_id===$("program").value);
 return {product:p,program:pr,original_url:$("originalUrl").value.trim(),affiliate_url:$("affiliateUrl").value.trim(),final_destination:$("finalDestination").value.trim(),last_verified_at:$("verifiedAt").value?new Date($("verifiedAt").value).toISOString():"",exact_product:$("exactProduct").checked,account_accepted:$("accountAccepted").checked,tracking_generated:$("trackingGenerated").checked};
}
function validate(){
 const x=data(), reasons=[];
 if(!x.product)reasons.push("product_not_found");
 if(!x.program)reasons.push("program_not_found");
 if(!https(x.original_url))reasons.push("original_url_https_required");
 if(!https(x.affiliate_url))reasons.push("affiliate_url_https_required");
 if(!https(x.final_destination))reasons.push("final_destination_https_required");
 if(x.original_url&&x.affiliate_url&&x.original_url===x.affiliate_url)reasons.push("affiliate_url_must_differ");
 if(x.program&&x.final_destination&&!exactRetailerHost(x.program.program_id,host(x.final_destination)))reasons.push("final_destination_retailer_mismatch");
 if(!ageOk(x.last_verified_at))reasons.push("verification_must_be_within_7_days");
 if(!x.exact_product)reasons.push("exact_product_confirmation_required");
 if(!x.account_accepted)reasons.push("publisher_account_acceptance_required");
 if(!x.tracking_generated)reasons.push("network_generated_tracking_required");
 const ok=reasons.length===0;
 last=ok?{schema:"blackgold.retailer-link-proposal/v1",proposal_id:(crypto.randomUUID?crypto.randomUUID():"p-"+Date.now()+"-"+Math.random().toString(16).slice(2)),product_id:String(x.product.id),program_id:x.program.program_id,retailer:x.program.retailer,network:x.program.network,original_url:x.original_url,affiliate_url:x.affiliate_url,final_destination:x.final_destination,last_verified_at:x.last_verified_at,country:"US",proposed_state:"candidate",verification_method:"manual_exact_product_and_network_account",saved_at:new Date().toISOString()}:null;
 $("validation").innerHTML=ok?`<span class="status pass">PASS</span> · Proposal may be saved as a candidate. It is <strong>not shopper-active</strong>.`:`<span class="status block">BLOCK</span> · ${reasons.map(esc).join(" · ")}`;
 $("save").disabled=!ok;
 return ok;
}
function renderQueue(){
 const q=safeRead();
 $("queue").innerHTML=q.length?q.slice().reverse().map(x=>`<article class="proposal"><strong>${esc(x.retailer)}</strong> · ${esc(x.product_id)}<br><span class="muted">${esc(x.program_id)} · saved ${esc(x.saved_at)}</span><br><span class="status">candidate</span><div class="actions"><button class="buttonish" data-remove="${esc(x.proposal_id)}">Remove</button></div></article>`).join(""):`<p class="muted">No saved proposals.</p>`;
 $("queue").querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>{safeWrite(safeRead().filter(x=>x.proposal_id!==b.dataset.remove));renderQueue()}));
}
function download(){
 const q=safeRead(),payload={schema:"blackgold.retailer-link-proposals/v1",project:"BlackGold Beauty Finds",market:"US",exported_at:new Date().toISOString(),proposals:q};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");
 a.href=URL.createObjectURL(blob);a.download="blackgold-retailer-link-proposals.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function init(){
 const [pd,pg,rg]=await Promise.all([getJson("data/products.json",{products:[]}),getJson("data/affiliate-programs.us.json",{programs:[]}),getJson("data/retailer-links.json",{links:[]})]);
 products=Array.isArray(pd.products)?pd.products:[];programs=Array.isArray(pg.programs)?pg.programs:[];registry=rg||{links:[]};
 $("product").innerHTML=products.map(p=>`<option value="${esc(p.id)}">${esc(p.brand||"")} · ${esc(p.name||p.title||p.id)}</option>`).join("");
 renderPrograms();renderRegistry();renderQueue();
 $("validate").addEventListener("click",e=>{e.preventDefault();validate()});
 $("save").addEventListener("click",e=>{e.preventDefault();if(!validate()||!last)return;const q=safeRead();q.push(last);safeWrite(q);last=null;$("save").disabled=true;renderQueue()});
 $("export").addEventListener("click",download);
 $("clear").addEventListener("click",()=>{if(confirm("Clear all locally saved affiliate route proposals?")){localStorage.removeItem(KEY);renderQueue()}});
}
init();
})();