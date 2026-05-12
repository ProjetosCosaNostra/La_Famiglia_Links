/* Loja Completa — Cosa Nostra | real4 */
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function safe(v) { return v === null || v === undefined ? '' : String(v); }
  function trim(v) { return safe(v).replace(/^\s+|\s+$/g, ''); }
  function lower(v) { return trim(v).toLowerCase(); }

  var PAGE_SIZE = 60;

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
    modalIndex: 0
  };

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
  function getImage(p) { return trim((p && (p.image || p.image_url || p.img)) || ''); }

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

  function getImages(p) {
    var out = [];
    var seen = {};

    function add(u) {
      u = trim(u);
      if (!u) return;
      if (seen[u]) return;
      seen[u] = true;
      out.push(u);
    }

    add(getImage(p));
    [p && p.images, p && p.gallery_images, p && p.gallery, p && p.extra_images].forEach(function (value) {
      getList(value).forEach(add);
    });

    return out.length ? out : ['assets/logo.png'];
  }

  function formatPrice(p) { return trim((p && (p.price_text || p.price || p.preco_atual)) || ''); }
  function oldPrice(p) { return trim((p && (p.old_price_text || p.old_price || p.preco_antigo)) || ''); }
  function discount(p) { return trim((p && (p.discount_text || p.discount || p.desconto)) || ''); }
  function promoText(p) { return trim((p && (p.promo_text || p.price_note || p.price_observation)) || ''); }
  function buyCta(p) { return trim((p && (p.buy_cta || p.cta_text)) || '') || 'Comprar'; }

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
    var images = getImages(p);
    var idx = state.gallery[key] || 0;
    if (idx >= images.length) idx = 0;
    var img = images[idx];
    var hasMany = images.length > 1;

    var dots = images.map(function (_, i) {
      return '<span class="lcDot' + (i === idx ? ' is-active' : '') + '"></span>';
    }).join('');

    return '' +
      '<div class="lcMedia" data-gallery-key="' + escapeHtml(key) + '">' +
        '<span class="lcMediaBadge">⭐ Produto do dia</span>' +
        '<span class="lcCount">' + (idx + 1) + '/' + images.length + '</span>' +
        '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(getTitle(p)) + '" loading="eager" referrerpolicy="no-referrer">' +
        (hasMany ? '<button class="lcGalleryArrow lcGalleryArrow--prev" data-gallery-prev="' + escapeHtml(key) + '" type="button" ' + (idx === 0 ? 'hidden' : '') + '>‹</button>' : '') +
        (hasMany ? '<button class="lcGalleryArrow lcGalleryArrow--next" data-gallery-next="' + escapeHtml(key) + '" type="button" ' + (idx >= images.length - 1 ? 'hidden' : '') + '>›</button>' : '') +
        (hasMany ? '<div class="lcDots">' + dots + '</div>' : '') +
        '<button class="lcZoom" data-zoom-key="' + escapeHtml(key) + '" type="button">🔍 Ampliar</button>' +
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

    var key = 'featured:' + (getSku(p) || getId(p) || 'produto');
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
          '<h3 class="lcTitle">' + escapeHtml(getTitle(p)) + '</h3>' +
          '<p class="lcSub">Escolhido para a campanha atual, com oferta e compra rápida.</p>' +
          (price ? '<div class="lcPrice"><div class="lcPriceTop"><span>Oferta em destaque</span>' + (disc ? '<span class="lcDiscount">' + escapeHtml(disc) + '</span>' : '') + '</div><div><span class="lcCurrentPrice">' + escapeHtml(price) + '</span>' + (old ? '<span class="lcOldPrice">' + escapeHtml(old) + '</span>' : '') + '</div><p class="lcNote">' + escapeHtml(note) + noteExtra + '</p></div>' : '') +
          '<div class="lcTags">' + escapeHtml(tags.join(' • ')) + '</div>' +
          '<div class="lcHash">#Achados_do_Dia #Beleza #Cabelo #Escova_Secadora</div>' +
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
    if (loadWrap) loadWrap.classList.toggle('hidden', state.rendered >= state.filtered.length);
  }

  function cardHtml(p) {
    var img = getImage(p) || getImages(p)[0];
    var id = getId(p);
    var buy = getBuyUrl(p);
    var badges = getBadges(p).slice(0, 2);
    var price = formatPrice(p);

    return '' +
      '<article class="lcCard">' +
        '<div class="lcCardMedia">' + (isFeatured(p) ? '<span class="lcCardBadge">⭐ do dia</span>' : '') + '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(getTitle(p)) + '" loading="lazy" referrerpolicy="no-referrer"></div>' +
        '<div class="lcCardBody">' +
          '<h3 class="lcCardTitle">' + escapeHtml(getTitle(p)) + '</h3>' +
          '<div class="lcCardMeta">' + escapeHtml(badges.join(' • ')) + '</div>' +
          (price ? '<div class="lcCardPrice">' + escapeHtml(price) + '</div>' : '') +
          (id ? '<div class="lcCardCode">Código <b>' + escapeHtml(id) + '</b></div>' : '') +
          '<div class="lcCardActions">' +
            (buy ? '<a class="lcBuy" href="' + escapeHtml(buy) + '" target="_blank" rel="noopener">Comprar</a>' : '') +
            '<button class="lcBtn" data-copy-id="' + escapeHtml(id) + '" type="button">Copiar ID</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function setGallery(key, delta) {
    var p = state.featured;
    if (!p) return;
    var images = getImages(p);
    var cur = state.gallery[key] || 0;
    var next = cur + delta;

    if (next < 0) next = 0;
    if (next >= images.length) next = images.length - 1;

    state.gallery[key] = next;
    renderFeatured();
  }

  function openModal(key) {
    var p = state.featured;
    if (!p) return;

    state.modalImages = getImages(p);
    state.modalIndex = state.gallery[key] || 0;
    updateModal();

    var modal = qs('#imageModal');
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModal() {
    var modal = qs('#imageModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function updateModal() {
    if (!state.modalImages.length) return;

    if (state.modalIndex < 0) state.modalIndex = 0;
    if (state.modalIndex >= state.modalImages.length) state.modalIndex = state.modalImages.length - 1;

    var img = qs('#modalImg');
    var count = qs('#modalCount');

    if (img) img.src = state.modalImages[state.modalIndex];
    if (count) count.textContent = (state.modalIndex + 1) + '/' + state.modalImages.length;
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

  function bindEvents() {
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
        openModal(zoom.getAttribute('data-zoom-key'));
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

  fetch('produtos.json?ts=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(init)
    .catch(function (err) {
      console.error(err);
      var f = qs('#featured');
      if (f) f.innerHTML = '<div class="lcLoading">Erro ao carregar produtos.json.</div>';
      toast('Erro ao carregar produtos.');
    });
})();
