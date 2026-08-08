(()=>{
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function j(p,f){try{const r=await fetch(p,{cache:"no-store"});if(!r.ok)throw 0;return await r.json()}catch{return f}}
function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function programFor(product,programs){
 const r=norm(product.retailer_observed||product.retailer||"");
 return programs.find(p=>r.includes(norm(p.retailer))||norm(p.retailer).includes(r))||null;
}
function state(ok,label){return `<span class="${ok?"pass":"block"}">${esc(label)}</span>`}
async function init(){
 const [pd,pg,rg]=await Promise.all([
  j("data/products.json",{products:[]}),
  j("data/affiliate-programs.us.json",{programs:[]}),
  j("data/retailer-links.json",{links:[]})
 ]);
 const products=Array.isArray(pd.products)?pd.products:[];
 const programs=Array.isArray(pg.programs)?pg.programs:[];
 const links=Array.isArray(rg.links)?rg.links:[];
 $("productCount").textContent=products.length;
 $("programCount").textContent=programs.filter(x=>x.program_status==="program_verified").length;
 $("approvedCount").textContent=programs.filter(x=>x.application_status==="approved").length;
 $("routeCount").textContent=links.filter(x=>x.public_state==="verified").length;
 $("rows").innerHTML=products.map(p=>{
  const pr=programFor(p,programs);
  const route=links.find(x=>String(x.product_id)===String(p.id));
  const programOk=pr?.program_status==="program_verified";
  const accountOk=pr?.application_status==="approved";
  const routeOk=route?.public_state==="verified";
  const next=!pr?"Map retailer to affiliate program":!programOk?"Verify program":!accountOk?"Record publisher-account approval":!routeOk?"Import hash-bound candidate + explicitly approve exact shopper route":"Commercial gate ready";
  return `<tr><td><strong>${esc(p.brand||"")}</strong><br>${esc(p.name||p.title||p.id)}</td><td>${esc(p.retailer_observed||p.retailer||"Unknown")}</td><td>${pr?state(programOk,programOk?"verified":"blocked"):"<span class='block'>unmapped</span>"}</td><td>${pr?state(accountOk,pr.application_status||"unknown"):"—"}</td><td>${state(routeOk,routeOk?"verified":"locked")}</td><td>${esc(next)}</td></tr>`
 }).join("")||'<tr><td colspan="6">No products loaded.</td></tr>';
}
init();
})();
