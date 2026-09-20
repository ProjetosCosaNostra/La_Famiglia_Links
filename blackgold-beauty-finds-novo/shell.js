(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const FORBIDDEN = ['Miss'+' Dior','Dior'+' Saddle','R$ 649'+',90','193'+' produtos'];
  const state = { products: [] };

  document.documentElement.dataset.blackgoldAuthority = 'V26_DESKTOP_V24_MOBILE_ZERO_CATALOG';
  document.documentElement.dataset.catalogCount = '0';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const money = product => {
    if (product.price == null || product.price === '') return '';
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: product.currency || 'BRL'
      }).format(Number(product.price));
    } catch {
      return '';
    }
  };

  const image = product => product.image || '';

  const featuredCard = product => `
    <article class="live-card">
      <div class="live-card-media">${image(product) ? `<img src="${esc(image(product))}" alt="${esc(product.title)}">` : ''}</div>
      <div class="live-card-copy">
        <h3>${esc(product.title)}</h3>
        <span class="brand-name">${esc(product.brand || product.category || 'BlackGold')}</span>
        <p class="description">${esc(product.description || '')}</p>
        ${money(product) ? `<strong class="price">${esc(money(product))}</strong>` : ''}
        <button class="detail" type="button" data-product-id="${esc(product.id)}">Ver detalhes →</button>
      </div>
    </article>`;

  const showcaseCard = product => `
    <article class="live-card" data-product-id="${esc(product.id)}">
      <div class="live-card-media">${image(product) ? `<img src="${esc(image(product))}" alt="${esc(product.title)}">` : ''}</div>
      <h3>${esc(product.title)}</h3>
      ${money(product) ? `<strong class="price">${esc(money(product))}</strong>` : '<span class="price"></span>'}
    </article>`;

  function openProduct(id) {
    const product = state.products.find(item => String(item.id) === String(id));
    if (!product || !/^https?:\/\//i.test(product.destinationUrl || '')) return;
    window.open(product.destinationUrl, '_blank', 'noopener,noreferrer');
  }

  function render(products) {
    state.products = Array.isArray(products) ? products : [];
    const count = state.products.length;
    const featured = state.products.filter(item => item.featured).slice(0, 3);
    const showcase = state.products.slice(0, 8);

    document.body.classList.toggle('has-products', count > 0);
    document.body.dataset.catalogCount = String(count);
    document.documentElement.dataset.catalogCount = String(count);

    const counter = $('.zero-counter');
    if (counter) {
      const strong = counter.querySelector('strong');
      const small = counter.querySelector('small');
      if (count > 0) {
        strong.textContent = String(count);
        small.textContent = count === 1 ? 'produto ativo' : 'produtos ativos';
      } else {
        strong.textContent = 'Curadoria';
        small.textContent = 'seleção editorial';
      }
    }

    const selection = $('#liveSelection');
    const grid = $('#liveShowcase');
    if (selection) selection.innerHTML = featured.map(featuredCard).join('');
    if (grid) grid.innerHTML = showcase.map(showcaseCard).join('');

    document.querySelectorAll('[data-product-id]').forEach(node => {
      node.addEventListener('click', () => openProduct(node.dataset.productId));
    });

    const explore = $('.explore');
    if (explore) explore.href = count > 0 ? '#showcase' : '#ecosystem';
  }

  async function loadPublishedProducts() {
    try {
      const response = await fetch('/api/products?ts=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('catalog_unavailable');
      const payload = await response.json();
      render(Array.isArray(payload.products) ? payload.products : []);
      document.documentElement.dataset.catalogApi = 'PASS';
    } catch {
      render([]);
      document.documentElement.dataset.catalogApi = 'ZERO_FALLBACK';
    }
  }

  const visibleText = document.body.innerText || '';
  const leaked = FORBIDDEN.filter(x => visibleText.includes(x));
  document.documentElement.dataset.guard = leaked.length ? 'BLOCKED' : 'PASS';

  loadPublishedProducts();
})();