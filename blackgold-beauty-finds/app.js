const state={products:[],filtered:[],visible:8,category:'Todos',lang:'pt',ecosystem:null};
const I18N={
  pt:{all:'Todos',buy:'Comprar',details:'Ver detalhes',empty:'Nenhum produto encontrado.',more:'Ver mais produtos',active:'active',store:'Loja',social:'social',community:'community',company:'company',contact:'contact'},
  en:{all:'All',buy:'Buy',details:'View details',empty:'No products found.',more:'View more products',active:'active',store:'Store',social:'social',community:'community',company:'company',contact:'contact'},
  es:{all:'Todos',buy:'Comprar',details:'Ver detalles',empty:'No se encontraron productos.',more:'Ver más productos',active:'active',store:'Tienda',social:'social',community:'community',company:'company',contact:'contact'}
};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const t=k=>I18N[state.lang]?.[k]||I18N.pt[k]||k;
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function imageUrl(p){const v=p?.image||p?.image_original||'';if(!v)return '../assets/logo-cn-square.png';if(/^https?:\/\//i.test(v))return v;return '../'+v.replace(/^\.\//,'');}
function buyUrl(p){return p?.open_url||p?.short_url||p?.canonical_url||p?.check_url||'#';}
function productText(p){return p?.descricao_curta||p?.short_description||p?.description||p?.notes||'Achado selecionado pela curadoria BlackGold.';}
function priceText(p){return p?.price_text||p?.preco_atual||p?.price_current||p?.price||'';}
function tagsOf(p){return [...(p?.badges||[]),...(p?.categorias_secundarias||[]),p?.categoria_principal].filter(Boolean);}
function activeProducts(list){return (list||[]).filter(p=>p&&p.active!==false);}
function searchBlob(p){return [p.title,p.sku,p.id_busca,p.categoria_principal,...(p.categorias_secundarias||[]),...(p.badges||[]),...(p.aliases_busca||[]),productText(p)].filter(Boolean).join(' ').toLowerCase();}
function heroCandidate(){
  const words=['conjunto','vestido','blusa','calça','alfaiataria','saia','moda feminina','bolsa feminina','maquiagem','perfume'];
  return state.products.find(p=>words.some(w=>searchBlob(p).includes(w)))||state.products[0];
}
function featuredProducts(){
  const out=[];
  const preferred=state.products.filter(p=>p.featured===true||p.quick_home===true);
  for(const p of [...preferred,...state.products]){if(p&&!out.includes(p)){out.push(p);if(out.length===3)break;}}
  return out;
}
function topCategories(){
  const counts=new Map();
  state.products.forEach(p=>{const cat=p.categoria_principal||p.categorias_secundarias?.[0];if(cat)counts.set(cat,(counts.get(cat)||0)+1);});
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name])=>name);
}
function renderHero(){const p=heroCandidate();const img=$('#heroModel');if(img&&p){img.src=imageUrl(p);img.alt=p.title||'BlackGold Beauty Finds';}}
function featuredCard(p){const price=priceText(p);return `<article class="featured-card"><div class="featured-image"><img src="${esc(imageUrl(p))}" alt="${esc(p.title||'Produto')}"></div><div class="featured-info"><h3>${esc(p.title||'Produto')}</h3><div class="brandline">${esc(p.categoria_principal||'BlackGold Find')}</div><p>${esc(productText(p))}</p><div class="price">${esc(price||'BlackGold Find')}</div><button class="btn primary details-btn" data-sku="${esc(p.sku||'')}">${t('details')} <span>→</span></button></div></article>`;}
function renderFeatured(){const root=$('#featuredStrip');if(!root)return;const list=featuredProducts();root.innerHTML=list.length?list.map(featuredCard).join(''):'<div class="loading-light">Sem seleção disponível.</div>';bindDetails();}
function productCard(p){const price=priceText(p);return `<article class="product-card"><button class="card-hit details-btn" data-sku="${esc(p.sku||'')}" aria-label="${t('details')} ${esc(p.title||'Produto')}"><div class="product-media"><img loading="lazy" src="${esc(imageUrl(p))}" alt="${esc(p.title||'Produto')}"></div><div class="product-card-body"><h3>${esc(p.title||'Produto')}</h3><div class="product-meta"><span class="product-price">${esc(price||'BlackGold Find')}</span></div></div></button></article>`;}
function renderCategories(){const root=$('#categoryChips');if(!root)return;const cats=[t('all'),...topCategories()];root.innerHTML=cats.map((c,i)=>`<button class="chip ${i===0?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');$$('.chip').forEach(btn=>btn.addEventListener('click',()=>{$$('.chip').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.category=btn.dataset.cat;state.visible=8;applyFilters();}));}
function applyFilters(){const q=($('#searchInput')?.value||'').trim().toLowerCase();const all=t('all');state.filtered=state.products.filter(p=>{const catOk=state.category==='Todos'||state.category==='All'||state.category===all||tagsOf(p).includes(state.category);return catOk&&(!q||searchBlob(p).includes(q));});renderGrid();}
function renderGrid(){const root=$('#productGrid'),empty=$('#emptyState'),load=$('#loadMore');if(!root)return;root.innerHTML=state.filtered.slice(0,state.visible).map(productCard).join('');if(empty){empty.hidden=state.filtered.length>0;empty.textContent=t('empty');}if(load){load.hidden=state.filtered.length<=state.visible;load.textContent=t('more');}bindDetails();}
function bindDetails(){$$('.details-btn').forEach(btn=>btn.onclick=()=>openDialog(btn.dataset.sku));}
function openDialog(sku){const p=state.products.find(x=>x.sku===sku);if(!p)return;const dlg=$('#productDialog'),body=$('#dialogContent');if(!dlg||!body)return;body.innerHTML=`<div class="dialog-inner"><div class="dialog-media"><img src="${esc(imageUrl(p))}" alt="${esc(p.title||'Produto')}"></div><div class="dialog-copy"><div style="color:#a36b18;font-weight:900;letter-spacing:.12em;font-size:10px">BLACKGOLD BEAUTY FINDS</div><h3>${esc(p.title||'Produto')}</h3><p>${esc(productText(p))}</p>${priceText(p)?`<div class="dialog-price">${esc(priceText(p))}</div>`:''}<div class="tags">${tagsOf(p).slice(0,8).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>${p.id_busca?`<p><strong>Código Mercado Livre:</strong> ${esc(p.id_busca)}</p>`:''}<div class="dialog-actions"><a class="btn primary" href="${esc(buyUrl(p))}" target="_blank" rel="noopener">${t('buy')} no Mercado Livre →</a></div></div></div>`;dlg.showModal();}
function ecoIcon(item){const id=(item.id||item.kind||'').toLowerCase();if(id.includes('instagram'))return '◎';if(id.includes('youtube'))return '▶';if(id.includes('telegram'))return '➤';if(id.includes('github'))return '◉';if(id.includes('contact'))return '✉';if(id.includes('hub'))return '▣';return '◆';}
function localizedLabel(item){if(item.labels){const key=state.lang==='pt'?'pt-BR':state.lang==='en'?'en-US':'es-419';return item.labels[key]||Object.values(item.labels)[0];}return item.label||item.id||'BlackGold';}
function ecoCard(item){const label=localizedLabel(item).replace(/BlaakGold/gi,'BlackGold');const kind=item.kind||'link';return `<a class="eco-card" href="${esc(item.url||'#')}" target="_blank" rel="noopener"><span class="eco-icon">${esc(ecoIcon(item))}</span><span class="eco-copy"><strong>${esc(label)}</strong><small>${t('active')} · ${esc(kind)}</small></span><span class="eco-arrow">›</span></a>`;}
function renderEcosystem(){const e=state.ecosystem,root=$('#ecosystemGroups');if(!e||!root)return;const all=[...(e.hub?[e.hub]:[]),...(e.projects||[]),...(e.channels||[])];const pick=(rx)=>all.find(x=>rx.test((x.id||'')+' '+localizedLabel(x)+' '+(x.kind||'')));
  const chosen=[pick(/hub|loja/i),pick(/instagram/i),pick(/youtube/i),pick(/telegram/i),pick(/github/i),pick(/contact|contato|email/i)].filter(Boolean);
  root.innerHTML=chosen.map(ecoCard).join('');
}
function setLang(lang){state.lang=lang;$$('.lang').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));state.category='Todos';renderFeatured();renderCategories();applyFilters();renderEcosystem();}
function bindUI(){
  $('#searchInput')?.addEventListener('input',()=>{state.visible=8;applyFilters();});
  $('#loadMore')?.addEventListener('click',()=>{state.visible+=8;renderGrid();});
  $$('.lang').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
  $('.dialog-close')?.addEventListener('click',()=>$('#productDialog')?.close());
  $('#productDialog')?.addEventListener('click',e=>{if(e.target.id==='productDialog')e.target.close();});
  $('#openSearch')?.addEventListener('click',()=>{const bar=$('#searchBar');if(bar){bar.hidden=false;$('#searchInput')?.focus();}});
  $('#closeSearch')?.addEventListener('click',()=>{const bar=$('#searchBar');if(bar)bar.hidden=true;});
  $$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.scroll)?.scrollIntoView({behavior:'smooth'})));
}
async function boot(){try{
  const [productsRes,ecoRes]=await Promise.all([fetch('../produtos.json',{cache:'no-store'}),fetch('../ecosystem.json',{cache:'no-store'})]);
  if(!productsRes.ok)throw new Error('Falha ao carregar produtos');
  const productData=await productsRes.json();
  state.products=activeProducts(Array.isArray(productData)?productData:productData.products);
  state.filtered=[...state.products];
  if(ecoRes.ok)state.ecosystem=await ecoRes.json();
  if($('#productCount'))$('#productCount').textContent=state.products.length;
  renderHero();renderFeatured();renderCategories();renderGrid();renderEcosystem();bindUI();
}catch(err){console.error(err);if($('#productGrid'))$('#productGrid').innerHTML='<div class="empty">Não foi possível carregar a vitrine agora.</div>';}}
boot();