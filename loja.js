/* Loja Completa — Cosa Nostra | V3 MODAL DETALHES + IMAGENS RÁPIDAS + CACHE */
(function () {
  'use strict';

  var CN_STORE_INSTAGRAM = '@cosanostra.blackgold';
  var CN_STORE_TELEGRAM = '@BlackGoldSociety';
  var CN_STORE_HOME_URL = 'https://projetoscosanostra.github.io/La_Famiglia_Links/';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function safe(v) { return v === null || v === undefined ? '' : String(v); }
  function trim(v) { return safe(v).replace(/^\s+|\s+$/g, ''); }
  function lower(v) { return trim(v).toLowerCase(); }

  var PAGE_SIZE = isCompactStoreLayout() ? 24 : 36;

  var state = {
    products: [],
    active: [],
    filtered: [],
    featured: null,
    query: '',
    family: 'Tudo',
    sort: 'featured',
    rendered: PAGE_SIZE,
    gallery: {},
    modalImages: [],
    modalIndex: 0,
    modalProduct: null,
    modalKey: '',
    modalInstantSrc: '',
    modalInstantIndex: 0,
    productByKey: {},
    imageCache: {}
  };


  // ✅ Performance da Loja Completa:
  // - cards fora da tela não baixam imagem imediatamente;
  // - galeria dos cards só pré-carrega quando o usuário interage;
  // - Produto do Dia continua com prioridade alta.
  var CN_TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  var cnStoreImageObserver = null;

  // ✅ Mesma lógica de velocidade da index:
  // - quando a imagem for URL externa, usa proxy WebP leve;
  // - quando a imagem já for asset local WebP, mantém direto;
  // - preserva fallback original se o proxy falhar.
  var CN_IMAGE_OPTIMIZE = true;
  var CN_IMAGE_PROXY_BASE = 'https://wsrv.nl/';

  function canUseFastImageProxy(url) {
    var u = trim(url);
    var x = lower(u);
    if (!CN_IMAGE_OPTIMIZE || !u) return false;
    if (!/^https?:\/\//i.test(u)) return false;
    if (x.indexOf('wsrv.nl/') >= 0 || x.indexOf('images.weserv.nl/') >= 0) return false;
    if (x.indexOf('data:image/') === 0 || x.indexOf('blob:') === 0) return false;
    if (/\.(svg|gif)(\?.*)?$/i.test(u)) return false;
    return true;
  }

  function getFastImageWidth(kind) {
    var mobile = isCompactStoreLayout();
    if (kind === 'modal' || kind === 'lightbox') return mobile ? 900 : 1180;
    if (kind === 'featured') return mobile ? 720 : 900;
    if (kind === 'hero') return mobile ? 900 : 1400;
    return mobile ? 420 : 560;
  }

  function fastImageUrl(url, kind) {
    var u = ensureHttp(url);
    if (!canUseFastImageProxy(u)) return u;

    var w = getFastImageWidth(kind || 'card');
    return CN_IMAGE_PROXY_BASE +
      '?url=' + encodeURIComponent(u) +
      '&w=' + encodeURIComponent(String(w)) +
      '&q=72&output=webp&we=1';
  }

  function setImageFallback(img, fallbackSrc) {
    if (!img) return;
    var fb = trim(fallbackSrc || '');
    if (fb) img.setAttribute('data-cn-fallback-src', fb);
    else img.removeAttribute('data-cn-fallback-src');

    if (img.getAttribute('data-cn-fallback-bound') === '1') return;
    img.setAttribute('data-cn-fallback-bound', '1');

    img.addEventListener('error', function () {
      var fallback = trim(img.getAttribute('data-cn-fallback-src') || '');
      var current = trim(img.getAttribute('src') || '');
      if (fallback && fallback !== current) {
        img.removeAttribute('data-cn-fallback-src');
        img.src = fallback;
      }
    });
  }


  function isCompactStoreLayout() {
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) return true;
    } catch (e) {}
    try {
      return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '') || window.innerWidth <= 720;
    } catch (e2) {}
    return false;
  }

  function loadDeferredStoreImage(img) {
    if (!img) return;
    var src = img.getAttribute('data-cn-src') || '';
    if (!src) return;

    setImageFallback(img, img.getAttribute('data-cn-fallback-src') || '');
    img.removeAttribute('data-cn-src');

    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  function observeStoreImages(root) {
    var scope = root || document;
    var imgs = qsa('img[data-cn-src]', scope);
    if (!imgs.length) return;

    try {
      if (!('IntersectionObserver' in window)) {
        imgs.forEach(loadDeferredStoreImage);
        return;
      }

      if (!cnStoreImageObserver) {
        cnStoreImageObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry && (entry.isIntersecting || entry.intersectionRatio > 0)) {
              cnStoreImageObserver.unobserve(entry.target);
              loadDeferredStoreImage(entry.target);
            }
          });
        }, {
          rootMargin: (isCompactStoreLayout() ? '620px 0px' : '760px 0px'),
          threshold: 0.01
        });
      }

      imgs.forEach(function (img) { cnStoreImageObserver.observe(img); });
    } catch (e) {
      imgs.forEach(loadDeferredStoreImage);
    }
  }

  function forceStoreImage(img, src, kind) {
    if (!img || !src) return;
    var fast = fastImageUrl(src, kind || 'card');
    img.removeAttribute('data-cn-src');
    setImageFallback(img, src);
    if (img.getAttribute('src') !== fast) img.setAttribute('src', fast);
  }

  function escapeHtml(str) {
    return safe(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureHttp(url) {
    var u = trim(url);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (/^(mercadolivre|mercadolibre|meli)\./i.test(u) || u.indexOf('meli.la/') === 0 || u.indexOf('meli.co/') === 0) return 'https://' + u;
    return u;
  }

  function getTitle(p) { return trim((p && (p.title || p.name || p.sku)) || 'Produto'); }
  function getSku(p) { return trim((p && p.sku) || ''); }
  function getId(p) { return trim((p && (p.id_busca || p.ml_id || p.id_ml || p.mercado_livre_id)) || ''); }
  function getImage(p) {
    return trim((p && (p.image || p.image_url || p.img || p.imageUrl || p.imageURL || p.cover || p.media)) || '');
  }

  function getList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(trim).filter(Boolean);
    if (typeof value === 'string') return value.split(/\n|,|;/).map(trim).filter(Boolean);
    return [];
  }

  function getBadges(p) { return getList(p && (p.badges || p.tags)); }
  function getSecondary(p) { return getList(p && (p.categorias_secundarias || p.secondary_categories)); }

  function isActive(p) { return p && p.active !== false && p.is_active !== false && p.disabled !== true; }
  function isFeatured(p) { return p && (p.featured === true || p.is_featured === true); }

  function isSameProduct(a, b) {
    if (!a || !b) return false;
    var aSku = getSku(a);
    var bSku = getSku(b);
    if (aSku && bSku && aSku === bSku) return true;

    var aId = getId(a);
    var bId = getId(b);
    if (aId && bId && aId === bId) return true;

    return lower(getTitle(a)) === lower(getTitle(b));
  }

  function getBuyUrl(p) {
    var candidates = [p && p.open_url, p && p.short_url, p && p.relink_open_url, p && p.canonical_url, p && p.check_url, p && p.resolved_url];
    for (var i = 0; i < candidates.length; i++) {
      var u = ensureHttp(candidates[i]);
      if (!u) continue;
      if (/\/social\//i.test(u) || /\/lists\//i.test(u)) continue;
      return u;
    }
    var id = getId(p);
    return id ? 'https://lista.mercadolivre.com.br/' + encodeURIComponent(id) : '';
  }

  function looksLikeImageUrl(u) {
    var x = lower(u);
    if (!x) return false;
    if (x.indexOf('data:image/') === 0) return true;
    if (x.indexOf('github.com/user-attachments/assets/') >= 0) return true;
    if (x.indexOf('raw.githubusercontent.com/') >= 0) return true;
    if (/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(u)) return true;
    return false;
  }

  function pushImage(out, seen, value) {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach(function (item) { pushImage(out, seen, item); });
      return;
    }

    if (typeof value === 'object') {
      pushImage(out, seen, value.url || value.src || value.image || value.image_url || value.href || '');
      return;
    }

    getList(String(value)).forEach(function (raw) {
      var u = ensureHttp(raw);
      if (!u || !looksLikeImageUrl(u)) return;
      var key = lower(u);
      if (seen[key]) return;
      seen[key] = true;
      out.push(u);
    });
  }

  function getImages(p) {
    var out = [];
    var seen = {};

    pushImage(out, seen, getImage(p));
    pushImage(out, seen, p && p.images);
    pushImage(out, seen, p && p.imagens);
    pushImage(out, seen, p && p.gallery);
    pushImage(out, seen, p && p.galeria);
    pushImage(out, seen, p && p.gallery_images);
    pushImage(out, seen, p && p.image_gallery);
    pushImage(out, seen, p && p.extra_images);
    pushImage(out, seen, p && p.images_extra);
    pushImage(out, seen, p && p.additional_images);
    pushImage(out, seen, p && p.product_images);

    for (var i = 2; i <= 12; i++) {
      pushImage(out, seen, p && p['image_' + i]);
      pushImage(out, seen, p && p['imagem_' + i]);
      pushImage(out, seen, p && p['image' + i]);
      pushImage(out, seen, p && p['imagem' + i]);
    }

    return out.length ? out : ['assets/logo.png'];
  }

  function preloadOneImage(url, kind) {
    var original = trim(url);
    if (!original) return;
    var u = fastImageUrl(original, kind || 'modal');
    if (!u || state.imageCache[u]) return;

    var im = new Image();
    try { im.decoding = 'async'; } catch (e) {}
    im.onerror = function () {
      if (original && original !== u && !state.imageCache[original]) {
        var fallback = new Image();
        try { fallback.decoding = 'async'; } catch (e2) {}
        fallback.src = original;
        state.imageCache[original] = fallback;
      }
    };
    im.src = u;
    state.imageCache[u] = im;
  }

  function preloadGalleryAround(images, index, skipCurrent, kind) {
    if (!images || images.length < 2) return;
    var current = typeof index === 'number' ? index : 0;
    for (var i = Math.max(0, current - 1); i <= Math.min(images.length - 1, current + 1); i++) {
      if (skipCurrent && i === current) continue;
      preloadOneImage(images[i], kind || 'modal');
    }
  }

  function runWhenIdle(fn, delay) {
    var ms = typeof delay === 'number' ? delay : 250;
    try {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(fn, { timeout: Math.max(700, ms + 500) });
        return;
      }
    } catch (e) {}
    window.setTimeout(fn, ms);
  }

  function schedulePreloadOneImage(url, delay, kind) {
    var u = trim(url);
    if (!u) return;
    var fast = fastImageUrl(u, kind || 'modal');
    if (state.imageCache[fast] || state.imageCache[u]) return;
    runWhenIdle(function () { preloadOneImage(u, kind || 'modal'); }, delay);
  }

  function schedulePreloadGalleryAround(images, index, skipCurrent, delay, kind) {
    if (!images || images.length < 2) return;
    runWhenIdle(function () { preloadGalleryAround(images, index, skipCurrent, kind || 'modal'); }, delay);
  }

  function makeProductKey(p, prefix, index) {
    var raw = getSku(p) || getId(p) || getTitle(p) || ('produto-' + safe(index || 0));
    return safe(prefix || 'produto') + ':' + lower(raw).replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function rememberProduct(key, p) {
    if (!key || !p) return key;
    state.productByKey[key] = p;
    return key;
  }

  function getProductByKey(key) {
    return state.productByKey[key] || state.featured || null;
  }

  function formatPrice(p) { return trim((p && (p.price_text || p.price || p.preco_atual)) || ''); }
  function oldPrice(p) { return trim((p && (p.old_price_text || p.old_price || p.preco_antigo)) || ''); }
  function discount(p) { return trim((p && (p.discount_text || p.discount || p.desconto)) || ''); }
  function promoText(p) { return trim((p && (p.promo_text || p.price_note || p.price_observation)) || ''); }
  function buyCta(p) { return trim((p && (p.buy_cta || p.cta_text)) || '') || 'Comprar'; }


  function displayTitle(raw) {
    var t = trim(raw || 'Produto');
    t = t.replace(/Skinactive/g, 'SkinActive');
    t = t.replace(/Tudo\s+em\s+1\s+400\s*ml/ig, 'Tudo em 1 — 400ml');
    t = t.replace(/Tudo\s+em\s+1\s+—\s+400\s*ml/ig, 'Tudo em 1 — 400ml');
    t = t.replace(/\s+400\s*ml\b/ig, ' — 400ml');
    t = t.replace(/—\s+—/g, '—');
    return t;
  }

  function getShortDescription(p) {
    var desc = trim(p && (p.description || p.descricao || p.short_description || p.descricao_curta || p.summary || p.resumo));
    if (desc) return desc;

    var title = displayTitle(getTitle(p));
    var badges = getBadges(p).concat(getSecondary(p)).map(lower).join(' ');

    if (/agua micelar|água micelar|garnier|skinactive/i.test(title + ' ' + badges)) {
      return '💧 Água Micelar Garnier SkinActive Tudo em 1 — 400ml — limpa, demaquila, hidrata e suaviza em um só passo. Ideal para todos os tipos de pele, com textura não oleosa e uso no rosto, olhos e lábios.';
    }

    var promo = promoText(p);
    if (promo) return promo;
    return 'Achado premium selecionado pela curadoria Cosa Nostra para compra rápida e segura. Confira preço, frete e disponibilidade no Mercado Livre antes de concluir.';
  }

  function normalizeHashtagWord(s) {
    var out = trim(s);
    try { out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    out = out.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    if (!out) return '';
    return out.split(/\s+/).map(function (part) {
      return part ? part.charAt(0).toUpperCase() + part.slice(1) : '';
    }).join('');
  }

  function getModalHashtags(p) {
    var seen = {};
    var words = [];
    getBadges(p).concat(getSecondary(p)).forEach(function (item) {
      var tag = normalizeHashtagWord(item);
      if (!tag) return;
      var k = lower(tag);
      if (seen[k]) return;
      seen[k] = true;
      words.push('#' + tag);
    });
    ['MercadoLivre','CosaNostraBlackGold','BlackGoldSociety'].forEach(function (tag) {
      var k = lower(tag);
      if (!seen[k]) {
        seen[k] = true;
        words.push('#' + tag);
      }
    });
    return words.slice(0, 14).join(' ');
  }

  function detailRowHtml(label, value) {
    value = trim(value);
    if (!value) return '';
    return '<div class="lcImageModal__row"><span>' + escapeHtml(label) + '</span><b>' + escapeHtml(value) + '</b></div>';
  }

  function modalDetailsHtml(p) {
    var id = getId(p);
    var buy = getBuyUrl(p);
    var price = formatPrice(p);
    var old = oldPrice(p);
    var disc = discount(p);
    var checked = trim(p && (p.price_checked_at || p.preco_conferido_em || p.checked_at));
    var badges = getBadges(p).slice(0, 6);
    var chips = badges.map(function (b) { return '<span>' + escapeHtml(b) + '</span>'; }).join('');

    return '' +
      '<div class="lcImageModal__eyebrow">Informações do achado</div>' +
      '<h3 class="lcImageModal__detailTitle">' + escapeHtml(displayTitle(getTitle(p))) + '</h3>' +
      '<p class="lcImageModal__desc">' + escapeHtml(getShortDescription(p)) + '</p>' +
      (chips ? '<div class="lcImageModal__chips">' + chips + '</div>' : '') +
      '<div class="lcImageModal__meta">' +
        detailRowHtml('Código Mercado Livre', id) +
        detailRowHtml('Preço atual', price) +
        detailRowHtml('Preço anterior', old) +
        detailRowHtml('Oferta', disc) +
        detailRowHtml('Preço conferido', checked) +
      '</div>' +
      '<div class="lcImageModal__storeTitle">Canais oficiais da loja</div>' +
      '<div class="lcImageModal__store">' +
        detailRowHtml('Instagram da vitrine', CN_STORE_INSTAGRAM) +
        detailRowHtml('Telegram', CN_STORE_TELEGRAM) +
        detailRowHtml('Página oficial', CN_STORE_HOME_URL) +
      '</div>' +
      '<div class="lcImageModal__hash">' + escapeHtml(getModalHashtags(p)) + '</div>' +
      (id ? '<p class="lcImageModal__hint">🔍 Busque no Mercado Livre por: <b>' + escapeHtml(id) + '</b></p>' : '') +
      (buy ? '<p class="lcImageModal__hint">🔗 Link direto: <b>' + escapeHtml(buy) + '</b></p>' : '');
  }

  function toast(msg) {
    var el = qs('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    text = safe(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('Copiado.');
      }).catch(function () {
        fallbackCopy(text);
        toast('Copiado.');
      });
    } else {
      fallbackCopy(text);
      toast('Copiado.');
    }
  }

  function updateCounters() {
    qsa('[data-total-products]').forEach(function (el) {
      el.textContent = String(state.active.length);
    });
  }

  function mediaHtml(p, key) {
    key = rememberProduct(key, p);
    var images = getImages(p);
    var idx = state.gallery[key] || 0;
    if (idx >= images.length) idx = 0;
    var img = images[idx];
    var hasMany = images.length > 1;
    // Produto do Dia: carrega só a imagem atual. Vizinhas entram em idle para não travar a abertura.
    schedulePreloadGalleryAround(images, idx, true, 900, 'featured');

    var dots = images.map(function (_, i) {
      return '<span class="lcDot' + (i === idx ? ' is-active' : '') + '"></span>';
    }).join('');

    return '' +
      '<div class="lcMedia" data-gallery-key="' + escapeHtml(key) + '">' +
        '<span class="lcMediaBadge">⭐ Produto do dia</span>' +
        '<span class="lcCount">' + (idx + 1) + '/' + images.length + '</span>' +
        '<img src="' + escapeHtml(fastImageUrl(img, 'featured')) + '" data-cn-fallback-src="' + escapeHtml(img) + '" alt="' + escapeHtml(getTitle(p)) + '" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" data-zoom-key="' + escapeHtml(key) + '">' +
        (hasMany ? '<button class="lcGalleryArrow lcGalleryArrow--prev" data-gallery-prev="' + escapeHtml(key) + '" type="button" ' + (idx === 0 ? 'hidden' : '') + '>‹</button>' : '') +
        (hasMany ? '<button class="lcGalleryArrow lcGalleryArrow--next" data-gallery-next="' + escapeHtml(key) + '" type="button" ' + (idx >= images.length - 1 ? 'hidden' : '') + '>›</button>' : '') +
        (hasMany ? '<div class="lcDots">' + dots + '</div>' : '') +
        '<button class="lcZoom" data-zoom-key="' + escapeHtml(key) + '" type="button" aria-label="Ver detalhes do produto">🔎 Ver detalhes</button>' +
      '</div>';
  }

  function cardMediaHtml(p, key) {
    key = rememberProduct(key, p);
    var images = getImages(p);
    var idx = state.gallery[key] || 0;
    if (idx >= images.length) idx = 0;
    var img = images[idx];
    var hasMany = images.length > 1;
    // Performance: não pré-carregar galerias da lista inteira.
    // A imagem do card é carregada por IntersectionObserver e a galeria só no clique.

    var dots = images.map(function (_, i) {
      return '<span class="lcDot' + (i === idx ? ' is-active' : '') + '"></span>';
    }).join('');

    return '' +
      '<div class="lcCardMedia" data-gallery-key="' + escapeHtml(key) + '">' +
        (isFeatured(p) ? '<span class="lcCardBadge">⭐ do dia</span>' : '') +
        (hasMany ? '<span class="lcCardCount">' + (idx + 1) + '/' + images.length + '</span>' : '') +
        '<img src="' + CN_TRANSPARENT_PIXEL + '" data-cn-src="' + escapeHtml(fastImageUrl(img, 'card')) + '" data-cn-fallback-src="' + escapeHtml(img) + '" alt="' + escapeHtml(getTitle(p)) + '" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" data-zoom-key="' + escapeHtml(key) + '">' +
        (hasMany ? '<button class="lcGalleryArrow lcGalleryArrow--prev" data-gallery-prev="' + escapeHtml(key) + '" type="button" ' + (idx === 0 ? 'hidden' : '') + '>‹</button>' : '') +
        (hasMany ? '<button class="lcGalleryArrow lcGalleryArrow--next" data-gallery-next="' + escapeHtml(key) + '" type="button" ' + (idx >= images.length - 1 ? 'hidden' : '') + '>›</button>' : '') +
        (hasMany ? '<div class="lcDots lcDots--card">' + dots + '</div>' : '') +
        '<button class="lcZoom lcZoom--card" data-zoom-key="' + escapeHtml(key) + '" type="button" aria-label="Ver detalhes do produto">🔎 Ver detalhes</button>' +
      '</div>';
  }

  function renderFeatured() {
    var root = qs('#featured');
    if (!root) return;

    var p = state.featured;
    if (!p) {
      root.innerHTML = '<div class="lcLoading">Nenhum Produto do Dia definido.</div>';
      return;
    }

    var key = makeProductKey(p, 'featured', 0);
    var id = getId(p);
    var buy = getBuyUrl(p);
    var price = formatPrice(p);
    var old = oldPrice(p);
    var disc = discount(p);
    var tags = getBadges(p).slice(0, 8);
    var note = promoText(p) || 'Confira preço, frete e disponibilidade no Mercado Livre antes de concluir.';
    var checked = trim(p.price_checked_at || '');
    var noteExtra = checked && note.indexOf(checked) < 0 ? '<br>Conferido em ' + escapeHtml(checked) + '. Pode mudar no Mercado Livre.' : '';

    root.innerHTML = '' +
      '<div class="lcFeaturedCard">' +
        mediaHtml(p, key) +
        '<div class="lcInfo">' +
          '<div class="lcLabel">Produto impulsionado de hoje</div>' +
          '<h3 class="lcTitle">' + escapeHtml(displayTitle(getTitle(p))) + '</h3>' +
          '<p class="lcSub">Escolhido para a campanha atual, com oferta e compra rápida.</p>' +
          (price ? '<div class="lcPrice"><div class="lcPriceTop"><span>Oferta em destaque</span>' + (disc ? '<span class="lcDiscount">' + escapeHtml(disc) + '</span>' : '') + '</div><div><span class="lcCurrentPrice">' + escapeHtml(price) + '</span>' + (old ? '<span class="lcOldPrice">' + escapeHtml(old) + '</span>' : '') + '</div><p class="lcNote">' + escapeHtml(note) + noteExtra + '</p></div>' : '') +
          '<div class="lcTags">' + escapeHtml(tags.join(' • ')) + '</div>' +
          '<div class="lcHash">' + escapeHtml(getModalHashtags(p).replace(/#/g, '#')) + '</div>' +
          (id ? '<div class="lcIdBox">Código de busca: <b>' + escapeHtml(id) + '</b></div>' : '') +
          '<div class="lcActions">' +
            (buy ? '<a class="lcBuy" href="' + escapeHtml(buy) + '" target="_blank" rel="noopener">' + 'Comprar agora' + '</a>' : '') +
            '<button class="lcBtn" data-copy-id="' + escapeHtml(id) + '" type="button">Copiar ID</button>' +
            '<button class="lcBtn" data-copy-link="' + escapeHtml(buy) + '" type="button">Copiar Link</button>' +
          '</div>' +
          '<p class="lcHelp">Confira preço, frete e disponibilidade no Mercado Livre antes de concluir.</p>' +
        '</div>' +
      '</div>';
  }

  function mainFamily(p) {
    var raw = lower(p.categoria_principal || '');
    var text = lower([p.title, getBadges(p).join(' '), getSecondary(p).join(' ')].join(' '));

    if (raw.indexOf('beleza') >= 0 || /maquiagem|cabelo|gloss|batom|pele|skincare|cílios|cilios|escova/.test(text)) return 'Beleza';
    if (raw.indexOf('casa') >= 0 || /cozinha|organiza|casa/.test(text)) return 'Casa';
    if (raw.indexOf('segurança') >= 0 || /segurança|camera|alarme/.test(text)) return 'Segurança';
    if (raw.indexOf('carro') >= 0 || /carro|veicular/.test(text)) return 'Carro';
    if (raw.indexOf('moto') >= 0 || /moto|capacete/.test(text)) return 'Moto';
    return 'Tecnologia';
  }

  function buildTags() {
    var counts = { Tudo: state.active.length, Beleza:0, Casa:0, Tecnologia:0, Segurança:0, Carro:0, Moto:0 };

    state.active.forEach(function (p) {
      var f = mainFamily(p);
      counts[f] = (counts[f] || 0) + 1;
    });

    var primary = qs('#primaryTags');
    if (primary) {
      primary.innerHTML = ['Tudo','Beleza','Casa','Tecnologia','Segurança','Carro','Moto'].map(function (name) {
        return '<button type="button" class="tagChip ' + (state.family === name ? 'tagChip--active' : '') + '" data-family="' + escapeHtml(name) + '">' + (name === 'Tudo' ? '👑 ' : '') + escapeHtml(name) + ' (' + (counts[name] || 0) + ')</button>';
      }).join('');
    }

    var tagCount = {};
    state.active.forEach(function (p) {
      getBadges(p).concat(getSecondary(p)).forEach(function (t) {
        t = trim(t);
        if (t) tagCount[t] = (tagCount[t] || 0) + 1;
      });
    });

    var tags = Object.keys(tagCount).filter(function (t) {
      return tagCount[t] > 1;
    }).sort(function (a, b) {
      return tagCount[b] - tagCount[a] || a.localeCompare(b);
    }).slice(0, 24);

    var sec = qs('#secondaryTags');
    if (sec) {
      sec.innerHTML = tags.map(function (t) {
        return '<button type="button" class="tagChip" data-query-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + ' (' + tagCount[t] + ')</button>';
      }).join('');
    }

    var util = qs('#utilityTags');
    if (util) {
      util.innerHTML = ['Premium','Mais Vendido','Oferta do Dia','Feminino','Portátil','Praticidade'].map(function (t) {
        return '<button type="button" class="tagChip" data-query-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>';
      }).join('');
    }
  }

  function productText(p) {
    var aliases = p.aliases_busca;
    if (Array.isArray(aliases)) aliases = aliases.join(' ');
    return lower([p.title, p.sku, p.id_busca, p.categoria_principal, getBadges(p).join(' '), getSecondary(p).join(' '), aliases || ''].join(' '));
  }

  function applyFilters(resetRendered) {
    if (resetRendered) state.rendered = PAGE_SIZE;

    var q = lower(state.query);
    var list = state.active.filter(function (p) {
      if (state.featured && state.active.length > 1 && isSameProduct(p, state.featured)) return false;
      if (state.family && state.family !== 'Tudo' && mainFamily(p) !== state.family) return false;
      if (q && productText(p).indexOf(q) < 0) return false;
      return true;
    });

    list.sort(function (a, b) {
      if (state.sort === 'az') return getTitle(a).localeCompare(getTitle(b));
      if (state.sort === 'za') return getTitle(b).localeCompare(getTitle(a));
      if (state.sort === 'newest') return Number(b.issue_number || b._source_issue_number || 0) - Number(a.issue_number || a._source_issue_number || 0);
      var af = isFeatured(a) ? 1 : 0;
      var bf = isFeatured(b) ? 1 : 0;
      if (af !== bf) return bf - af;
      return Number(b.issue_number || b._source_issue_number || 0) - Number(a.issue_number || a._source_issue_number || 0);
    });

    state.filtered = list;
    if (state.rendered > list.length) state.rendered = Math.min(PAGE_SIZE, list.length || PAGE_SIZE);
    renderProducts();
    buildTags();
  }

  function renderProducts() {
    var grid = qs('#productsGrid');
    var result = qs('#resultCount');
    var loadWrap = qs('#loadMoreWrap');

    if (result) result.textContent = String(state.filtered.length);
    if (!grid) return;

    grid.innerHTML = state.filtered.slice(0, state.rendered).map(cardHtml).join('');
    observeStoreImages(grid);
    if (loadWrap) loadWrap.classList.toggle('hidden', state.rendered >= state.filtered.length);
  }

  function cardHtml(p, index) {
    var key = makeProductKey(p, 'card', index);
    var id = getId(p);
    var buy = getBuyUrl(p);
    var badges = getBadges(p).slice(0, 2);
    var price = formatPrice(p);
    var badgeHtml = badges.map(function (badge) {
      return '<span class="lcMiniTag">' + escapeHtml(badge) + '</span>';
    }).join('');

    return '' +
      '<article class="lcCard">' +
        cardMediaHtml(p, key) +
        '<div class="lcCardBody">' +
          '<h3 class="lcCardTitle">' + escapeHtml(displayTitle(getTitle(p))) + '</h3>' +
          (badgeHtml ? '<div class="lcCardMeta">' + badgeHtml + '</div>' : '') +
          (price ? '<div class="lcCardPrice">' + escapeHtml(price) + '</div>' : '') +
          (id ? '<div class="lcCardCode">Código <b>' + escapeHtml(id) + '</b></div>' : '') +
          '<div class="lcCardActions">' +
            (buy ? '<a class="lcBuy" href="' + escapeHtml(buy) + '" target="_blank" rel="noopener">Comprar</a>' : '') +
            '<button class="lcBtn" data-copy-id="' + escapeHtml(id) + '" type="button">Copiar ID</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function refreshGalleryDom(key) {
    var p = getProductByKey(key);
    if (!p) return;
    var images = getImages(p);
    var idx = state.gallery[key] || 0;
    if (idx < 0) idx = 0;
    if (idx >= images.length) idx = images.length - 1;
    state.gallery[key] = idx;
    schedulePreloadGalleryAround(images, idx, true, 450, 'card');

    qsa('[data-gallery-key]').forEach(function (shell) {
      if (shell.getAttribute('data-gallery-key') !== key) return;

      var img = qs('img[data-zoom-key]', shell);
      if (img && images[idx]) {
        forceStoreImage(img, images[idx], shell.classList && shell.classList.contains('lcMedia') ? 'featured' : 'card');
      }

      var count = qs('.lcCount,.lcCardCount', shell);
      if (count) count.textContent = (idx + 1) + '/' + images.length;

      var prev = qs('[data-gallery-prev]', shell);
      var next = qs('[data-gallery-next]', shell);
      if (prev) prev.hidden = idx <= 0;
      if (next) next.hidden = idx >= images.length - 1;

      qsa('.lcDot', shell).forEach(function (dot, i) {
        if (i === idx) dot.classList.add('is-active');
        else dot.classList.remove('is-active');
      });
    });
  }

  function setGallery(key, delta) {
    var p = getProductByKey(key);
    if (!p) return;
    var images = getImages(p);
    var cur = state.gallery[key] || 0;
    var next = cur + delta;

    if (next < 0) next = 0;
    if (next >= images.length) next = images.length - 1;

    state.gallery[key] = next;
    refreshGalleryDom(key);
  }

  window.CNLcOpenGallery = function (key) { openModal(key); };

  function openModal(key, instantSrc) {
    var p = getProductByKey(key);
    if (!p) return;

    state.modalProduct = p;
    state.modalKey = key || '';
    state.modalImages = getImages(p);
    state.modalIndex = state.gallery[key] || 0;
    if (state.modalIndex < 0) state.modalIndex = 0;
    if (state.modalIndex >= state.modalImages.length) state.modalIndex = state.modalImages.length - 1;
    state.modalInstantSrc = trim(instantSrc || '');
    state.modalInstantIndex = state.modalIndex;

    // Modal rápido: abre primeiro com a imagem já carregada no card e deixa vizinhas para depois.
    schedulePreloadGalleryAround(state.modalImages, state.modalIndex, true, 700, 'modal');
    updateModal();

    var scroll = qs('#modalDetailsScroll');
    if (scroll) scroll.scrollTop = 0;

    var modal = qs('#imageModal');
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('lcModalOpen');
    }
  }

  function closeModal() {
    var modal = qs('#imageModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('lcModalOpen');
    }
  }

  function updateModal() {
    if (!state.modalImages.length) return;

    if (state.modalIndex < 0) state.modalIndex = 0;
    if (state.modalIndex >= state.modalImages.length) state.modalIndex = state.modalImages.length - 1;

    var p = state.modalProduct || getProductByKey(state.modalKey);
    var img = qs('#modalImg');
    var count = qs('#modalCount');
    var prev = qs('#modalPrev');
    var next = qs('#modalNext');
    var title = qs('#modalTitle');
    var details = qs('#modalDetailsScroll');
    var buy = qs('#modalBuy');
    var copy = qs('#modalCopyLink');
    var target = state.modalImages[state.modalIndex] || '';

    if (img) {
      var chosen = target ? fastImageUrl(target, 'modal') : '';
      if (state.modalInstantSrc && state.modalIndex === state.modalInstantIndex) {
        chosen = state.modalInstantSrc;
        state.modalInstantSrc = '';
        if (target && target !== chosen) schedulePreloadOneImage(target, 900, 'modal');
      }
      setImageFallback(img, target);
      if (chosen && img.getAttribute('src') !== chosen) img.src = chosen;
    }

    schedulePreloadGalleryAround(state.modalImages, state.modalIndex, true, 700, 'modal');
    if (count) count.textContent = (state.modalIndex + 1) + '/' + state.modalImages.length;
    if (title) title.textContent = displayTitle(getTitle(p));
    if (prev) prev.hidden = state.modalIndex <= 0;
    if (next) next.hidden = state.modalIndex >= state.modalImages.length - 1;

    if (details && p) details.innerHTML = modalDetailsHtml(p);
    if (buy) {
      var link = p ? getBuyUrl(p) : '';
      buy.href = link || '#';
      buy.textContent = buyCta(p) || 'Comprar agora';
      buy.onclick = function (ev) {
        if (!link) {
          if (ev && ev.preventDefault) ev.preventDefault();
          toast('Link do produto não encontrado.');
          return false;
        }
        return true;
      };
    }
    if (copy) {
      copy.onclick = function () {
        var link = p ? getBuyUrl(p) : '';
        if (!link) {
          toast('Link do produto não encontrado.');
          return;
        }
        copyText(link);
      };
    }
  }

  function downloadText(filename, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  function smartReport() {
    var lines = [];
    lines.push('RELATÓRIO INTELIGENTE — COSA NOSTRA');
    lines.push('Data: ' + new Date().toLocaleString('pt-BR'));
    lines.push('Produtos ativos: ' + state.active.length);
    lines.push('Produtos filtrados: ' + state.filtered.length);
    lines.push('Produto do Dia: ' + (state.featured ? getTitle(state.featured) : 'nenhum'));
    lines.push('');
    state.filtered.slice(0, 100).forEach(function (p, i) {
      lines.push((i + 1) + '. ' + getTitle(p) + ' | ID: ' + getId(p) + ' | ' + getBuyUrl(p));
    });
    downloadText('relatorio-inteligente-cosanostra.txt', lines.join('\n'));
  }

  function csvReport() {
    var rows = [['sku','title','id_busca','price','url']].concat(state.active.map(function (p) {
      return [getSku(p), getTitle(p), getId(p), formatPrice(p), getBuyUrl(p)];
    }));
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        return '"' + safe(c).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
    downloadText('produtos-cosanostra.csv', csv, 'text/csv;charset=utf-8');
  }


  function scrollToLojaTarget(selector, focusSelector) {
    var target = qs(selector);
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      location.hash = selector.replace(/^#/, '');
    }
    if (focusSelector) {
      setTimeout(function () {
        var input = qs(focusSelector);
        if (input && typeof input.focus === 'function') {
          input.focus({ preventScroll: true });
        }
      }, 350);
    }
  }

  function bindFloatingActions() {
    document.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest('.lcFloat a[data-lc-float-action]') : null;
      if (!link) return;

      var action = link.getAttribute('data-lc-float-action') || '';

      if (action === 'home') {
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      if (action === 'featured') {
        scrollToLojaTarget('#produto-do-dia');
        return;
      }
      if (action === 'search') {
        scrollToLojaTarget('#buscar', '#storeSearch');
        return;
      }
      if (action === 'top') {
        scrollToLojaTarget('#topo');
        return;
      }
    }, true);
  }

  function bindEvents() {
    bindFloatingActions();

    document.addEventListener('click', function (ev) {
      var z = ev.target && ev.target.closest ? ev.target.closest('.lcZoom,[data-zoom-key]') : null;
      if (!z) return;
      var key = z.getAttribute('data-zoom-key');
      if (!key) return;
      ev.preventDefault();
      ev.stopPropagation();
      var shell = z.closest ? z.closest('[data-gallery-key]') : null;
      var imgEl = (z.tagName && z.tagName.toLowerCase() === 'img') ? z : (shell ? qs('img[data-zoom-key]', shell) : null);
      var instant = imgEl ? trim(imgEl.getAttribute('src') || '') : '';
      if (instant === CN_TRANSPARENT_PIXEL) instant = '';
      openModal(key, instant);
    }, true);

    document.addEventListener('click', function (ev) {
      var target = ev.target;

      var family = target.closest('[data-family]');
      if (family) {
        state.family = family.getAttribute('data-family') || 'Tudo';
        applyFilters(true);
        return;
      }

      var qtag = target.closest('[data-query-tag]');
      if (qtag) {
        state.query = qtag.getAttribute('data-query-tag') || '';
        var inp = qs('#storeSearch');
        if (inp) inp.value = state.query;
        applyFilters(true);
        return;
      }

      var copyId = target.closest('[data-copy-id]');
      if (copyId) {
        copyText(copyId.getAttribute('data-copy-id') || '');
        return;
      }

      var copyLink = target.closest('[data-copy-link]');
      if (copyLink) {
        copyText(copyLink.getAttribute('data-copy-link') || '');
        return;
      }

      var prev = target.closest('[data-gallery-prev]');
      if (prev) {
        setGallery(prev.getAttribute('data-gallery-prev'), -1);
        return;
      }

      var next = target.closest('[data-gallery-next]');
      if (next) {
        setGallery(next.getAttribute('data-gallery-next'), 1);
        return;
      }

      var zoom = target.closest('[data-zoom-key]');
      if (zoom) {
        var shell2 = zoom.closest ? zoom.closest('[data-gallery-key]') : null;
        var imgEl2 = (zoom.tagName && zoom.tagName.toLowerCase() === 'img') ? zoom : (shell2 ? qs('img[data-zoom-key]', shell2) : null);
        var instant2 = imgEl2 ? trim((imgEl2.currentSrc || imgEl2.getAttribute('src') || '')) : '';
        if (instant2 === CN_TRANSPARENT_PIXEL) instant2 = '';
        openModal(zoom.getAttribute('data-zoom-key'), instant2);
        return;
      }
    });

    var inp = qs('#storeSearch');
    if (inp) inp.addEventListener('input', function () {
      state.query = inp.value;
      applyFilters(true);
    });

    var clear = qs('#clearSearch');
    if (clear) clear.addEventListener('click', function () {
      state.query = '';
      state.family = 'Tudo';
      if (inp) inp.value = '';
      applyFilters(true);
    });

    var sort = qs('#sortSelect');
    if (sort) sort.addEventListener('change', function () {
      state.sort = sort.value;
      applyFilters(true);
    });

    var load = qs('#loadMore');
    if (load) load.addEventListener('click', function () {
      state.rendered += PAGE_SIZE;
      renderProducts();
    });

    var copyStore = qs('#copyStoreLink');
    if (copyStore) copyStore.addEventListener('click', function () {
      copyText(location.href.split('#')[0]);
    });

    var refresh = qs('#refreshFeatured');
    if (refresh) refresh.addEventListener('click', function () {
      renderFeatured();
      toast('Produto do Dia atualizado.');
    });

    var modal = qs('#imageModal');
    if (modal) modal.addEventListener('click', function (ev) {
      if (ev.target === modal) closeModal();
    });

    var close = qs('#modalClose');
    if (close) close.addEventListener('click', closeModal);

    var mPrev = qs('#modalPrev');
    if (mPrev) mPrev.addEventListener('click', function () {
      state.modalIndex--;
      updateModal();
    });

    var mNext = qs('#modalNext');
    if (mNext) mNext.addEventListener('click', function () {
      state.modalIndex++;
      updateModal();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeModal();
      if (ev.key === 'ArrowLeft') { state.modalIndex--; updateModal(); }
      if (ev.key === 'ArrowRight') { state.modalIndex++; updateModal(); }
    });

    var smart = qs('#btnSmartReport');
    if (smart) smart.addEventListener('click', smartReport);

    var copyActive = qs('#btnCopyActive');
    if (copyActive) copyActive.addEventListener('click', function () {
      copyText(state.active.map(function (p) {
        return getTitle(p) + ' | ' + getId(p) + ' | ' + getBuyUrl(p);
      }).join('\n'));
    });

    var csv = qs('#btnCsv');
    if (csv) csv.addEventListener('click', csvReport);

    var maint = qs('#btnMaintenance');
    if (maint) maint.addEventListener('click', function () {
      window.open('logs/link_guardian_review.txt', '_blank');
    });
  }

  function init(payload) {
    var products = Array.isArray(payload) ? payload : (payload.products || payload.items || []);
    state.products = products;
    state.active = products.filter(isActive);

    var featured = state.active.filter(isFeatured).sort(function (a, b) {
      return Number(b.issue_number || b._source_issue_number || 0) - Number(a.issue_number || a._source_issue_number || 0);
    });

    state.featured = featured[0] || state.active[0] || null;
    state.filtered = state.active.slice();

    updateCounters();
    buildTags();
    renderFeatured();
    applyFilters(true);
    bindEvents();
  }

  fetch('produtos.json?v=20260628-loja-modal-detalhes-v3-img-fast-cache', { cache: 'default' })
    .then(function (r) { return r.json(); })
    .then(init)
    .catch(function (err) {
      console.error(err);
      var f = qs('#featured');
      if (f) f.innerHTML = '<div class="lcLoading">Erro ao carregar produtos.json.</div>';
      toast('Erro ao carregar produtos.');
    });
})();
