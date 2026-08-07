(()=>{"use strict";
const $=s=>document.querySelector(s);
const FRESH_DAYS=45;
const safeJson=async path=>{try{const r=await fetch(path,{cache:"no-store"});if(!r.ok)return null;return await r.json()}catch{return null}};
const ageDays=v=>{if(!v)return Infinity;const d=new Date(v+"T00:00:00Z");if(Number.isNaN(d.getTime()))return Infinity;return Math.floor((Date.now()-d.getTime())/86400000)};
async function init(){
 if(!document.querySelector("[data-methodology-page]"))return;
 const [products,retailers,guides,campaigns]=await Promise.all([
   safeJson("data/products.json"),safeJson("data/retailer-links.json"),
   safeJson("data/guides.json"),safeJson("data/campaigns.json")
 ]);
 const plist=products?.products||[];
 const rlist=retailers?.links||[];
 const glist=guides?.guides||[];
 const clist=campaigns?.campaigns||[];
 const fresh=plist.filter(p=>ageDays(p?.source?.last_verified_at)<=FRESH_DAYS).length;
 const verified=rlist.filter(x=>x?.public_state==="verified"&&/^https:\/\//.test(x?.affiliate_url||"")&&x?.last_verified_at).length;
 const locked=rlist.length?rlist.filter(x=>x?.public_state!=="verified").length:plist.length;
 const set=(id,v)=>{const n=$(id);if(n)n.textContent=String(v)};
 set("#statusProducts",plist.length);
 set("#statusFresh",fresh);
 set("#statusVerified",verified);
 set("#statusLocked",locked);
 set("#statusGuides",glist.length);
 set("#statusCampaigns",clist.length);
 const note=$("#trustStatusNote");
 const missing=[!products&&"products",!retailers&&"retailer routes",!guides&&"guides",!campaigns&&"campaigns"].filter(Boolean);
 if(note)note.textContent=missing.length?`Some staging registries are unavailable: ${missing.join(", ")}.`:`Local staging registries loaded · freshness window ${FRESH_DAYS} days.`;
}
document.addEventListener("DOMContentLoaded",init);
})();