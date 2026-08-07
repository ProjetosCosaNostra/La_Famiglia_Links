(()=>{"use strict";
const params=new URLSearchParams(location.search);
const product=String(params.get("product")||"").slice(0,120);
const campaign=String(params.get("campaign")||"").slice(0,120);
const status=document.getElementById("gateStatus");
const link=document.getElementById("gateLink");
const checksRoot=document.getElementById("gateChecks");
function event(type,data={}){
 try{
  const key="blackgold.events.v1";
  let events=[];
  try{const parsed=JSON.parse(localStorage.getItem(key)||"[]");if(Array.isArray(parsed))events=parsed}catch(_){}
  const allowedTypes=new Set(["retailer_gate_open","retailer_gate_blocked","retailer_click"]);
  if(!allowedTypes.has(type))return;
  events.push({type,at:new Date().toISOString(),product_id:product,campaign_id:campaign,...data});
  localStorage.setItem(key,JSON.stringify(events.slice(-250)));
 }catch(_){}
}
function renderChecks(result){
 if(!checksRoot)return;
 checksRoot.innerHTML="";
 result.checks.forEach(c=>{
  const li=document.createElement("li");
  li.className=c.pass?"pass":"block";
  const strong=document.createElement("strong");
  strong.textContent=c.pass?"PASS":"BLOCK";
  const span=document.createElement("span");
  span.textContent=c.detail;
  li.append(strong,span);
  checksRoot.appendChild(li);
 });
}
function lock(message,result){
 status.textContent=message;
 link.removeAttribute("href");
 link.classList.add("locked");
 link.setAttribute("aria-disabled","true");
 link.textContent="Retailer link locked";
 if(result)renderChecks(result);
 event("retailer_gate_blocked",{failed_checks:result?result.checks.filter(c=>!c.pass).map(c=>c.code):["registry_unavailable"]});
}
async function run(){
 event("retailer_gate_open");
 if(!product){lock("No product route was supplied. The retailer link remains locked.");return}
 if(!window.BlackGoldRetailerGuard){lock("Retailer Guard did not initialize. The link remains locked.");return}
 try{
  const result=await window.BlackGoldRetailerGuard.load(product);
  if(!result.allowed){
   const reason=result.record?.reason||"This retailer destination did not pass every commercial verification gate.";
   lock(reason,result);
   return;
  }
  renderChecks(result);
  const record=result.record;
  status.textContent=`Verified retailer route: ${record.retailer}. Last verified ${record.last_verified_at}.`;
  link.href=record.affiliate_url;
  link.target="_blank";
  link.rel="noopener noreferrer sponsored nofollow";
  link.referrerPolicy="strict-origin-when-cross-origin";
  link.classList.remove("locked");
  link.removeAttribute("aria-disabled");
  link.textContent=`Continue to ${record.retailer}`;
  link.addEventListener("click",()=>event("retailer_click",{retailer:record.retailer,verification_date:record.last_verified_at}));
 }catch(e){
  lock("Retailer registry could not be fully verified. The link remains locked.");
 }
}
run();
})();