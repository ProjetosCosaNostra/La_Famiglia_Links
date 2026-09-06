(() => {
  'use strict';

  const FEATURED = [
    {
      title: 'Miss Dior Eau de Parfum',
      brand: 'Dior',
      description: 'Uma fragrância icônica para mulheres que deixam sua marca.',
      price: 'R$ 649,90',
      image: './approved-home/miss-dior.webp',
      query: 'Miss Dior'
    },
    {
      title: 'Bolsa LouLou Small',
      brand: 'Saint Laurent',
      description: 'Elegância atemporal em cada detalhe.',
      price: 'R$ 14.890,00',
      image: './approved-home/ysl-loulou.webp',
      query: 'bolsa feminina'
    },
    {
      title: 'Sandália Gianvito Rossi',
      brand: 'Gianvito Rossi',
      description: 'Sofisticação que eleva qualquer look.',
      price: 'R$ 4.290,00',
      image: './approved-home/gianvito-rossi.webp',
      query: 'sandália feminina'
    }
  ];

  const SHOWCASE = [
    { title: 'Chanel Coco Mademoiselle', price: 'R$ 589,90', image: './approved-home/chanel-coco.webp', query: 'perfume feminino', category: 'Beleza' },
    { title: 'Batom Rouge Dior', price: 'R$ 349,90', image: './approved-home/rouge-dior.webp', query: 'batom', category: 'Beleza' },
    { title: 'Creme Facial Lancôme', price: 'R$ 529,90', image: './approved-home/lancome-creme.webp', query: 'creme facial', category: 'Autocuidado' },
    { title: 'Óculos Saint Laurent', price: 'R$ 2.890,00', image: './approved-home/saint-laurent-oculos.webp', query: 'óculos feminino', category: 'Acessórios' },
    { title: 'Relógio Michael Kors', price: 'R$ 1.890,00', image: './approved-home/michael-kors-relogio.webp', query: 'relógio feminino', category: 'Acessórios' },
    { title: 'Brinco Swarovski', price: 'R$ 1.290,00', image: './approved-home/swarovski-brinco.webp', query: 'brinco feminino', category: 'Acessórios' },
    { title: 'Scarpin Jimmy Choo', price: 'R$ 4.990,00', image: './approved-home/jimmy-choo-scarpin.webp', query: 'scarpin feminino', category: 'Moda' },
    { title: 'Bolsa Dior Saddle', price: 'R$ 17.890,00', image: './approved-home/dior-saddle.webp', query: 'bolsa feminina', category: 'Acessórios' }
  ];

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let applying = false;

  function detailLabel() {
    const lang = document.querySelector('[data-lang].active')?.dataset.lang || 'pt';
    return lang === 'en' ? 'View details' : lang === 'es' ? 'Ver detalles' : 'Ver detalhes';
  }

  function openRealCatalog(query) {
    const trigger = document.querySelector('.search-trigger');
    if (!trigger) return;
    trigger.click();
    setTimeout(() => {
      const input = document.querySelector('#catalogSearch');
      if (!input) return;
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, 30);
  }

  function featuredMarkup(item) {
    return `<article class="featured-card approved-home-card" data-approved-home="featured">
      <div class="featured-img"><img class="approved-visual" src="${esc(item.image)}" alt="${esc(item.title)}"></div>
      <div class="featured-info">
        <h3>${esc(item.title)}</h3>
        <small>${esc(item.brand)}</small>
        <p>${esc(item.description)}</p>
        <div class="price">${esc(item.price)}</div>
        <button type="button" data-approved-query="${esc(item.query)}">${esc(detailLabel())} &nbsp;→</button>
      </div>
    </article>`;
  }

  function showcaseMarkup(item) {
    return `<article class="product-card approved-home-card" data-approved-home="showcase">
      <button type="button" data-approved-query="${esc(item.query)}" aria-label="${esc(detailLabel())}: ${esc(item.title)}">
        <div class="product-media"><img class="approved-visual" src="${esc(item.image)}" alt="${esc(item.title)}"></div>
        <h3>${esc(item.title)}</h3>
        <div class="price">${esc(item.price)}</div>
      </button>
    </article>`;
  }

  function currentFilter() {
    return document.querySelector('.chip.active')?.dataset.filter || 'Todos';
  }

  function renderApprovedHome(filter = currentFilter()) {
    const featured = document.querySelector('#featured');
    const productRow = document.querySelector('#productRow');
    if (!featured || !productRow) return;

    const filtered = filter === 'Todos' ? SHOWCASE : SHOWCASE.filter(item => item.category === filter);
    applying = true;
    featured.innerHTML = FEATURED.map(featuredMarkup).join('');
    productRow.innerHTML = (filtered.length ? filtered : SHOWCASE).map(showcaseMarkup).join('');
    applying = false;
  }

  function lockApprovedEcosystem() {
    const image = document.querySelector('.eco-art img');
    if (!image) return;
    const exact = './approved-home/ecosystem-approved-exact.webp';
    if (!image.src.endsWith('/approved-home/ecosystem-approved-exact.webp')) image.src = exact;
    image.classList.add('approved-ecosystem-art');
  }

  function enforce() {
    if (applying) return;
    const featured = document.querySelector('#featured');
    const row = document.querySelector('#productRow');
    if (featured && !featured.querySelector('[data-approved-home="featured"]')) renderApprovedHome();
    if (row && !row.querySelector('[data-approved-home="showcase"]')) renderApprovedHome();
    lockApprovedEcosystem();
  }

  document.addEventListener('click', event => {
    const approved = event.target.closest('[data-approved-query]');
    if (approved) {
      event.preventDefault();
      event.stopPropagation();
      openRealCatalog(approved.dataset.approvedQuery || '');
      return;
    }
    const filter = event.target.closest('.chip[data-filter]');
    if (filter) setTimeout(() => renderApprovedHome(filter.dataset.filter || 'Todos'), 0);
    const lang = event.target.closest('[data-lang]');
    if (lang) setTimeout(() => renderApprovedHome(), 0);
  }, true);

  const observer = new MutationObserver(() => enforce());
  const start = () => {
    renderApprovedHome('Todos');
    lockApprovedEcosystem();
    const featured = document.querySelector('#featured');
    const row = document.querySelector('#productRow');
    if (featured) observer.observe(featured, { childList: true });
    if (row) observer.observe(row, { childList: true });
    setTimeout(enforce, 150);
    setTimeout(enforce, 700);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
