
(function () {
  'use strict';

  var KNOWN_KEYS = [
    'sku',
    'title',
    'name',
    'badges',
    'tags',
    'id_busca',
    'ml_id',
    'id_ml',
    'mercadolivre_id',
    'mercado_livre_id',
    'image_url',
    'image',
    'img',
    'images',
    'imagens',
    'gallery',
    'galeria',
    'gallery_images',
    'extra_images',
    'price_text',
    'old_price_text',
    'discount_text',
    'price_checked_at',
    'promo_text',
    'buy_cta',
    'open_url',
    'canonical_url',
    'check_url',
    'short_url',
    'resolved_url',
    'active',
    'is_active',
    'featured',
    'is_featured',
    'last_checked',
    'last_ok',
    'admin_notes'
  ];

  var TRACKING_STORAGE_EVENTS_KEY = 'cn_tracking_events_v1';
  var TRACKING_MAX_PREVIEW = 8;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function safe(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(v) { return safe(v).replace(/^\s+|\s+$/g, ''); }
  function lower(v) { return safe(v).toLowerCase(); }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function safeGetLocalStorage(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null || raw === undefined ? fallback : raw;
    } catch (err) {
      return fallback;
    }
  }

  function toast(msg) {
    var el = qs('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2300);
  }

  function escapeHtml(s) {
    return safe(s)
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
    if (/^(mercadolivre|mercadolibre)\./i.test(u) || /^meli\./i.test(u) || u.indexOf('meli.la/') === 0 || u.indexOf('meli.co/') === 0) {
      return 'https://' + u;
    }
    return u;
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

  function parseProductsPayload(raw) {
    if (Array.isArray(raw)) {
      return { rootType: 'array', rootKey: null, root: raw.slice(), products: raw.slice() };
    }
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.products)) {
        return { rootType: 'object', rootKey: 'products', root: clone(raw), products: raw.products.slice() };
      }
      if (Array.isArray(raw.items)) {
        return { rootType: 'object', rootKey: 'items', root: clone(raw), products: raw.items.slice() };
      }
    }
    throw new Error('Formato de produtos.json não reconhecido');
  }

  function parseRemovedPayload(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.events)) return raw.events;
    if (Array.isArray(raw.removed)) return raw.removed;
    if (Array.isArray(raw.rows)) return raw.rows;
    return [];
  }

  function getSku(p) {
    return trim(p && (p.sku || p.SKU || ''));
  }

  function getTitle(p) {
    return trim(p && (p.title || p.name || p.sku || ''));
  }

  function getTags(p) {
    var tags = p && (p.tags || p.badges || []);
    if (Array.isArray(tags)) {
      return tags.map(function (v) { return trim(v); }).filter(Boolean);
    }
    if (typeof tags === 'string') {
      return tags.split(',').map(function (v) { return trim(v); }).filter(Boolean);
    }
    return [];
  }

  function setTags(p, tags) {
    p.badges = tags.slice();
    p.tags = tags.slice();
  }

  function getMlId(p) {
    return trim(p && (p.id_busca || p.ml_id || p.id_ml || p.mercadolivre_id || p.mercado_livre_id || ''));
  }

  function getImage(p) {
    return trim(p && (p.image_url || p.image || p.img || ''));
  }

  function setImage(p, value) {
    p.image_url = trim(value);
    p.image = trim(value);
  }

  function getImages(p) {
    var raw = p && (p.images || p.gallery_images || p.extra_images || []);
    if (Array.isArray(raw)) return raw.map(function (v) { return trim(v); }).filter(Boolean);
    if (typeof raw === 'string') return raw.split(/[\n,;|]+/).map(function (v) { return trim(v); }).filter(Boolean);
    return [];
  }

  function setImages(p, value) {
    var list = trim(value).split(/[\n,;|]+/).map(function (v) { return trim(v); }).filter(Boolean);
    if (list.length) p.images = list;
    else delete p.images;
  }

  function setTextField(p, key, value) {
    var v = trim(value);
    if (v) p[key] = v;
    else delete p[key];
  }

  function isActive(p) {
    if (!p) return false;
    if (p.active === false || p.is_active === false || p.disabled === true) return false;
    return true;
  }

  function setActive(p, value) {
    p.active = !!value;
    p.is_active = !!value;
    if (value) delete p.disabled;
  }

  function isFeatured(p) {
    return !!(p && (p.featured === true || p.is_featured === true));
  }

  function setFeatured(p, value) {
    p.featured = !!value;
    p.is_featured = !!value;
  }

  function getStatusKey(reportItem) {
    return trim(reportItem && (reportItem.sku || reportItem.product_sku || reportItem.product || reportItem.title || ''));
  }

  var state = {
    rootType: 'array',
    rootKey: null,
    root: [],
    products: [],
    originalProducts: [],
    removedRows: [],
    selectedIndex: -1,
    filter: 'all',
    search: '',
    dirty: false
  };

  var refs = {};

  function cacheRefs() {
    refs.metricTotal = qs('#metricTotal');
    refs.metricActive = qs('#metricActive');
    refs.metricFeatured = qs('#metricFeatured');
    refs.metricSuspect = qs('#metricSuspect');
    refs.productList = qs('#productList');
    refs.searchInput = qs('#searchInput');
    refs.filterMode = qs('#filterMode');
    refs.editorTitle = qs('#editorTitle');
    refs.editorSubtitle = qs('#editorSubtitle');
    refs.saveProduct = qs('#saveProduct');
    refs.resetProduct = qs('#resetProduct');
    refs.previewImage = qs('#previewImage');
    refs.guardianBox = qs('#guardianBox');
    refs.summarySku = qs('#summarySku');
    refs.summaryMlId = qs('#summaryMlId');
    refs.summaryLastChecked = qs('#summaryLastChecked');
    refs.summaryLastOk = qs('#summaryLastOk');

    refs.fieldSku = qs('#fieldSku');
    refs.fieldTitle = qs('#fieldTitle');
    refs.fieldTags = qs('#fieldTags');
    refs.fieldMlId = qs('#fieldMlId');
    refs.fieldImage = qs('#fieldImage');
    refs.fieldImages = qs('#fieldImages');
    refs.fieldPriceText = qs('#fieldPriceText');
    refs.fieldOldPriceText = qs('#fieldOldPriceText');
    refs.fieldDiscountText = qs('#fieldDiscountText');
    refs.fieldPriceCheckedAt = qs('#fieldPriceCheckedAt');
    refs.fieldPromoText = qs('#fieldPromoText');
    refs.fieldBuyCta = qs('#fieldBuyCta');
    refs.fieldOpenUrl = qs('#fieldOpenUrl');
    refs.fieldCanonicalUrl = qs('#fieldCanonicalUrl');
    refs.fieldCheckUrl = qs('#fieldCheckUrl');
    refs.fieldShortUrl = qs('#fieldShortUrl');
    refs.fieldResolvedUrl = qs('#fieldResolvedUrl');
    refs.fieldNotes = qs('#fieldNotes');
    refs.fieldExtraJson = qs('#fieldExtraJson');
    refs.fieldActive = qs('#fieldActive');
    refs.fieldFeatured = qs('#fieldFeatured');

    refs.openOpenUrl = qs('#openOpenUrl');
    refs.openCanonicalUrl = qs('#openCanonicalUrl');
    refs.openCheckUrl = qs('#openCheckUrl');
  }

  function normalizeRemovedRows(rows) {
    return rows.map(function (item) {
      return {
        raw: item,
        sku: trim(item.sku || item.product_sku || ''),
        title: trim(item.title || item.product || item.name || ''),
        reason: trim(item.reason || item.status_reason || item.guardian_reason || ''),
        status: trim(item.status || item.http_status || ''),
        url_current: trim(item.url_current || item.url || item.open_url || item.check_url || item.canonical_url || ''),
        final_url: trim(item.final_url || item.resolved_url || ''),
        at: trim(item.at || item.ts || item.when || item.updated_at || item.created_at || '')
      };
    });
  }

  function findRemovedMatches(product) {
    var sku = getSku(product);
    var title = lower(getTitle(product));
    return state.removedRows.filter(function (row) {
      if (sku && row.sku && sku === row.sku) return true;
      if (title && row.title && title === lower(row.title)) return true;
      return false;
    });
  }

  function isSuspect(product) {
    return findRemovedMatches(product).length > 0;
  }

  function buildExportRoot() {
    if (state.rootType === 'array') {
      return state.products;
    }
    var root = clone(state.root);
    if (state.rootKey) root[state.rootKey] = state.products;
    root.admin_updated_at = new Date().toISOString();
    return root;
  }

  function updateMetrics() {
    refs.metricTotal.textContent = String(state.products.length);
    refs.metricActive.textContent = String(state.products.filter(isActive).length);
    refs.metricFeatured.textContent = String(state.products.filter(isFeatured).length);
    refs.metricSuspect.textContent = String(state.products.filter(isSuspect).length);
  }

  function setDirty(flag) {
    state.dirty = !!flag;
    if (refs.saveProduct) refs.saveProduct.disabled = !flag || state.selectedIndex < 0;
    if (refs.resetProduct) refs.resetProduct.disabled = state.selectedIndex < 0;
  }

  function getFilteredProducts() {
    var filter = state.filter;
    var q = lower(state.search);

    return state.products
      .map(function (p, index) { return { product: p, index: index }; })
      .filter(function (row) {
        var p = row.product;
        if (filter === 'active' && !isActive(p)) return false;
        if (filter === 'inactive' && isActive(p)) return false;
        if (filter === 'featured' && !isFeatured(p)) return false;
        if (filter === 'suspect' && !isSuspect(p)) return false;

        if (!q) return true;

        var blob = lower([
          getSku(p),
          getTitle(p),
          getMlId(p),
          getTags(p).join(' '),
          safe(p.open_url),
          safe(p.canonical_url)
        ].join(' '));

        return blob.indexOf(q) >= 0;
      });
  }

  function renderList() {
    var rows = getFilteredProducts();
    refs.productList.innerHTML = '';

    if (!rows.length) {
      refs.productList.innerHTML = '<div class="empty">Nenhum produto encontrado para o filtro atual.</div>';
      return;
    }

    rows.forEach(function (row) {
      var p = row.product;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'product-item' + (row.index === state.selectedIndex ? ' active' : '');
      item.dataset.index = String(row.index);

      var pills = [];
      if (isActive(p)) pills.push('<span class="pill ok">Ativo</span>');
      else pills.push('<span class="pill danger">Inativo</span>');
      if (isFeatured(p)) pills.push('<span class="pill gold">Featured</span>');
      if (isSuspect(p)) pills.push('<span class="pill warn">Suspeito</span>');

      item.innerHTML =
        '<h4>' + escapeHtml(getTitle(p) || '(sem título)') + '</h4>' +
        '<p>SKU: ' + escapeHtml(getSku(p) || '—') + ' • ID ML: ' + escapeHtml(getMlId(p) || '—') + '</p>' +
        '<div class="pill-row">' + pills.join('') + '</div>';

      item.addEventListener('click', function () {
        if (state.dirty && state.selectedIndex !== row.index) {
          var ok = window.confirm('Você tem alterações não salvas. Deseja trocar de produto mesmo assim?');
          if (!ok) return;
        }
        selectProduct(row.index);
      });

      refs.productList.appendChild(item);
    });
  }

  function getExtrasObject(product) {
    var extra = {};
    Object.keys(product || {}).forEach(function (key) {
      if (KNOWN_KEYS.indexOf(key) === -1) extra[key] = product[key];
    });
    return extra;
  }

  function fillLinkButton(el, url) {
    var href = ensureHttp(url);
    el.href = href || '#';
    el.style.pointerEvents = href ? 'auto' : 'none';
    el.style.opacity = href ? '1' : '.45';
  }

  function renderGuardianBox(product) {
    var matches = findRemovedMatches(product);
    refs.guardianBox.innerHTML = '';

    if (!matches.length) {
      refs.guardianBox.innerHTML = '<div class="empty">Nenhum evento de Guardian encontrado para este produto.</div>';
      return;
    }

    matches.forEach(function (row) {
      var div = document.createElement('div');
      div.className = 'guardian-item';
      div.innerHTML =
        '<strong>' + escapeHtml(row.reason || 'Suspeita do Guardian') + '</strong>' +
        '<div class="small muted">Status: ' + escapeHtml(row.status || '—') + '</div>' +
        '<div class="small muted">URL atual: ' + escapeHtml(row.url_current || '—') + '</div>' +
        '<div class="small muted">Final: ' + escapeHtml(row.final_url || '—') + '</div>' +
        '<div class="small muted">Quando: ' + escapeHtml(row.at || '—') + '</div>';
      refs.guardianBox.appendChild(div);
    });
  }

  function renderSelection() {
    if (state.selectedIndex < 0 || !state.products[state.selectedIndex]) {
      refs.editorTitle.textContent = 'Selecione um produto';
      refs.editorSubtitle.textContent = 'Sem alterações automáticas no repositório.';
      refs.previewImage.removeAttribute('src');
      refs.previewImage.alt = 'Sem preview';
      refs.summarySku.textContent = '—';
      refs.summaryMlId.textContent = '—';
      refs.summaryLastChecked.textContent = '—';
      refs.summaryLastOk.textContent = '—';
      refs.guardianBox.innerHTML = '<div class="empty">Sem produto selecionado.</div>';
      qsa('input, textarea', qs('.editor')).forEach(function (el) {
        if (el.type === 'checkbox') el.checked = false;
        else el.value = '';
      });
      setDirty(false);
      return;
    }

    var p = state.products[state.selectedIndex];
    refs.editorTitle.textContent = getTitle(p) || '(sem título)';
    refs.editorSubtitle.textContent = 'SKU: ' + (getSku(p) || '—') + ' • ID ML: ' + (getMlId(p) || '—');

    refs.fieldSku.value = getSku(p);
    refs.fieldTitle.value = getTitle(p);
    refs.fieldTags.value = getTags(p).join(', ');
    refs.fieldMlId.value = getMlId(p);
    refs.fieldImage.value = getImage(p);
    refs.fieldImages.value = getImages(p).join('\n');
    refs.fieldPriceText.value = safe(p.price_text);
    refs.fieldOldPriceText.value = safe(p.old_price_text);
    refs.fieldDiscountText.value = safe(p.discount_text);
    refs.fieldPriceCheckedAt.value = safe(p.price_checked_at);
    refs.fieldPromoText.value = safe(p.promo_text);
    refs.fieldBuyCta.value = safe(p.buy_cta);
    refs.fieldOpenUrl.value = safe(p.open_url);
    refs.fieldCanonicalUrl.value = safe(p.canonical_url);
    refs.fieldCheckUrl.value = safe(p.check_url);
    refs.fieldShortUrl.value = safe(p.short_url);
    refs.fieldResolvedUrl.value = safe(p.resolved_url);
    refs.fieldNotes.value = safe(p.admin_notes);
    refs.fieldExtraJson.value = JSON.stringify(getExtrasObject(p), null, 2);
    refs.fieldActive.checked = isActive(p);
    refs.fieldFeatured.checked = isFeatured(p);

    var image = ensureHttp(getImage(p));
    if (image) {
      refs.previewImage.src = image;
      refs.previewImage.alt = getTitle(p) || 'Preview do produto';
    } else {
      refs.previewImage.removeAttribute('src');
      refs.previewImage.alt = 'Sem preview';
    }

    refs.summarySku.textContent = getSku(p) || '—';
    refs.summaryMlId.textContent = getMlId(p) || '—';
    refs.summaryLastChecked.textContent = trim(p.last_checked || '') || '—';
    refs.summaryLastOk.textContent = trim(p.last_ok || '') || '—';

    fillLinkButton(refs.openOpenUrl, p.open_url);
    fillLinkButton(refs.openCanonicalUrl, p.canonical_url);
    fillLinkButton(refs.openCheckUrl, p.check_url);

    renderGuardianBox(p);
    setDirty(false);
  }

  function selectProduct(index) {
    state.selectedIndex = index;
    renderList();
    renderSelection();
  }

  function collectFormData() {
    var extra = {};
    var rawExtra = trim(refs.fieldExtraJson.value);
    if (rawExtra) {
      extra = JSON.parse(rawExtra);
      if (Array.isArray(extra) || typeof extra !== 'object') {
        throw new Error('Campos extras devem ser um objeto JSON');
      }
    }

    return {
      sku: trim(refs.fieldSku.value),
      title: trim(refs.fieldTitle.value),
      tags: trim(refs.fieldTags.value).split(',').map(function (v) { return trim(v); }).filter(Boolean),
      id_busca: trim(refs.fieldMlId.value),
      image_url: trim(refs.fieldImage.value),
      images: trim(refs.fieldImages.value),
      price_text: trim(refs.fieldPriceText.value),
      old_price_text: trim(refs.fieldOldPriceText.value),
      discount_text: trim(refs.fieldDiscountText.value),
      price_checked_at: trim(refs.fieldPriceCheckedAt.value),
      promo_text: trim(refs.fieldPromoText.value),
      buy_cta: trim(refs.fieldBuyCta.value),
      open_url: trim(refs.fieldOpenUrl.value),
      canonical_url: trim(refs.fieldCanonicalUrl.value),
      check_url: trim(refs.fieldCheckUrl.value),
      short_url: trim(refs.fieldShortUrl.value),
      resolved_url: trim(refs.fieldResolvedUrl.value),
      admin_notes: trim(refs.fieldNotes.value),
      active: refs.fieldActive.checked,
      featured: refs.fieldFeatured.checked,
      extra: extra
    };
  }

  function saveSelectedProduct() {
    if (state.selectedIndex < 0) return;

    var current = state.products[state.selectedIndex];
    var draft = clone(current);
    var form;

    try {
      form = collectFormData();
    } catch (err) {
      toast(err.message || 'JSON extra inválido');
      return;
    }

    draft.sku = form.sku;
    draft.title = form.title;
    draft.name = form.title;
    setTags(draft, form.tags);

    draft.id_busca = form.id_busca;
    draft.ml_id = form.id_busca;
    draft.id_ml = form.id_busca;
    draft.mercadolivre_id = form.id_busca;
    draft.mercado_livre_id = form.id_busca;

    setImage(draft, form.image_url);
    setImages(draft, form.images);
    setTextField(draft, 'price_text', form.price_text);
    setTextField(draft, 'old_price_text', form.old_price_text);
    setTextField(draft, 'discount_text', form.discount_text);
    setTextField(draft, 'price_checked_at', form.price_checked_at);
    setTextField(draft, 'promo_text', form.promo_text);
    setTextField(draft, 'buy_cta', form.buy_cta);
    draft.open_url = form.open_url;
    draft.canonical_url = form.canonical_url;
    draft.check_url = form.check_url;
    draft.short_url = form.short_url;
    draft.resolved_url = form.resolved_url;
    draft.admin_notes = form.admin_notes;

    setActive(draft, form.active);
    setFeatured(draft, form.featured);

    Object.keys(getExtrasObject(draft)).forEach(function (key) {
      delete draft[key];
    });
    Object.keys(form.extra).forEach(function (key) {
      draft[key] = form.extra[key];
    });

    state.products[state.selectedIndex] = draft;
    renderList();
    renderSelection();
    updateMetrics();
    toast('Produto salvo em memória ✅');
  }

  function normalizeSuspectRows() {
    return state.products
      .filter(isSuspect)
      .map(function (p) {
        var matches = findRemovedMatches(p);
        var first = matches[0] || {};
        return {
          sku: getSku(p),
          title: getTitle(p),
          id_busca: getMlId(p),
          active: isActive(p) ? '1' : '0',
          featured: isFeatured(p) ? '1' : '0',
          reason: first.reason || '',
          status: first.status || '',
          url_current: first.url_current || '',
          final_url: first.final_url || '',
          open_url: safe(p.open_url),
          canonical_url: safe(p.canonical_url),
          check_url: safe(p.check_url),
          short_url: safe(p.short_url),
          resolved_url: safe(p.resolved_url),
          last_checked: safe(p.last_checked),
          last_ok: safe(p.last_ok),
          admin_notes: safe(p.admin_notes)
        };
      });
  }

  function suspectsToCsv(rows) {
    var headers = [
      'sku','title','id_busca','active','featured','reason','status','url_current','final_url',
      'open_url','canonical_url','check_url','short_url','resolved_url','last_checked','last_ok','admin_notes'
    ];
    function esc(v) {
      var s = safe(v).replace(/"/g, '""');
      return '"' + s + '"';
    }
    var lines = [headers.join(',')];
    rows.forEach(function (row) {
      lines.push(headers.map(function (h) { return esc(row[h]); }).join(','));
    });
    return lines.join('\n');
  }

  function suspectsToTxt(rows) {
    if (!rows.length) return 'Nenhum item suspeito encontrado.\n';
    return rows.map(function (row, idx) {
      return [
        'Item ' + (idx + 1),
        'SKU: ' + safe(row.sku),
        'Título: ' + safe(row.title),
        'ID ML: ' + safe(row.id_busca),
        'Ativo: ' + safe(row.active),
        'Featured: ' + safe(row.featured),
        'Motivo: ' + safe(row.reason),
        'Status: ' + safe(row.status),
        'URL atual: ' + safe(row.url_current),
        'Final: ' + safe(row.final_url),
        'open_url: ' + safe(row.open_url),
        'canonical_url: ' + safe(row.canonical_url),
        'check_url: ' + safe(row.check_url),
        'short_url: ' + safe(row.short_url),
        'resolved_url: ' + safe(row.resolved_url),
        'last_checked: ' + safe(row.last_checked),
        'last_ok: ' + safe(row.last_ok),
        'Notas: ' + safe(row.admin_notes),
        '----------------------------------------'
      ].join('\n');
    }).join('\n');
  }


  function getTrackingEvents() {
    var raw = safeGetLocalStorage(TRACKING_STORAGE_EVENTS_KEY, '[]');
    var parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      parsed = [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed.map(function (item) {
      return {
        id: trim(item && item.id),
        event_name: trim(item && item.event_name),
        timestamp: trim(item && item.timestamp),
        page_type: trim(item && item.page_type),
        session_id: trim(item && item.session_id),
        visitor_id: trim(item && item.visitor_id),
        url: trim(item && item.url),
        path: trim(item && item.path),
        referrer: trim(item && item.referrer),
        device_type: trim(item && item.device_type),
        utm_source: trim(item && item.utm_source),
        utm_medium: trim(item && item.utm_medium),
        utm_campaign: trim(item && item.utm_campaign),
        utm_content: trim(item && item.utm_content),
        utm_term: trim(item && item.utm_term),
        network: trim(item && item.network),
        format: trim(item && item.format),
        placement: trim(item && item.placement),
        creative_id: trim(item && item.creative_id),
        title_id: trim(item && item.title_id),
        sku: trim(item && item.sku),
        product_title: trim(item && item.product_title),
        id_busca: trim(item && item.id_busca),
        badges: Array.isArray(item && item.badges) ? item.badges.slice() : [],
        featured: !!(item && item.featured),
        category: trim(item && item.category),
        position_on_page: (item && item.position_on_page !== undefined && item.position_on_page !== null) ? item.position_on_page : '',
        extra: item && typeof item.extra === 'object' && !Array.isArray(item.extra) ? clone(item.extra) : {}
      };
    });
  }

  function createStatsBucket(key, label) {
    return {
      key: trim(key),
      label: trim(label || key),
      total_events: 0,
      page_views: 0,
      card_views: 0,
      featured_views: 0,
      quick_views: 0,
      buy_clicks: 0,
      copy_link_clicks: 0,
      copy_id_clicks: 0,
      open_store_clicks: 0,
      copy_store_link_clicks: 0,
      searches: 0,
      filters: 0,
      sort_changes: 0,
      load_more_clicks: 0,
      sessions: {},
      visitors: {},
      intention_score: 0
    };
  }

  function applyEventToBucket(bucket, event) {
    if (!bucket || !event) return;

    bucket.total_events += 1;
    if (event.session_id) bucket.sessions[event.session_id] = true;
    if (event.visitor_id) bucket.visitors[event.visitor_id] = true;

    switch (event.event_name) {
      case 'page_view':
        bucket.page_views += 1;
        bucket.intention_score += 1;
        break;
      case 'view_product_card':
        bucket.card_views += 1;
        bucket.intention_score += 2;
        break;
      case 'view_featured':
        bucket.featured_views += 1;
        bucket.intention_score += 3;
        break;
      case 'view_quick_product':
        bucket.quick_views += 1;
        bucket.intention_score += 3;
        break;
      case 'click_buy':
        bucket.buy_clicks += 1;
        bucket.intention_score += 8;
        break;
      case 'click_copy_link':
        bucket.copy_link_clicks += 1;
        bucket.intention_score += 5;
        break;
      case 'click_copy_id':
        bucket.copy_id_clicks += 1;
        bucket.intention_score += 4;
        break;
      case 'click_open_store':
        bucket.open_store_clicks += 1;
        bucket.intention_score += 3;
        break;
      case 'click_copy_store_link':
        bucket.copy_store_link_clicks += 1;
        bucket.intention_score += 3;
        break;
      case 'search':
        bucket.searches += 1;
        bucket.intention_score += 2;
        break;
      case 'filter_tag':
        bucket.filters += 1;
        bucket.intention_score += 2;
        break;
      case 'sort_change':
        bucket.sort_changes += 1;
        bucket.intention_score += 1;
        break;
      case 'click_load_more':
        bucket.load_more_clicks += 1;
        bucket.intention_score += 1;
        break;
      default:
        bucket.intention_score += 0;
        break;
    }
  }

  function finalizeBucket(bucket) {
    var sessions = Object.keys(bucket.sessions || {}).length;
    var visitors = Object.keys(bucket.visitors || {}).length;
    var denominator = bucket.card_views || 0;
    var buyRate = denominator ? (bucket.buy_clicks / denominator) : 0;
    var interactionBase = denominator + bucket.featured_views + bucket.quick_views;
    var interestRate = interactionBase ? ((bucket.buy_clicks + bucket.copy_link_clicks + bucket.copy_id_clicks) / interactionBase) : 0;

    delete bucket.sessions;
    delete bucket.visitors;

    bucket.unique_sessions = sessions;
    bucket.unique_visitors = visitors;
    bucket.buy_rate = buyRate;
    bucket.interest_rate = interestRate;

    return bucket;
  }

  function sortBucketsDesc(items) {
    return items.sort(function (a, b) {
      if (b.intention_score !== a.intention_score) return b.intention_score - a.intention_score;
      if (b.buy_clicks !== a.buy_clicks) return b.buy_clicks - a.buy_clicks;
      if (b.card_views !== a.card_views) return b.card_views - a.card_views;
      return a.key.localeCompare(b.key, 'pt-BR');
    });
  }

  function buildTrackingSummary(events) {
    var summary = {
      generated_at: new Date().toISOString(),
      storage_key: TRACKING_STORAGE_EVENTS_KEY,
      total_events: 0,
      unique_sessions: 0,
      unique_visitors: 0,
      page_views: 0,
      card_views: 0,
      featured_views: 0,
      quick_views: 0,
      buy_clicks: 0,
      copy_link_clicks: 0,
      copy_id_clicks: 0,
      open_store_clicks: 0,
      copy_store_link_clicks: 0,
      searches: 0,
      filters: 0,
      sort_changes: 0,
      load_more_clicks: 0,
      intention_score: 0,
      buy_rate: 0,
      interest_rate: 0,
      by_network: [],
      by_format: [],
      by_placement: [],
      by_creative: [],
      by_title: [],
      by_product: [],
      by_category: [],
      latest_events_preview: []
    };

    var globalBucket = createStatsBucket('global', 'global');
    var maps = {
      by_network: {},
      by_format: {},
      by_placement: {},
      by_creative: {},
      by_title: {},
      by_product: {},
      by_category: {}
    };

    function ensureDimensionBucket(map, value, fallbackLabel) {
      var key = trim(value) || '(vazio)';
      if (!map[key]) map[key] = createStatsBucket(key, fallbackLabel || key);
      return map[key];
    }

    events.forEach(function (event) {
      applyEventToBucket(globalBucket, event);

      applyEventToBucket(
        ensureDimensionBucket(maps.by_network, event.network || event.utm_source || '(direto)', event.network || event.utm_source || '(direto)'),
        event
      );
      applyEventToBucket(
        ensureDimensionBucket(maps.by_format, event.format || event.utm_medium || '(vazio)', event.format || event.utm_medium || '(vazio)'),
        event
      );
      applyEventToBucket(
        ensureDimensionBucket(maps.by_placement, event.placement || '(vazio)', event.placement || '(vazio)'),
        event
      );
      applyEventToBucket(
        ensureDimensionBucket(maps.by_creative, event.creative_id || '(vazio)', event.creative_id || '(vazio)'),
        event
      );
      applyEventToBucket(
        ensureDimensionBucket(maps.by_title, event.title_id || '(vazio)', event.title_id || '(vazio)'),
        event
      );

      var productKey = trim(event.sku || event.id_busca || event.product_title || '(sem produto)');
      var productLabel = trim([
        event.sku || '',
        event.product_title || '',
        event.id_busca ? ('ID:' + event.id_busca) : ''
      ].filter(Boolean).join(' • ')) || productKey;
      applyEventToBucket(ensureDimensionBucket(maps.by_product, productKey, productLabel), event);

      applyEventToBucket(
        ensureDimensionBucket(maps.by_category, event.category || '(sem categoria)', event.category || '(sem categoria)'),
        event
      );
    });

    globalBucket = finalizeBucket(globalBucket);
    summary.total_events = globalBucket.total_events;
    summary.unique_sessions = globalBucket.unique_sessions;
    summary.unique_visitors = globalBucket.unique_visitors;
    summary.page_views = globalBucket.page_views;
    summary.card_views = globalBucket.card_views;
    summary.featured_views = globalBucket.featured_views;
    summary.quick_views = globalBucket.quick_views;
    summary.buy_clicks = globalBucket.buy_clicks;
    summary.copy_link_clicks = globalBucket.copy_link_clicks;
    summary.copy_id_clicks = globalBucket.copy_id_clicks;
    summary.open_store_clicks = globalBucket.open_store_clicks;
    summary.copy_store_link_clicks = globalBucket.copy_store_link_clicks;
    summary.searches = globalBucket.searches;
    summary.filters = globalBucket.filters;
    summary.sort_changes = globalBucket.sort_changes;
    summary.load_more_clicks = globalBucket.load_more_clicks;
    summary.intention_score = globalBucket.intention_score;
    summary.buy_rate = globalBucket.buy_rate;
    summary.interest_rate = globalBucket.interest_rate;

    Object.keys(maps).forEach(function (groupKey) {
      summary[groupKey] = sortBucketsDesc(
        Object.keys(maps[groupKey]).map(function (key) {
          return finalizeBucket(maps[groupKey][key]);
        })
      );
    });

    summary.latest_events_preview = events
      .slice(-TRACKING_MAX_PREVIEW)
      .reverse()
      .map(function (event) {
        return {
          timestamp: event.timestamp,
          event_name: event.event_name,
          network: event.network || event.utm_source || '',
          format: event.format || event.utm_medium || '',
          creative_id: event.creative_id || '',
          title_id: event.title_id || '',
          sku: event.sku || '',
          product_title: event.product_title || '',
          id_busca: event.id_busca || '',
          category: event.category || ''
        };
      });

    return summary;
  }

  function formatPercent(value) {
    if (!isFinite(Number(value))) return '0,00%';
    return (Number(value) * 100).toFixed(2).replace('.', ',') + '%';
  }

  function flattenTrackingSummary(summary) {
    var rows = [];

    function pushRows(groupName, items) {
      (items || []).forEach(function (item) {
        rows.push({
          dimension: groupName,
          key: item.key,
          label: item.label,
          total_events: item.total_events,
          unique_sessions: item.unique_sessions,
          unique_visitors: item.unique_visitors,
          page_views: item.page_views,
          card_views: item.card_views,
          featured_views: item.featured_views,
          quick_views: item.quick_views,
          buy_clicks: item.buy_clicks,
          copy_link_clicks: item.copy_link_clicks,
          copy_id_clicks: item.copy_id_clicks,
          open_store_clicks: item.open_store_clicks,
          copy_store_link_clicks: item.copy_store_link_clicks,
          searches: item.searches,
          filters: item.filters,
          sort_changes: item.sort_changes,
          load_more_clicks: item.load_more_clicks,
          intention_score: item.intention_score,
          buy_rate_pct: formatPercent(item.buy_rate),
          interest_rate_pct: formatPercent(item.interest_rate)
        });
      });
    }

    pushRows('network', summary.by_network);
    pushRows('format', summary.by_format);
    pushRows('placement', summary.by_placement);
    pushRows('creative', summary.by_creative);
    pushRows('title', summary.by_title);
    pushRows('product', summary.by_product);
    pushRows('category', summary.by_category);

    return rows;
  }

  function trackingRowsToCsv(rows) {
    var headers = [
      'dimension','key','label','total_events','unique_sessions','unique_visitors','page_views',
      'card_views','featured_views','quick_views','buy_clicks','copy_link_clicks','copy_id_clicks',
      'open_store_clicks','copy_store_link_clicks','searches','filters','sort_changes','load_more_clicks',
      'intention_score','buy_rate_pct','interest_rate_pct'
    ];

    function esc(v) {
      var s = safe(v).replace(/"/g, '""');
      return '"' + s + '"';
    }

    var lines = [headers.join(',')];
    rows.forEach(function (row) {
      lines.push(headers.map(function (header) { return esc(row[header]); }).join(','));
    });
    return lines.join('\n');
  }

  function summarizeTopList(items, label) {
    var list = (items || []).slice(0, 5);
    if (!list.length) return label + ': sem dados';
    return label + ': ' + list.map(function (item, idx) {
      return (idx + 1) + '. ' + safe(item.label || item.key) +
        ' [intenção=' + safe(item.intention_score) +
        ', buy=' + safe(item.buy_clicks) +
        ', views=' + safe(item.card_views) + ']';
    }).join(' | ');
  }

  function trackingSummaryToTxt(summary) {
    var lines = [
      'RELATÓRIO LOCAL-FIRST — TRACKING LA_FAMIGLIA_LINKS',
      'Gerado em: ' + safe(summary.generated_at),
      'Storage key: ' + safe(summary.storage_key),
      '',
      'VISÃO GERAL',
      'Total de eventos: ' + safe(summary.total_events),
      'Sessões únicas: ' + safe(summary.unique_sessions),
      'Visitantes únicos: ' + safe(summary.unique_visitors),
      'Page views: ' + safe(summary.page_views),
      'Views de card: ' + safe(summary.card_views),
      'Views featured: ' + safe(summary.featured_views),
      'Views quick: ' + safe(summary.quick_views),
      'Cliques Comprar: ' + safe(summary.buy_clicks),
      'Cliques Copiar Link: ' + safe(summary.copy_link_clicks),
      'Cliques Copiar ID: ' + safe(summary.copy_id_clicks),
      'Abrir loja: ' + safe(summary.open_store_clicks),
      'Copiar link da loja: ' + safe(summary.copy_store_link_clicks),
      'Buscas: ' + safe(summary.searches),
      'Filtros: ' + safe(summary.filters),
      'Ordenações: ' + safe(summary.sort_changes),
      'Load more: ' + safe(summary.load_more_clicks),
      'Índice de intenção: ' + safe(summary.intention_score),
      'Taxa buy/card: ' + formatPercent(summary.buy_rate),
      'Taxa interesse/interações: ' + formatPercent(summary.interest_rate),
      '',
      summarizeTopList(summary.by_network, 'TOP REDES'),
      summarizeTopList(summary.by_creative, 'TOP CRIATIVOS'),
      summarizeTopList(summary.by_title, 'TOP TÍTULOS'),
      summarizeTopList(summary.by_product, 'TOP PRODUTOS'),
      summarizeTopList(summary.by_category, 'TOP CATEGORIAS'),
      '',
      'ÚLTIMOS EVENTOS'
    ];

    (summary.latest_events_preview || []).forEach(function (event, idx) {
      lines.push(
        (idx + 1) + '. ' +
        safe(event.timestamp) + ' | ' +
        safe(event.event_name) + ' | ' +
        (safe(event.network) || 'sem rede') + ' | ' +
        (safe(event.sku) || safe(event.id_busca) || safe(event.product_title) || 'sem produto')
      );
    });

    if (!summary.latest_events_preview || !summary.latest_events_preview.length) {
      lines.push('Nenhum evento salvo no localStorage ainda.');
    }

    return lines.join('\n') + '\n';
  }

  function renderTrackingTools() {
    var box = qs('#trackingToolsBox');
    if (!box) return;

    var events = getTrackingEvents();
    var summary = buildTrackingSummary(events);

    var metrics = qs('#trackingMetrics', box);
    if (metrics) {
      metrics.innerHTML =
        '<span class="pill gold">Eventos: ' + escapeHtml(summary.total_events) + '</span>' +
        '<span class="pill ok">Buy: ' + escapeHtml(summary.buy_clicks) + '</span>' +
        '<span class="pill ok">Buy/Card: ' + escapeHtml(formatPercent(summary.buy_rate)) + '</span>' +
        '<span class="pill warn">Intenção: ' + escapeHtml(summary.intention_score) + '</span>';
    }

    var preview = qs('#trackingPreview', box);
    if (preview) {
      preview.innerHTML =
        '<div class="small muted">' + escapeHtml(summarizeTopList(summary.by_network, 'Top redes')) + '</div>' +
        '<div class="small muted">' + escapeHtml(summarizeTopList(summary.by_creative, 'Top criativos')) + '</div>' +
        '<div class="small muted">' + escapeHtml(summarizeTopList(summary.by_title, 'Top títulos')) + '</div>' +
        '<div class="small muted">' + escapeHtml(summarizeTopList(summary.by_product, 'Top produtos')) + '</div>';
    }
  }

  function exportTrackingEventsJson() {
    downloadText('tracking_eventos_local.json', JSON.stringify(getTrackingEvents(), null, 2), 'application/json;charset=utf-8');
  }

  function exportTrackingEventsCsv() {
    var events = getTrackingEvents();
    var headers = [
      'id','event_name','timestamp','page_type','session_id','visitor_id','url','path','referrer','device_type',
      'utm_source','utm_medium','utm_campaign','utm_content','utm_term','network','format','placement',
      'creative_id','title_id','sku','product_title','id_busca','badges','featured','category','position_on_page','extra_json'
    ];

    function esc(v) {
      var s = safe(v).replace(/"/g, '""');
      return '"' + s + '"';
    }

    var lines = [headers.join(',')];
    events.forEach(function (event) {
      lines.push(headers.map(function (header) {
        if (header === 'badges') return esc(Array.isArray(event.badges) ? event.badges.join(' | ') : '');
        if (header === 'featured') return esc(event.featured ? 'true' : 'false');
        if (header === 'extra_json') return esc(JSON.stringify(event.extra || {}));
        return esc(event[header]);
      }).join(','));
    });

    downloadText('tracking_eventos_local.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function exportTrackingSummaryJson() {
    var summary = buildTrackingSummary(getTrackingEvents());
    downloadText('tracking_resumo_local.json', JSON.stringify(summary, null, 2), 'application/json;charset=utf-8');
  }

  function exportTrackingSummaryCsv() {
    var summary = buildTrackingSummary(getTrackingEvents());
    var rows = flattenTrackingSummary(summary);
    downloadText('tracking_resumo_local.csv', trackingRowsToCsv(rows), 'text/csv;charset=utf-8');
  }

  function exportTrackingSummaryTxt() {
    var summary = buildTrackingSummary(getTrackingEvents());
    downloadText('tracking_resumo_local.txt', trackingSummaryToTxt(summary), 'text/plain;charset=utf-8');
  }

  function ensureTrackingToolsBox() {
    if (qs('#trackingToolsBox')) return;

    var anchor = qs('#downloadProducts');
    var parent = anchor && anchor.parentNode ? anchor.parentNode : null;
    var host = parent && parent.parentNode ? parent.parentNode : null;
    if (!host) host = qs('main') || qs('.container') || document.body;

    var box = document.createElement('section');
    box.id = 'trackingToolsBox';
    box.className = 'card';
    box.style.marginTop = '16px';
    box.style.padding = '16px';
    box.style.border = '1px solid rgba(212,175,55,.18)';
    box.style.borderRadius = '16px';
    box.style.background = 'rgba(255,255,255,.02)';
    box.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<h3 style="margin:0 0 6px 0;">Tracking local-first</h3>' +
          '<div class="small muted">Lê o localStorage da loja e exporta eventos + resumo acionável por rede / criativo / título / produto / categoria.</div>' +
        '</div>' +
        '<div id="trackingMetrics" class="pill-row"></div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">' +
        '<button type="button" id="trackingRefreshSummary">Atualizar resumo</button>' +
        '<button type="button" id="downloadTrackingJson">Eventos JSON</button>' +
        '<button type="button" id="downloadTrackingCsv">Eventos CSV</button>' +
        '<button type="button" id="downloadTrackingSummaryJson">Resumo JSON</button>' +
        '<button type="button" id="downloadTrackingSummaryCsv">Resumo CSV</button>' +
        '<button type="button" id="downloadTrackingSummaryTxt">Resumo TXT</button>' +
      '</div>' +
      '<div id="trackingPreview" style="display:grid;gap:6px;margin-top:12px;"></div>';

    if (host === document.body) {
      document.body.appendChild(box);
    } else if (parent && parent.nextSibling) {
      host.insertBefore(box, parent.nextSibling);
    } else {
      host.appendChild(box);
    }
  }

  function bindTrackingEvents() {
    var btnRefresh = qs('#trackingRefreshSummary');
    var btnJson = qs('#downloadTrackingJson');
    var btnCsv = qs('#downloadTrackingCsv');
    var btnSummaryJson = qs('#downloadTrackingSummaryJson');
    var btnSummaryCsv = qs('#downloadTrackingSummaryCsv');
    var btnSummaryTxt = qs('#downloadTrackingSummaryTxt');

    if (btnRefresh && !btnRefresh.dataset.bound) {
      btnRefresh.dataset.bound = '1';
      btnRefresh.addEventListener('click', function () {
        renderTrackingTools();
        toast('Resumo de tracking atualizado ✅');
      });
    }

    if (btnJson && !btnJson.dataset.bound) {
      btnJson.dataset.bound = '1';
      btnJson.addEventListener('click', function () {
        exportTrackingEventsJson();
        toast('Eventos do tracking exportados em JSON ✅');
      });
    }

    if (btnCsv && !btnCsv.dataset.bound) {
      btnCsv.dataset.bound = '1';
      btnCsv.addEventListener('click', function () {
        exportTrackingEventsCsv();
        toast('Eventos do tracking exportados em CSV ✅');
      });
    }

    if (btnSummaryJson && !btnSummaryJson.dataset.bound) {
      btnSummaryJson.dataset.bound = '1';
      btnSummaryJson.addEventListener('click', function () {
        exportTrackingSummaryJson();
        toast('Resumo do tracking exportado em JSON ✅');
      });
    }

    if (btnSummaryCsv && !btnSummaryCsv.dataset.bound) {
      btnSummaryCsv.dataset.bound = '1';
      btnSummaryCsv.addEventListener('click', function () {
        exportTrackingSummaryCsv();
        toast('Resumo do tracking exportado em CSV ✅');
      });
    }

    if (btnSummaryTxt && !btnSummaryTxt.dataset.bound) {
      btnSummaryTxt.dataset.bound = '1';
      btnSummaryTxt.addEventListener('click', function () {
        exportTrackingSummaryTxt();
        toast('Resumo do tracking exportado em TXT ✅');
      });
    }
  }

  function loadPayload(raw) {
    var parsed = parseProductsPayload(raw);
    state.rootType = parsed.rootType;
    state.rootKey = parsed.rootKey;
    state.root = clone(parsed.root);
    state.products = parsed.products.map(function (p) { return clone(p); });
    state.originalProducts = parsed.products.map(function (p) { return clone(p); });
    state.selectedIndex = state.products.length ? 0 : -1;
    state.search = '';
    state.filter = 'all';
    refs.searchInput.value = '';
    refs.filterMode.value = 'all';
    updateMetrics();
    renderList();
    renderSelection();
    renderTrackingTools();
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url);
      return r.json();
    });
  }

  function bindEvents() {
    ensureTrackingToolsBox();
    bindTrackingEvents();
    renderTrackingTools();

    refs.searchInput.addEventListener('input', function () {
      state.search = trim(refs.searchInput.value);
      renderList();
    });

    refs.filterMode.addEventListener('change', function () {
      state.filter = refs.filterMode.value;
      renderList();
    });

    qs('#clearSearch').addEventListener('click', function () {
      refs.searchInput.value = '';
      state.search = '';
      renderList();
    });

    qs('#reloadData').addEventListener('click', function () {
      initData();
    });

    qs('#newProduct').addEventListener('click', function () {
      if (state.dirty) {
        var ok = window.confirm('Há alterações não salvas. Deseja continuar e criar um novo produto local?');
        if (!ok) return;
      }

      var blank = {
        sku: 'novo-produto-' + Date.now(),
        title: 'Novo produto',
        name: 'Novo produto',
        badges: [],
        tags: [],
        id_busca: '',
        ml_id: '',
        id_ml: '',
        mercadolivre_id: '',
        mercado_livre_id: '',
        image_url: '',
        image: '',
        open_url: '',
        canonical_url: '',
        check_url: '',
        short_url: '',
        resolved_url: '',
        active: false,
        is_active: false,
        featured: false,
        is_featured: false,
        admin_notes: 'Criado localmente no painel.'
      };

      state.products.unshift(blank);
      updateMetrics();
      renderList();
      selectProduct(0);
      toast('Novo produto local criado. Edite e salve em memória.');
    });

    qs('#downloadProducts').addEventListener('click', function () {
      var payload = JSON.stringify(buildExportRoot(), null, 2);
      downloadText('produtos.json', payload, 'application/json;charset=utf-8');
    });

    qs('#downloadSelected').addEventListener('click', function () {
      if (state.selectedIndex < 0) {
        toast('Selecione um produto primeiro.');
        return;
      }
      var p = state.products[state.selectedIndex];
      var filename = (getSku(p) || 'produto') + '.json';
      downloadText(filename, JSON.stringify(p, null, 2), 'application/json;charset=utf-8');
    });

    qs('#downloadSuspectsJson').addEventListener('click', function () {
      downloadText('guardian_suspeitos.json', JSON.stringify(normalizeSuspectRows(), null, 2), 'application/json;charset=utf-8');
    });

    qs('#downloadSuspectsCsv').addEventListener('click', function () {
      downloadText('guardian_suspeitos.csv', suspectsToCsv(normalizeSuspectRows()), 'text/csv;charset=utf-8');
    });

    qs('#downloadSuspectsTxt').addEventListener('click', function () {
      downloadText('guardian_suspeitos.txt', suspectsToTxt(normalizeSuspectRows()), 'text/plain;charset=utf-8');
    });

    qs('#importProducts').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var raw = JSON.parse(e.target.result);
          loadPayload(raw);
          toast('Arquivo importado no painel ✅');
        } catch (err) {
          toast('Falha ao importar produtos.json');
        }
      };
      reader.readAsText(file, 'utf-8');
      ev.target.value = '';
    });

    qsa('#fieldSku, #fieldTitle, #fieldTags, #fieldMlId, #fieldImage, #fieldImages, #fieldPriceText, #fieldOldPriceText, #fieldDiscountText, #fieldPriceCheckedAt, #fieldPromoText, #fieldBuyCta, #fieldOpenUrl, #fieldCanonicalUrl, #fieldCheckUrl, #fieldShortUrl, #fieldResolvedUrl, #fieldNotes, #fieldExtraJson, #fieldActive, #fieldFeatured')
      .forEach(function (el) {
        el.addEventListener('input', function () { setDirty(true); });
        el.addEventListener('change', function () { setDirty(true); });
      });

    qs('#saveProduct').addEventListener('click', saveSelectedProduct);

    qs('#resetProduct').addEventListener('click', function () {
      renderSelection();
      toast('Campos recarregados.');
    });

    qs('#copyOpenUrl').addEventListener('click', function () {
      var v = trim(refs.fieldOpenUrl.value);
      if (!v) { toast('open_url vazio.'); return; }
      navigator.clipboard.writeText(v).then(function () {
        toast('open_url copiado ✅');
      }).catch(function () {
        toast('Falha ao copiar open_url');
      });
    });

    qs('#copyMlId').addEventListener('click', function () {
      var v = trim(refs.fieldMlId.value);
      if (!v) { toast('ID ML vazio.'); return; }
      navigator.clipboard.writeText(v).then(function () {
        toast('ID ML copiado ✅');
      }).catch(function () {
        toast('Falha ao copiar ID ML');
      });
    });

    qs('#markNeedsRelink').addEventListener('click', function () {
      var now = new Date().toISOString();
      var prefix = '[PRECISA_RELINK ' + now + '] ';
      if (refs.fieldNotes.value.indexOf(prefix) !== 0) {
        refs.fieldNotes.value = prefix + refs.fieldNotes.value;
        setDirty(true);
      }
      toast('Observação de relink adicionada.');
    });
  }

  function initData() {
    Promise.all([
      fetchJson('./produtos.json'),
      fetchJson('./data/link_guardian_removed.json').catch(function () { return []; })
    ]).then(function (results) {
      var productsRaw = results[0];
      var removedRaw = results[1];

      loadPayload(productsRaw);
      state.removedRows = normalizeRemovedRows(parseRemovedPayload(removedRaw));
      updateMetrics();
      renderList();
      renderSelection();
      renderTrackingTools();

      if (state.removedRows.length) {
        toast('Guardian carregado: ' + state.removedRows.length + ' evento(s) encontrado(s).');
      } else {
        toast('produtos.json carregado ✅');
      }
    }).catch(function () {
      toast('Falha ao carregar os arquivos do painel.');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheRefs();
    bindEvents();
    initData();
  });
})();
