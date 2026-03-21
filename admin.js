
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

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function safe(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(v) { return safe(v).replace(/^\s+|\s+$/g, ''); }
  function lower(v) { return safe(v).toLowerCase(); }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

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
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url);
      return r.json();
    });
  }

  function bindEvents() {
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

    qsa('#fieldSku, #fieldTitle, #fieldTags, #fieldMlId, #fieldImage, #fieldOpenUrl, #fieldCanonicalUrl, #fieldCheckUrl, #fieldShortUrl, #fieldResolvedUrl, #fieldNotes, #fieldExtraJson, #fieldActive, #fieldFeatured')
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
