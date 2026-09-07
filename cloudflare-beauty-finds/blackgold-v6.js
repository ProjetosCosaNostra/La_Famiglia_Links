const I18N={
  'pt-BR':{
    navFeatured:'Destaque',navShowcase:'Vitrine',navEcosystem:'Ecossistema',
    heroEyebrow:'BELEZA · MODA · ACESSÓRIOS · ESTILO DE VIDA',
    heroTitle:'Curadoria feminina<br>com presença <em>premium.</em>',
    heroLede:'Moda, beleza e acessórios selecionados em uma experiência mais limpa, elegante e direta.',
    explore:'Explorar achados',openEco:'Abrir ecossistema',productsActive:'novos espaços de produto',languages:'em múltiplos idiomas',official:'curadoria oficial',
    daily:'Seleção do Dia',dailySub:'Espaços preparados para os novos produtos da BlackGold.',allProducts:'Ver todos os produtos',showcase:'Vitrine Premium',showcaseSub:'A identidade fica pronta antes do catálogo real entrar.',allShowcase:'Ver toda a vitrine',
    coming:'Produto em breve',reserved:'Espaço reservado para novo produto',details:'Ver detalhes',price:'Em breve',ecoTitle:'Ecossistema <em>BlackGold</em>',ecoSub:'Acesse projetos, redes e canais oficiais. A Loja é apenas uma das opções; o usuário escolhe o destino.',
    ecosystemOfficial:'ECOSSISTEMA OFICIAL',footerTag:'Curadoria feminina. Um padrão mais alto.',rights:'Todos os direitos reservados.'
  },
  'en-US':{
    navFeatured:'Featured',navShowcase:'Showcase',navEcosystem:'Ecosystem',
    heroEyebrow:'BEAUTY · FASHION · ACCESSORIES · LIFESTYLE',heroTitle:'Female curation<br>with a <em>premium</em> presence.',heroLede:'Fashion, beauty and accessories selected in a cleaner, elegant and direct experience.',explore:'Explore finds',openEco:'Open ecosystem',productsActive:'new product slots',languages:'in multiple languages',official:'official curation',daily:'Daily Selection',dailySub:'Prepared spaces for BlackGold’s new products.',allProducts:'See all products',showcase:'Premium Showcase',showcaseSub:'The identity is ready before the real catalog enters.',allShowcase:'View full showcase',coming:'Product coming soon',reserved:'Reserved space for a new product',details:'View details',price:'Coming soon',ecoTitle:'BlackGold <em>Ecosystem</em>',ecoSub:'Access official projects, networks and channels. The Store is only one option; the user chooses the destination.',ecosystemOfficial:'OFFICIAL ECOSYSTEM',footerTag:'Female curation. A higher standard.',rights:'All rights reserved.'
  },
  'es-419':{
    navFeatured:'Destacados',navShowcase:'Vitrina',navEcosystem:'Ecosistema',heroEyebrow:'BELLEZA · MODA · ACCESORIOS · ESTILO DE VIDA',heroTitle:'Curaduría femenina<br>con presencia <em>premium.</em>',heroLede:'Moda, belleza y accesorios seleccionados en una experiencia más limpia, elegante y directa.',explore:'Explorar hallazgos',openEco:'Abrir ecosistema',productsActive:'nuevos espacios de producto',languages:'en varios idiomas',official:'curaduría oficial',daily:'Selección del Día',dailySub:'Espacios preparados para los nuevos productos BlackGold.',allProducts:'Ver todos los productos',showcase:'Vitrina Premium',showcaseSub:'La identidad queda lista antes de cargar el catálogo real.',allShowcase:'Ver toda la vitrina',coming:'Producto próximamente',reserved:'Espacio reservado para un nuevo producto',details:'Ver detalles',price:'Próximamente',ecoTitle:'Ecosistema <em>BlackGold</em>',ecoSub:'Accede a proyectos, redes y canales oficiales. La Tienda es solo una opción; el usuario elige el destino.',ecosystemOfficial:'ECOSISTEMA OFICIAL',footerTag:'Curaduría femenina. Un estándar más alto.',rights:'Todos los derechos reservados.'
  }
};
const SUPPORTED=['pt-BR','en-US','es-419'];
const localeFromButton={PT:'pt-BR',EN:'en-US',ES:'es-419'};
const buttonFromLocale={'pt-BR':'PT','en-US':'EN','es-419':'ES'};
const storage={get:(k)=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
let locale=storage.get('blackgold_locale');
if(!SUPPORTED.includes(locale)){
  const langs=navigator.languages||[navigator.language||'en-US'];
  const first=langs.map(x=>String(x).toLowerCase()).find(x=>x.startsWith('pt')||x.startsWith('es'));
  locale=first?.startsWith('pt')?'pt-BR':first?.startsWith('es')?'es-419':'en-US';
}
function t(key){return I18N[locale]?.[key]??I18N['en-US'][key]??key}
function applyI18n(){
  document.documentElement.lang=locale;
  document.querySelectorAll('[data-i18n]').forEach(el=>{const key=el.dataset.i18n;el.textContent=t(key)});
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{const key=el.dataset.i18nHtml;el.innerHTML=t(key)});
  document.querySelectorAll('.lang').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.lang===buttonFromLocale[locale]));
  renderProducts();
  renderHomeEcosystem();
  renderEcosystemPage();
}
document.querySelectorAll('.lang').forEach(btn=>btn.addEventListener('click',()=>{locale=localeFromButton[btn.dataset.lang]||'en-US';storage.set('blackgold_locale',locale);applyI18n()}));
const placeholder='./assets/logo-cn-square.png';
function productCard(featured=false,index=1){
  if(featured){return `<article class="feature-card"><div class="feature-media"><img src="${placeholder}" alt="${t('coming')}"></div><div class="feature-body"><h3>${t('coming')}</h3><span class="micro">BlackGold Select ${String(index).padStart(2,'0')}</span><p>${t('reserved')}</p><strong>${t('price')}</strong><span class="feature-cta" aria-disabled="true">${t('details')} <span>→</span></span></div></article>`}
  return `<article class="product-card"><div class="product-media"><img src="${placeholder}" alt="${t('coming')}"></div><h3>${t('coming')}</h3><strong>${t('price')}</strong></article>`
}
function renderProducts(){
  const featured=document.querySelector('[data-featured-grid]');
  if(featured) featured.innerHTML=[1,2,3].map(i=>productCard(true,i)).join('');
  document.querySelectorAll('[data-product-grid]').forEach(grid=>{const count=Number(grid.dataset.count||8);grid.innerHTML=Array.from({length:count},(_,i)=>productCard(false,i+1)).join('')});
  document.querySelectorAll('[data-full-product-grid]').forEach(grid=>{const count=Number(grid.dataset.count||12);grid.innerHTML=Array.from({length:count},(_,i)=>`<article class="full-card"><div class="media"><img src="${placeholder}" alt="${t('coming')}"></div><div class="body"><h3>${t('coming')}</h3><p>${t('reserved')}</p><div class="price">${t('price')}</div></div></article>`).join('')});
}
let manifest=null;
async function loadManifest(){
  try{const r=await fetch('./ecosystem.json',{cache:'no-store'});if(!r.ok)throw new Error(r.status);manifest=await r.json();}
  catch(e){console.warn('BlackGold manifest unavailable',e);manifest={projects:[],channels:[]};}
  renderHomeEcosystem();renderEcosystemPage();
}
function allManifestItems(){
  if(!manifest)return[];
  const a=[];
  if(manifest.hub)a.push(manifest.hub);
  if(Array.isArray(manifest.projects))a.push(...manifest.projects);
  if(Array.isArray(manifest.channels))a.push(...manifest.channels);
  return a;
}
function itemLabel(item){return item.labels?.[locale]||item.label||item.labels?.['pt-BR']||item.id}
function itemDesc(item){return item.descriptions?.[locale]||item.descriptions?.['pt-BR']||`${item.type||item.kind||'official'} · ${item.status||'active'}`}
function itemUrl(item){return item.canonical_url||item.url||item.fallback_url||'#'}
const iconMap={'fitnexus-coach':'◆','fitnexus-coach-blackgold':'◆','appevidex':'◈','preco-no-ponto':'▣','instagram':'◎','youtube':'▶','telegram':'➤','github':'◉','linkedin':'in','facebook':'f','tiktok':'♪','kwai':'K','contact':'✉','hub-official':'⌂'};
function renderHomeEcosystem(){
  const target=document.querySelector('[data-home-ecosystem]');if(!target||!manifest)return;
  const preferred=['fitnexus-coach','fitnexus-coach-blackgold','appevidex','preco-no-ponto','instagram','telegram','youtube'];
  const items=preferred.map(id=>allManifestItems().find(x=>x.id===id)).filter(Boolean).slice(0,6);
  target.innerHTML=items.map(item=>`<a class="eco-link" href="${itemUrl(item)}" target="_blank" rel="noopener"><span class="eco-icon">${iconMap[item.id]||'◆'}</span><span><b>${itemLabel(item)}</b><small>${itemDesc(item)}</small></span><i>›</i></a>`).join('');
}
function renderEcosystemPage(){
  const target=document.querySelector('[data-ecosystem-page]');if(!target||!manifest)return;
  const groups=[
    {title:locale==='pt-BR'?'Projetos e produtos':locale==='es-419'?'Proyectos y productos':'Projects & products',filter:x=>['app','store','android_app','saas','project'].includes(x.type||x.kind)||['hub-official'].includes(x.id)},
    {title:locale==='pt-BR'?'Canais oficiais':locale==='es-419'?'Canales oficiales':'Official channels',filter:x=>!(['app','store','android_app','saas','project'].includes(x.type||x.kind)||['hub-official'].includes(x.id))}
  ];
  target.innerHTML=groups.map(g=>{const items=allManifestItems().filter(g.filter);return `<section class="eco-panel"><h2>${g.title}</h2><p>${locale==='pt-BR'?'Links lidos do manifesto canônico versionado.':locale==='es-419'?'Enlaces leídos del manifiesto canónico versionado.':'Links loaded from the canonical versioned manifest.'}</p><div class="eco-grid">${items.map(item=>`<a class="eco-card" href="${itemUrl(item)}" target="_blank" rel="noopener"><span class="mark">${iconMap[item.id]||'◆'}</span><span><b>${itemLabel(item)}</b><small>${itemDesc(item)}</small></span><span class="arrow">›</span></a>`).join('')}</div></section>`}).join('');
}
const menu=document.querySelector('[data-mobile-menu]');
if(menu)menu.addEventListener('click',()=>document.body.classList.toggle('menu-open'));
applyI18n();
loadManifest();