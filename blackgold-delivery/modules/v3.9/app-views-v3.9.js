function initDecision(){
  const out=qs('#decisionResult');if(!out)return;
  const copy={simple:'Start with routine fit: cleanser, moisturizer and the problem you actually want to solve before adding more steps.',compare:'Use the comparison desk: save up to three products and compare best-fit context, limitations and research status side by side.',gift:'Use the gift path: category, scent or finish preference, return flexibility and whether sampling is practical.'};
  qsa('[data-route]').forEach(b=>b.addEventListener('click',()=>{qsa('[data-route]').forEach(x=>x.classList.remove('active'));b.classList.add('active');out.textContent=copy[b.dataset.route]||'Choose a path above.'}));
}
function productCard(p){
  const saved=BG.compare.has(p.id);
  return `<article class="product-card"><a class="product-media" href="product.html?slug=${encodeURIComponent(p.slug)}"><span class="product-status">${esc(p.truth_status)}</span><img ${imgAttrs(p)}></a><p class="eyebrow">${esc(p.category)} · PRODUCT RESEARCH</p><h2><a href="product.html?slug=${encodeURIComponent(p.slug)}">${esc(p.name)}</a></h2><p>${esc(p.summary)}</p><div class="product-meta"><div><b>Best for</b><span>${esc(p.best_for)}</span></div><div><b>Limitations</b><span>${esc(p.limitations)}</span></div></div><div class="card-actions"><a class="button text" href="product.html?slug=${encodeURIComponent(p.slug)}">Open research →</a><button type="button" class="compare-button ${saved?'active':''}" aria-pressed="${saved}" data-compare-id="${esc(p.id)}">${saved?'Saved to compare':'Save to compare'}</button></div></article>`;
}
async function initCatalog(){
  const grid=qs('#catalogGrid');if(!grid)return;
  try{
    const d=await data();let active=new URLSearchParams(location.search).get('category')||'All';
    const search=qs('#catalogSearch'),sort=qs('#catalogSort'),count=qs('#catalogCount');
    function draw(){
      const q=(search?.value||'').trim().toLowerCase();
      let list=d.products.filter(p=>(active==='All'||p.category===active)&&[p.brand,p.name,p.category,p.summary,p.eyebrow,...(p.tags||[]),...(p.subcategories||[])].join(' ').toLowerCase().includes(q));
      if(sort?.value==='az')list.sort((a,b)=>a.name.localeCompare(b.name));
      else if(sort?.value==='za')list.sort((a,b)=>b.name.localeCompare(a.name));
      else if(sort?.value==='source')list.sort((a,b)=>String(b.source?.last_verified_at||'').localeCompare(String(a.source?.last_verified_at||'')));
      else list.sort((a,b)=>Number(b.featured)-Number(a.featured));
      grid.innerHTML=list.map(productCard).join('')||'<p class="loading">No verified product records match this filter.</p>';
      if(count)count.textContent=`${list.length} product ${list.length===1?'record':'records'}`;
      qsa('[data-compare-id]',grid).forEach(b=>b.addEventListener('click',()=>toggleCompare(b.dataset.compareId)));
    }
    qsa('[data-category]').forEach(b=>b.addEventListener('click',()=>{qsa('[data-category]').forEach(x=>x.classList.remove('active'));b.classList.add('active');active=b.dataset.category;draw()}));
    const target=qsa('[data-category]').find(b=>b.dataset.category===active);
    if(target){qsa('[data-category]').forEach(x=>x.classList.remove('active'));target.classList.add('active')}
    search?.addEventListener('input',draw);sort?.addEventListener('change',draw);draw();
  }catch(e){grid.innerHTML='<p class="loading">The research catalog could not be loaded in this staging build.</p>'}
}
async function initProduct(){
  const root=qs('#productPage');if(!root)return;
  try{
    const d=await data(),pms=new URLSearchParams(location.search),slug=pms.get('slug'),id=pms.get('id');
    const p=d.products.find(x=>x.slug===slug||x.id===id);
    if(!p){root.innerHTML='<div class="not-found"><p class="eyebrow">PRODUCT RESEARCH</p><h1>That product record was not found.</h1><a class="button primary" href="products.html">Return to Beauty Index</a></div>';return}
    document.title=`${p.name} — BlackGold Beauty Finds`;const saved=BG.compare.has(p.id);
    const sourceDate=esc(p.source?.last_verified_at||'Not recorded'),sourcePublisher=esc(p.source?.publisher||'Not recorded');
    root.innerHTML=`<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="products.html?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a><span>/</span><span>${esc(p.name)}</span></nav><section class="product-hero"><div><p class="eyebrow">${esc(p.category)} · PRODUCT RESEARCH</p><h1>${esc(p.name)}</h1><p class="lead">${esc(p.summary)}</p><div class="product-hero-actions"><button class="button primary" type="button" aria-pressed="${saved}" data-compare-id="${esc(p.id)}">${saved?'Saved to compare':'Save to compare'}</button><a class="button text" href="compare.html">Open comparison desk →</a></div></div><div class="product-hero-art"><img ${imgAttrs(p)}><span>${esc(p.truth_status)}</span></div></section><section class="research-sections"><article><p class="eyebrow">01 · BEST FIT</p><h2>Who this research path is for.</h2><p>${esc(p.best_for)}</p></article><article><p class="eyebrow">02 · WHY IT EXISTS</p><h2>Why this product belongs in the index.</h2><p>${esc(p.why_selected)}</p></article><article class="limitations"><p class="eyebrow">03 · LIMITATIONS</p><h2>What this page does not prove.</h2><p>${esc(p.limitations)}</p></article><article><p class="eyebrow">04 · RESEARCH STATUS</p><h2>The current evidence boundary.</h2><p>${esc(p.truth_status)}</p><dl class="status-ledger"><div><dt>Retailer observed</dt><dd>${esc(p.retailer_observed||p.retailer||'Not recorded')}</dd></div><div><dt>Source</dt><dd>${sourcePublisher}</dd></div><div><dt>Last verified</dt><dd>${sourceDate}</dd></div><div><dt>Affiliate link</dt><dd>${p.affiliate_ready?'Registry may contain a verified route':'Locked until separately verified'}</dd></div><div><dt>Personal testing</dt><dd>Not claimed unless explicitly stated</dd></div></dl></article></section><section class="next-step"><div><p class="eyebrow">NEXT STEP</p><h2>Compare before you convert.</h2><p>Keep limitations, source dates and fit context visible side by side.</p></div><a class="button primary" href="compare.html">Open comparison desk</a></section>`;
    qsa('[data-compare-id]',root).forEach(b=>b.addEventListener('click',()=>toggleCompare(b.dataset.compareId)));
  }catch(e){root.innerHTML='<p class="loading">The product research page could not be loaded.</p>'}
}
function row(label,list,get){return `<div class="compare-row"><div class="compare-label">${esc(label)}</div>${list.map(p=>`<div class="compare-cell"><p>${esc(get(p)??'Not recorded')}</p></div>`).join('')}</div>`}
async function initCompare(){
  const grid=qs('#compareGrid');if(!grid)return;
  try{
    const d=await data();
    function draw(){
      const list=[...BG.compare].map(id=>d.products.find(p=>p.id===id)).filter(Boolean);
      if(!list.length){grid.innerHTML='<section class="compare-empty"><p class="eyebrow">NOTHING SAVED YET</p><h2>Build a comparison from the Beauty Index.</h2><p>Save up to three product records and they will appear here side by side.</p><a class="button primary" href="products.html">Browse the Beauty Index</a></section>';return}
      grid.innerHTML=`<div class="compare-table" style="--cols:${list.length}"><div class="compare-row compare-head"><div class="compare-label">Product</div>${list.map(p=>`<div class="compare-cell"><img ${imgAttrs(p,true)}><h2>${esc(p.name)}</h2><button type="button" class="remove-compare" data-remove="${esc(p.id)}">Remove</button></div>`).join('')}</div>${row('Brand',list,p=>p.brand)}${row('Best for',list,p=>p.best_for)}${row('Research status',list,p=>p.truth_status)}${row('Source date',list,p=>p.source?.last_verified_at)}${row('Limitations',list,p=>p.limitations)}${row('Why selected',list,p=>p.why_selected)}${row('Retailer observed',list,p=>p.retailer_observed||p.retailer)}<div class="compare-row"><div class="compare-label">Research page</div>${list.map(p=>`<div class="compare-cell"><a class="button text" href="product.html?slug=${encodeURIComponent(p.slug)}">Open research →</a></div>`).join('')}</div></div>`;
      qsa('[data-remove]',grid).forEach(b=>b.addEventListener('click',()=>{BG.compare.delete(b.dataset.remove);saveCompare();showToast('Removed from the comparison desk.');draw()}));
    }
    draw();
  }catch(e){grid.innerHTML='<p class="loading">The comparison desk could not be loaded.</p>'}
}
function initChecklist(){
  const box=qs('[data-checklist]');if(!box)return;
  const key='bg_checklist_'+String(box.dataset.checklist||'default').replace(/[^a-z0-9_-]/gi,'').slice(0,80);
  const state=new Set(readStorageArray(key)),inputs=qsa('input[type="checkbox"]',box),out=qs('#checklistProgress');
  function paint(){inputs.forEach(i=>i.checked=state.has(i.value));if(out)out.textContent=`${state.size} of ${inputs.length} checked`;writeStorage(key,[...state])}
  inputs.forEach(i=>i.addEventListener('change',()=>{i.checked?state.add(i.value):state.delete(i.value);paint()}));paint();
}
function bootV39(){initMenu();initDecision();updateCompareUI();initCatalog();initProduct();initCompare();initChecklist()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootV39,{once:true});else bootV39();
