const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = { rawProducts: [], products: [], filter: 'Todos', lang: 'pt' };
const preferred = [
  'o-boticario-floratta-my-blue-colonia-75ml',
  'bolsa-feminina-baguete-corrente-immateriale-5j5pkg-24de',
  'arezzo-cinto-fino-fivela-losango-preto',
  'paleta-mystic-glow-ruby-rose',
  'gloss-labial-cherry-bomb-pam-by-pamella-5g',
  'cicaplast-baume-b5-plus-la-roche-posay-40ml',
  'cerave-gel-limpeza-facial-454g',
  'escova-oval-secadora-taiff-easy-lilas-1200w',
  'escova-cabelo-desembaracadora-the-wet-detangler-rosa-tangle-teezer',
  'agua-micelar-garnier-skinactive-tudo-em-1-400ml',
  'kit-sos-makeup-miamake-3em1-rosa',
  'kit-pinceis-maquiagem-13-pecas-estojo-rose'
];

const translations = {
  pt: {
    navFeatured:'Destaque',navShowcase:'Vitrine',navEcosystem:'Ecossistema',eyebrow:'BELEZA <i>•</i> MODA <i>•</i> ACESSÓRIOS <i>•</i> ESTILO DE VIDA',
    heroLine1:'Curadoria feminina',heroLine2:'com presença',heroBody:'Moda, beleza e acessórios selecionados em uma experiência mais limpa, elegante e direta.',
    explore:'Explorar achados',openEco:'Abrir ecossistema',activeProducts:'produtos ativos',languages:'em múltiplos idiomas',officialCuratorship:'curadoria oficial',
    selection:'Seleção do Dia',selectionBody:'Achados selecionados para uma rotina mais elegante.',allProducts:'Ver todos os produtos',showcase:'Vitrine Premium',
    showcaseBody:'Mais que produtos, são escolhas que refletem quem você é.',filterAll:'Todos',filterBeauty:'Beleza',filterFashion:'Moda',filterAccessories:'Acessórios',filterSelfCare:'Autocuidado',
    fullShowcase:'Ver toda a vitrine',officialEco:'ECOSSISTEMA OFICIAL',ecosystem:'Ecossistema',ecosystemBody:'Acesse nossos projetos, redes e canais oficiais.<br>A Loja é apenas uma das opções, não existe redirecionamento automático.',
    hub:'Hub oficial / Loja',contact:'Contato',footerLine:'Curadoria feminina. Um padrão mais alto.',rights:'Todos os direitos reservados.',details:'Ver detalhes',offer:'Ver oferta',buy:'Comprar no Mercado Livre',results:'produtos encontrados'
  },
  en: {
    navFeatured:'Featured',navShowcase:'Showcase',navEcosystem:'Ecosystem',eyebrow:'BEAUTY <i>•</i> FASHION <i>•</i> ACCESSORIES <i>•</i> LIFESTYLE',
    heroLine1:'Feminine curation',heroLine2:'with a',heroBody:'Fashion, beauty and accessories selected in a cleaner, more elegant and direct experience.',
    explore:'Explore finds',openEco:'Open ecosystem',activeProducts:'active products',languages:'in multiple languages',officialCuratorship:'official curation',
    selection:'Today’s Selection',selectionBody:'Selected finds for a more elegant routine.',allProducts:'View all products',showcase:'Premium Showcase',
    showcaseBody:'More than products, choices that reflect who you are.',filterAll:'All',filterBeauty:'Beauty',filterFashion:'Fashion',filterAccessories:'Accessories',filterSelfCare:'Self-care',
    fullShowcase:'View full showcase',officialEco:'OFFICIAL ECOSYSTEM',ecosystem:'Ecosystem',ecosystemBody:'Access our projects, social networks and official channels.<br>The Store is one of several choices; there is no automatic redirect.',
    hub:'Official Hub / Store',contact:'Contact',footerLine:'Feminine curation. A higher standard.',rights:'All rights reserved.',details:'View details',offer:'View offer',buy:'Buy on Mercado Livre',results:'products found'
  },
  es: {
    navFeatured:'Destacados',navShowcase:'Vitrina',navEcosystem:'Ecosistema',eyebrow:'BELLEZA <i>•</i> MODA <i>•</i> ACCESORIOS <i>•</i> ESTILO DE VIDA',
    heroLine1:'Curaduría femenina',heroLine2:'con presencia',heroBody:'Moda, belleza y accesorios seleccionados en una experiencia más limpia, elegante y directa.',
    explore:'Explorar hallazgos',openEco:'Abrir ecosistema',activeProducts:'productos activos',languages:'en varios idiomas',officialCuratorship:'curaduría oficial',
    selection:'Selección del Día',selectionBody:'Hallazgos elegidos para una rutina más elegante.',allProducts:'Ver todos los productos',showcase:'Vitrina Premium',
    showcaseBody:'Más que productos, elecciones que reflejan quién eres.',filterAll:'Todos',filterBeauty:'Belleza',filterFashion:'Moda',filterAccessories:'Accesorios',filterSelfCare:'Autocuidado',
    fullShowcase:'Ver toda la vitrina',officialEco:'ECOSISTEMA OFICIAL',ecosystem:'Ecosistema',ecosystemBody:'Accede a nuestros proyectos, redes y canales oficiales.<br>La Tienda es una de las opciones; no hay redireccionamiento automático.',
    hub:'Hub oficial / Tienda',contact:'Contacto',footerLine:'Curaduría femenina. Un estándar más alto.',rights:'Todos los derechos reservados.',details:'Ver detalles',offer:'Ver oferta',buy:'Comprar en Mercado Livre',results:'productos encontrados'
  }
};

const esc = (value='') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const tidyTitle = value => String(value || 'BlackGold Find').replace(/^[^\p{L}\p{N}]+/u,'').trim();
const blob = product => [product.title,product.category,...(product.secondary||[]),...(product.badges||[])].join(' ').toLowerCase();
const blocked = /masculino|cueca|bermuda|automotiv|carro|moto|capacete|cachorro|\bpet\b|gato|cozinha|fogão|panela|peneira|micro-ondas|fritadeira|cafeteira|geladeira|notebook|smartwatch|dashcam|roteador|wi-fi|wifi|televis|xbox|playstation|console|gamer|carregador|power bank|câmera|camera|pneu|parafusadeira|furadeira|aspirador|mangueira|fralda|bebê|bebe|air fryer|alto-falante|speaker|headset|mouse|teclado|impressora|projetor|fechadura|ssd|hd externo|monitor|luminária|lampada|lâmpada|tv box|fone de ouvido|caixa de som/i;
const beauty = /beleza|maqui|batom|gloss|perfume|colônia|colonia|cílio|cilio|sobrancelha|pele|facial|skincare|cabelo|capilar|shampoo|condicionador|unha|esmalte|depil|hidrat|sabonete|protetor solar|demaquil|pincel|paleta|sombra|corretivo|rímel|rimel|máscara|mascara|sérum|serum|creme|loção|locao|escova secadora|modelador|babyliss|chapinha|secador|vestido|blusa|saia|calça feminina|bolsa feminina|cinto feminino|sandália feminina|brinco|colar feminino|relógio feminino|óculos feminino|feminino|autocuidado/i;
const isBeautyFind = product => beauty.test(blob(product)) && !blocked.test(blob(product));
const image = product => {
  const value = product?.card_image || product?.image || 'assets/logo-cn-square.png';
  return value.startsWith('http') ? value : `./${value.replace(/^\.\//,'')}`;
};
const description = product => {
  const value = String(product?.description || '').trim();
  return value && !/cms|relink|destino|link|issue/i.test(value) ? value : 'Achado selecionado pela curadoria BlackGold.';
};
const price = product => product?.price || translations[state.lang].offer;
const category = product => product?.category || 'BlackGold Find';

function score(product){
  let value = 0;
  const rank = preferred.indexOf(product.sku);
  if(rank >= 0) value += 1000 - rank * 20;
  if(product.featured) value += 12;
  if(product.price) value += 14;
  if(product.has_cleaner_image) value += 35;
  if(/perfume|maquiagem|skincare|cuidado|bolsa feminina|acessório|acessorio/.test(blob(product))) value += 7;
  return value;
}
const ranked = products => [...products].sort((a,b) => score(b)-score(a));

function matchesFilter(product, filter){
  const value = blob(product);
  if(filter === 'Todos') return true;
  if(filter === 'Beleza') return /beleza|maqui|perfume|gloss|batom|cílio|cilio|paleta|sombra|corretivo/.test(value);
  if(filter === 'Moda') return /moda|vestido|blusa|saia|calça feminina/.test(value);
  if(filter === 'Acessórios') return /acess|bolsa feminina|cinto feminino|sandália feminina|brinco|colar|relógio feminino|óculos feminino/.test(value);
  return /autocuidado|cuidado|skincare|facial|pele|cabelo|capilar|hidrat|sabonete|depil/.test(value);
}

function mediaMarkup(product){
  return `<img src="${esc(image(product))}" alt="${esc(tidyTitle(product.title))}" loading="lazy" decoding="async" data-fallback>`;
}

function featuredCard(product){
  return `<article class="featured-card">
    <div class="featured-img">${mediaMarkup(product)}</div>
    <div class="featured-info">
      <h3>${esc(tidyTitle(product.title))}</h3>
      <small>${esc(category(product))}</small>
      <p>${esc(description(product))}</p>
      <div class="price">${esc(price(product))}</div>
      <button data-sku="${esc(product.sku)}">${esc(translations[state.lang].details)} &nbsp;→</button>
    </div>
  </article>`;
}

function productCard(product){
  return `<article class="product-card"><button data-sku="${esc(product.sku)}" aria-label="${esc(translations[state.lang].details)}: ${esc(tidyTitle(product.title))}">
    <div class="product-media">${mediaMarkup(product)}</div>
    <h3>${esc(tidyTitle(product.title))}</h3>
    <div class="price">${esc(price(product))}</div>
  </button></article>`;
}

function bindImageFallbacks(root=document){
  root.querySelectorAll('[data-fallback]').forEach(img => img.addEventListener('error', () => {
    if(!img.src.endsWith('/assets/logo-cn-square.png')) img.src = './assets/logo-cn-square.png';
  }, { once:true }));
}

function bindProductButtons(root=document){
  root.querySelectorAll('[data-sku]').forEach(button => button.addEventListener('click', () => openProduct(button.dataset.sku)));
  bindImageFallbacks(root);
}

function render(){
  const list = ranked(state.products.filter(product => matchesFilter(product,state.filter)));
  $('#featured').innerHTML = ranked(state.products).slice(0,3).map(featuredCard).join('');
  $('#productRow').innerHTML = list.slice(3,11).map(productCard).join('');
  bindProductButtons($('#featured'));
  bindProductButtons($('#productRow'));
}

function openProduct(sku){
  const product = state.rawProducts.find(item => item.sku === sku);
  if(!product) return;
  const modal = $('#productModal');
  $('#modalBody').innerHTML = `<div class="modal-grid">
    <div class="modal-media">${mediaMarkup(product)}</div>
    <div class="modal-copy"><small>BLACKGOLD BEAUTY FINDS</small><h3>${esc(tidyTitle(product.title))}</h3><p>${esc(description(product))}</p><div class="price">${esc(price(product))}</div>
      ${product.id_busca ? `<p><b>Código Mercado Livre:</b> ${esc(product.id_busca)}</p>` : ''}
      <a class="btn gold" href="${esc(product.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(translations[state.lang].buy)} <svg><use href="#i-arrow"/></svg></a>
    </div></div>`;
  bindImageFallbacks($('#modalBody'));
  if($('#catalogModal').open) $('#catalogModal').close();
  modal.showModal();
}

function renderCatalog(query=''){
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  const list = ranked(state.products).filter(product => !needle || blob(product).includes(needle));
  $('#catalogGrid').innerHTML = list.map(productCard).join('');
  $('#catalogResultCount').textContent = `${list.length} ${translations[state.lang].results}`;
  bindProductButtons($('#catalogGrid'));
}

function openCatalog(){
  const modal = $('#catalogModal');
  $('#catalogSearch').value = '';
  renderCatalog();
  modal.showModal();
  setTimeout(() => $('#catalogSearch').focus(), 50);
}

function applyLanguage(lang){
  state.lang = translations[lang] ? lang : 'pt';
  document.documentElement.lang = state.lang === 'pt' ? 'pt-BR' : state.lang;
  $$('[data-lang]').forEach(button => button.classList.toggle('active',button.dataset.lang === state.lang));
  $$('[data-i18n]').forEach(element => {
    const value = translations[state.lang][element.dataset.i18n];
    if(value) element.innerHTML = value;
  });
  $('#catalogSearch').placeholder = state.lang === 'pt' ? 'Buscar por produto, marca ou categoria' : state.lang === 'en' ? 'Search product, brand or category' : 'Buscar producto, marca o categoría';
  render();
  if($('#catalogModal').open) renderCatalog($('#catalogSearch').value);
}

async function loadEcosystem(){
  try{
    const response = await fetch('./ecosystem.json',{cache:'no-store'});
    if(!response.ok) return;
    const ecosystem = await response.json();
    const items = [...(ecosystem.hub ? [ecosystem.hub] : []),...(ecosystem.projects || []),...(ecosystem.channels || [])];
    const find = pattern => items.find(item => pattern.test(`${item.id || ''} ${item.label || ''} ${JSON.stringify(item.labels || {})}`));
    const patterns = {hub:/hub|loja/i,instagram:/instagram/i,youtube:/youtube/i,telegram:/telegram/i,github:/github/i};
    Object.entries(patterns).forEach(([key,pattern]) => {
      const item = find(pattern);
      if(item?.url) $$(`[data-eco="${key}"]`).forEach(link => link.href = item.url);
    });
  }catch(error){ console.warn('Ecosystem links unavailable',error); }
}

function bindInterface(){
  $$('.chip').forEach(button => button.addEventListener('click', () => {
    $$('.chip').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    state.filter = button.dataset.filter;
    render();
  }));
  $$('[data-scroll]').forEach(button => button.addEventListener('click', () => $(button.dataset.scroll)?.scrollIntoView({behavior:'smooth'})));
  $$('.search-trigger').forEach(button => button.addEventListener('click',openCatalog));
  $$('[data-lang]').forEach(button => button.addEventListener('click',() => applyLanguage(button.dataset.lang)));
  $('#catalogSearch').addEventListener('input',event => renderCatalog(event.target.value));
  $('#mobileMenu').addEventListener('click',() => {
    const menu = $('#navLinks');
    const open = menu.classList.toggle('open');
    $('#mobileMenu').setAttribute('aria-expanded',String(open));
  });
  $$('#navLinks a').forEach(link => link.addEventListener('click',() => {
    $('#navLinks').classList.remove('open');
    $('#mobileMenu').setAttribute('aria-expanded','false');
  }));
  $$('.modal .close').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
  $$('.modal').forEach(modal => modal.addEventListener('click',event => { if(event.target === modal) modal.close(); }));
  $('#featured').addEventListener('scroll',event => {
    if(innerWidth > 760) return;
    const index = Math.round(event.currentTarget.scrollLeft / Math.max(1,event.currentTarget.clientWidth * .87));
    $$('.carousel-dots i').forEach((dot,i) => dot.classList.toggle('active',i === Math.min(index,3)));
  },{passive:true});
}

async function boot(){
  const response = await fetch('./catalog.json',{cache:'no-store'});
  if(!response.ok) throw new Error(`Catalog ${response.status}`);
  const data = await response.json();
  state.rawProducts = data.products || [];
  state.products = state.rawProducts.filter(isBeautyFind);
  $('#count').textContent = data.total_active || state.rawProducts.length || 193;
  bindInterface();
  applyLanguage('pt');
  await loadEcosystem();
}

boot().catch(error => {
  console.error(error);
  $('#featured').innerHTML = '<p>Não foi possível carregar a seleção neste momento.</p>';
});
