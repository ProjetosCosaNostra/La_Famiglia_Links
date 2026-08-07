const homeEsc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function homeAge(date){const d=new Date(date+'T00:00:00Z');if(Number.isNaN(d.getTime()))return null;return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}
function homeFreshLabel(date){const age=homeAge(date);if(age===null)return 'verification date unavailable';if(age<=30)return `${age}d old · fresh`;if(age<=90)return `${age}d old · review soon`;return `${age}d old · stale`; }
async function initHomeRealEdit(){
 const grid=document.getElementById('homeFeatured'); if(!grid)return;
 try{
  const r=await fetch('data/products.json',{cache:'no-store'}); if(!r.ok)throw new Error('products unavailable');
  const data=await r.json(); const products=Array.isArray(data.products)?data.products:[];
  const count=document.getElementById('homeProductCount'); if(count)count.textContent=String(products.length);
  const fresh=products.filter(p=>{const a=homeAge(p.source?.last_verified_at);return a!==null&&a<=30;}).length;
  const freshEl=document.getElementById('homeFreshCount'); if(freshEl)freshEl.textContent=String(fresh);
  grid.innerHTML=products.slice(0,4).map(p=>`<article class="home-product"><a class="home-product-media" href="product.html?slug=${encodeURIComponent(p.slug)}"><span>${homeEsc(p.brand||p.category)}</span><img src="${homeEsc(p.image)}" alt="${homeEsc(p.name)} research illustration"></a><p class="eyebrow">${homeEsc(p.eyebrow||p.category)}</p><h3>${homeEsc(p.name)}</h3><p>${homeEsc(p.summary)}</p><div class="source-line"><b>${homeEsc(p.source?.publisher||'Source pending')}</b><span>${homeEsc(homeFreshLabel(p.source?.last_verified_at||''))}</span></div><p><a href="product.html?slug=${encodeURIComponent(p.slug)}">Open research →</a></p></article>`).join('');
  const pulse=document.getElementById('researchPulse');
  if(pulse){
    const newest=products.map(p=>p.source?.last_verified_at).filter(Boolean).sort().reverse()[0]||'unavailable';
    pulse.children[0].querySelector('span').textContent=`${products.length} products · latest source check ${newest}`;
  }
 }catch(e){
  grid.innerHTML='<p class="loading">The current research edit could not be loaded. Commercial routes remain locked.</p>';
  const freshEl=document.getElementById('homeFreshCount'); if(freshEl)freshEl.textContent='0';
 }
}
document.addEventListener('DOMContentLoaded',initHomeRealEdit);
