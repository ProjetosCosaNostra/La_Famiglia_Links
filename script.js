/* script.js — Central Premium (Home)
   ✅ FIX MOBILE: reescrito para rodar em navegadores Android mais antigos.
   - Sem dateStyle/timeStyle (quebra em alguns celulares)
   - Sem replaceAll / toSorted / optional chaining
   - Copy com fallback (execCommand)

   ✅ FIX LINK/COMPRAR (2026-02-24):
   - getLink() agora aceita open_url/check_url/canonical_url/short_url/resolved_url
   - normaliza links sem https://
   - abrir em in-app browsers (IG/FB): window.open + fallback location.href

   ✅ PATCH TRACKING HOME (2026-03-20):
   - view_featured
   - view_quick_product
   - click_buy_home_featured
   - click_buy_home_quick
   - click_copy_id_home
   - click_copy_link_home
   - click_open_store

   ✅ FIX HOME BUY DESKTOP (2026-03-20):
   - no desktop, NÃO intercepta o link
   - deixa o <a target="_blank"> nativo abrir a nova guia
   - em in-app browser, intercepta e tenta abrir manualmente

   ✅ PATCH TRACKING HOME + ENTRY FLOW (2026-03-21):
   - page_view da home
   - busca da home com contagem de resultados
   - copy da home / vitrine com tracking
   - rastreio de links sociais / saída
   - preserva UTM/contexto ao abrir loja.html

   ✅ PATCH VITRINE RÁPIDA MANUAL (2026-03-21):
   - respeita quick_home / quick_home_order vindos do produtos.json
   - se houver seleção manual, a home usa essa ordem
   - se não houver seleção manual, mantém o fallback atual

   ✅ PATCH VITRINE RÁPIDA POSICIONAL (2026-04-03):
   - a grade rápida agora exibe até 12 produtos
   - quick_home_order (1..12) fixa o produto na posição desejada
   - ao substituir 1 posição, o restante da estrutura é preservado
*/
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function safeText(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(s) { return safeText(s).replace(/^\s+|\s+$/g, ''); }
  function lower(s) { return safeText(s).toLowerCase(); }

  var QUICK_HOME_LIMIT = 12;

  function getProductKey(p) {
    if (!p) return '';
    return safeText(p.sku || p.id_busca || p.id || p.title || p.name || '');
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
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    text = safeText(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function ensureHttpUrl(u) {
    var s = trim(u);
    if (!s) return '';

    if (/^https?:\/\//i.test(s)) return s;
    if (s.indexOf('//') === 0) return 'https:' + s;

    if (/^(mercadolivre|mercadolibre)\./i.test(s)) return 'https://' + s;
    if (/^meli\./i.test(s)) return 'https://' + s;
    if (s.indexOf('meli.la/') === 0) return 'https://' + s;
    if (s.indexOf('meli.co/') === 0) return 'https://' + s;

    return s;
  }

  function getAppBasePath() {
    var p = safeText(location.pathname || '/');
    if (!p) return '/';
    if (/\/index\.html$/i.test(p)) return p.replace(/index\.html$/i, '');
    if (/\/[^\/]+\.html$/i.test(p)) return p.replace(/[^\/]+\.html$/i, '');
    if (p.charAt(p.length - 1) !== '/') return p + '/';
    return p;
  }

  function buildAbsoluteUrl(pathname) {
    var clean = safeText(pathname || '');
    var origin = (location.protocol || 'https:') + '//' + (location.host || '');
    if (!clean) return origin + getAppBasePath();
    if (/^https?:\/\//i.test(clean)) return clean;
    if (clean.charAt(0) !== '/') clean = getAppBasePath() + clean;
    return origin + clean;
  }

  function getTrackingContextParams() {
    var keep = {
      utm_source: true,
      utm_medium: true,
      utm_campaign: true,
      utm_content: true,
      utm_term: true,
      network: true,
      format: true,
      placement: true,
      creative_id: true,
      title_id: true,
      product_hint: true
    };
    var out = [];
    var query = safeText(location.search || '').replace(/^\?/, '');
    if (!query) return out;

    var parts = query.split('&');
    for (var i = 0; i < parts.length; i++) {
      var piece = trim(parts[i]);
      if (!piece) continue;
      var eq = piece.indexOf('=');
      var rawKey = eq >= 0 ? piece.slice(0, eq) : piece;
      var rawVal = eq >= 0 ? piece.slice(eq + 1) : '';
      var key = lower(rawKey);
      if (!keep[key]) continue;
      out.push(encodeURIComponent(rawKey) + '=' + encodeURIComponent(rawVal));
    }
    return out;
  }

  function getStoreUrl(extraParams) {
    var params = getTrackingContextParams();
    var extra = extraParams || [];
    for (var i = 0; i < extra.length; i++) {
      if (extra[i]) params.push(extra[i]);
    }
    var url = buildAbsoluteUrl('loja.html');
    if (!params.length) return url;
    return url + '?' + params.join('&');
  }

  function isInAppBrowser() {
    var ua = lower(navigator.userAgent || '');
    return /instagram|fbav|fban|line|micromessenger|wv|webview|messenger/i.test(ua);
  }

  function openBuy(url, ev) {
    var u = ensureHttpUrl(url);
    if (!u || u === '#') {
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    }

    // Desktop / navegador normal:
    // deixa o <a target="_blank"> trabalhar sozinho.
    if (!isInAppBrowser()) {
      return true;
    }

    // In-app browser:
    // intercepta e tenta abrir manualmente.
    if (ev && ev.preventDefault) ev.preventDefault();

    try {
      var w = window.open(u, '_blank');
      if (w && typeof w.focus === 'function') {
        w.focus();
        return false;
      }
    } catch (e) {}

    window.location.assign(u);
    return false;
  }

  function parseBadges(p) {
    var b = p.badges || p.tags || p.badge || p.badges_tags || p.badgesTags;
    if (Array.isArray(b)) {
      return b.map(function (x) { return trim(x); }).filter(function (x) { return x; });
    }
    if (typeof b === 'string') {
      return b.split(',').map(function (x) { return trim(x); }).filter(function (x) { return x; });
    }
    return [];
  }

  function getImage(p) {
    return p.image_url || p.image || p.img || p.imageUrl || p.imageURL || p.image_path || p.imagePath || p.media || p.cover || '';
  }

  function getLink(p) {
    var link =
      p.open_url ||
      p.check_url ||
      p.canonical_url ||
      p.short_url ||
      p.resolved_url ||
      p.link ||
      p.url ||
      p.href ||
      p.mercadolivre_link ||
      p.mercado_livre_link ||
      p.ml_link ||
      '';

    return ensureHttpUrl(link);
  }

  function getMlId(p) {
    return p.id_busca || p.ml_id || p.id_ml || p.mercadolivre_id || p.mercado_livre_id || p.id || '';
  }

  function isActive(p) {
    if (!p) return false;
    if (p.disabled === true) return false;
    if (p.active === false) return false;
    if (p.is_active === false) return false;
    return true;
  }

  function isFeatured(p) {
    return p && (p.featured === true || p.is_featured === true);
  }

  function isTruthy(v) {
    var s = lower(trim(v));
    if (v === true) return true;
    if (v === false || v === null || v === undefined) return false;
    return s === '1' || s === 'true' || s === 'sim' || s === 'yes' || s === 'y' || s === 'on' || s === 'x';
  }

  function getQuickHomeFlag(p) {
    if (!p) return false;
    if (p.quick_home === true || p.quickHome === true || p.home_quick === true || p.homeQuick === true) return true;
    return isTruthy(p.quick_home || p.quickHome || p.home_quick || p.homeQuick);
  }

  function getQuickHomeOrder(p) {
    if (!p) return null;
    var raw = p.quick_home_order;
    if (raw === null || raw === undefined || raw === '') raw = p.quickHomeOrder;
    if (raw === null || raw === undefined || raw === '') raw = p.home_quick_order;
    if (raw === null || raw === undefined || raw === '') raw = p.homeQuickOrder;
    var n = parseInt(raw, 10);
    if (!isFinite(n)) return null;
    return n;
  }

  function sortQuickManual(list) {
    var arr = list.slice();
    arr.sort(function (a, b) {
      var oa = getQuickHomeOrder(a);
      var ob = getQuickHomeOrder(b);
      var ha = (oa === null || oa === undefined) ? 999999 : oa;
      var hb = (ob === null || ob === undefined) ? 999999 : ob;
      if (ha !== hb) return ha - hb;

      var fa = isFeatured(a) ? 0 : 1;
      var fb = isFeatured(b) ? 0 : 1;
      if (fa !== fb) return fa - fb;

      var ta = lower(a.title || a.name || a.sku);
      var tb = lower(b.title || b.name || b.sku);
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    });
    return arr;
  }

  function pickQuickProducts(activeList, sortedList, limit) {
    var base = Array.isArray(activeList) ? activeList : [];
    var fallback = Array.isArray(sortedList) ? sortedList.slice() : sortRelev(base);
    var max = parseInt(limit, 10);
    if (!isFinite(max) || max < 1) max = QUICK_HOME_LIMIT;

    var manual = [];
    var ordered = [];
    var unordered = [];
    var i;

    for (i = 0; i < base.length; i++) {
      if (!getQuickHomeFlag(base[i])) continue;
      manual.push(base[i]);
      if (getQuickHomeOrder(base[i]) !== null) ordered.push(base[i]);
      else unordered.push(base[i]);
    }

    if (!manual.length) {
      return {
        items: fallback.slice(0, max),
        source: 'fallback',
        mode: 'fallback',
        limit: max
      };
    }

    if (!ordered.length) {
      var manualOnly = sortQuickManual(manual).slice(0, max);
      return {
        items: manualOnly,
        source: 'manual',
        mode: 'manual_only',
        limit: max
      };
    }

    var slots = new Array(max);
    var orderedPositions = {};
    var usedKeys = {};
    var p, order, key, pos;

    ordered.sort(function (a, b) {
      return getQuickHomeOrder(a) - getQuickHomeOrder(b);
    });

    for (i = 0; i < ordered.length; i++) {
      p = ordered[i];
      order = getQuickHomeOrder(p);
      if (order === null || order < 1 || order > max) continue;
      key = getProductKey(p);
      if (usedKeys[key]) continue;
      pos = order - 1;
      slots[pos] = p;
      orderedPositions[pos] = true;
      usedKeys[key] = true;
    }

    for (i = 0; i < unordered.length; i++) {
      p = unordered[i];
      key = getProductKey(p);
      if (usedKeys[key]) continue;
      for (pos = 0; pos < max; pos++) {
        if (!slots[pos]) {
          slots[pos] = p;
          usedKeys[key] = true;
          break;
        }
      }
    }

    var cursor = 0;
    for (pos = 0; pos < max; pos++) {
      if (slots[pos]) continue;
      while (cursor < fallback.length) {
        p = fallback[cursor++];
        key = getProductKey(p);
        if (!key || usedKeys[key]) continue;
        slots[pos] = p;
        usedKeys[key] = true;
        break;
      }
    }

    var finalItems = [];
    for (pos = 0; pos < max; pos++) {
      if (slots[pos]) finalItems.push(slots[pos]);
    }

    return {
      items: finalItems,
      source: 'manual',
      mode: 'positional_overlay',
      limit: max
    };
  }

  function formatIsoToPt(iso) {
    iso = safeText(iso);
    var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return iso ? iso : 'agora';
    var dd = m[3], mm = m[2], yyyy = m[1], hh = m[4], mi = m[5];
    return dd + '/' + mm + '/' + yyyy + ', ' + hh + ':' + mi;
  }

  function sortRelev(list) {
    var arr = list.slice();
    arr.sort(function (a, b) {
      var fa = isFeatured(a) ? 0 : 1;
      var fb = isFeatured(b) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      var ta = lower(a.title || a.name || a.sku);
      var tb = lower(b.title || b.name || b.sku);
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    });
    return arr;
  }

  function setTotals(n) {
    qsa('[data-total-products]').forEach(function (el) { el.textContent = String(n); });
  }

  function setQuickCount(n) {
    qsa('[data-quick-products]').forEach(function (el) { el.textContent = String(n); });
  }

  function makeBgClickThrough() {
    var bg = qs('.bg');
    if (!bg) return;
    bg.style.pointerEvents = 'none';
    qsa('.bg *').forEach(function (el) { el.style.pointerEvents = 'none'; });
  }

  function getTrackProduct(p, extra) {
    var meta = extra || {};
    return {
      sku: safeText(p && (p.sku || '')),
      product_title: safeText(p && (p.title || p.name || p.sku || '')),
      id_busca: safeText(getMlId(p)),
      badges: parseBadges(p),
      featured: !!isFeatured(p),
      quick_home: !!getQuickHomeFlag(p),
      quick_home_order: getQuickHomeOrder(p),
      page_type: 'home',
      position_on_page: (meta.position_on_page === 0 || meta.position_on_page) ? meta.position_on_page : null,
      placement: safeText(meta.placement || ''),
      source_block: safeText(meta.source_block || ''),
      quick_source: safeText(meta.quick_source || ''),
      quick_mode: safeText(meta.quick_mode || '')
    };
  }

  function trackEvent(eventName, payload) {
    try {
      if (!window.CNTracking || typeof window.CNTracking.track !== 'function') return;
      window.CNTracking.track(eventName, payload || {});
    } catch (e) {}
  }

  function getPageTrackBase(extra) {
    var meta = extra || {};
    return {
      page_type: 'home',
      placement: safeText(meta.placement || ''),
      source_block: safeText(meta.source_block || ''),
      section: safeText(meta.section || '')
    };
  }

  function detectSocialPlatform(url) {
    var u = lower(ensureHttpUrl(url));
    if (!u) return '';
    if (u.indexOf('instagram.com') >= 0) return 'instagram';
    if (u.indexOf('threads.net') >= 0) return 'threads';
    if (u.indexOf('facebook.com') >= 0 || u.indexOf('fb.com') >= 0) return 'facebook';
    if (u.indexOf('tiktok.com') >= 0) return 'tiktok';
    if (u.indexOf('kwai.com') >= 0 || u.indexOf('k.kwai.com') >= 0) return 'kwai';
    if (u.indexOf('t.me') >= 0 || u.indexOf('telegram.me') >= 0) return 'telegram';
    if (u.indexOf('youtube.com') >= 0 || u.indexOf('youtu.be') >= 0) return 'youtube';
    if (u.indexOf('mercadolivre.com') >= 0 || u.indexOf('mercadolibre.com') >= 0 || u.indexOf('meli.la') >= 0) return 'mercado_livre';
    return '';
  }

  function findAnchor(node) {
    while (node && node !== document && node.nodeType === 1) {
      if (node.tagName && node.tagName.toLowerCase() === 'a') return node;
      node = node.parentNode;
    }
    return null;
  }

  function trackProductViewOnce(state, kind, p, extra) {
    if (!state || !p) return;

    var sku = safeText(p.sku || p.title || '');
    if (!sku) return;

    if (!state._trackedViews) state._trackedViews = { featured: {}, quick: {} };
    if (!state._trackedViews[kind]) state._trackedViews[kind] = {};

    if (state._trackedViews[kind][sku]) return;
    state._trackedViews[kind][sku] = true;

    if (kind === 'featured') {
      trackEvent('view_featured', getTrackProduct(p, extra));
      return;
    }

    if (kind === 'quick') {
      trackEvent('view_quick_product', getTrackProduct(p, extra));
    }
  }



  function titleCaseWord(word, idx) {
    var raw = safeText(word);
    if (!raw) return '';
    var low = lower(raw);
    var small = { 'a': true, 'o': true, 'as': true, 'os': true, 'de': true, 'da': true, 'do': true, 'das': true, 'dos': true, 'e': true, 'em': true, 'para': true, 'com': true };
    if (idx > 0 && small[low]) return low;

    return raw.split('-').map(function (part) {
      if (!part) return part;
      var pLow = lower(part);
      if (pLow === 'anti') return 'Anti';
      if (pLow === 'frizz') return 'Frizz';
      return pLow.charAt(0).toUpperCase() + pLow.slice(1);
    }).join('-');
  }

  function toDisplayTitle(raw) {
    var s = trim(raw).replace(/\s+/g, ' ');
    if (!s) return '';
    s = s.replace(/\s*\+\s*/g, ' + ');
    var parts = s.split(' ');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '+') out.push('+');
      else out.push(titleCaseWord(parts[i], out.length));
    }
    return out.join(' ')
      .replace(/Anti-Frizz/g, 'Anti‑Frizz')
      .replace(/Ruby rose/gi, 'Ruby Rose')
      .replace(/Mercado livre/gi, 'Mercado Livre');
  }

  function sentenceCaseFeature(raw) {
    var s = trim(raw).replace(/\s+/g, ' ');
    if (!s) return '';
    s = s.replace(/\s*\+\s*/g, ', ');
    s = s.replace(/,\s*2\s+/i, ' e 2 ');
    s = lower(s);
    return s;
  }

  function getFeaturedTitleParts(p) {
    var raw = trim(p && (p.title || p.name || p.sku || 'Produto do Dia'));
    if (!raw) return { main: 'Produto em Destaque', sub: '' };

    var normalized = raw.replace(/\s+/g, ' ');
    var low = lower(normalized);

    if (low.indexOf('kit cetim anti') >= 0) {
      return {
        main: 'Kit Cetim Anti‑Frizz',
        sub: '2 fronhas, touca, modelador e 2 xuxinhas'
      };
    }

    if (low.indexOf('gel para sobrancelhas') >= 0 && low.indexOf('ruby rose') >= 0) {
      return {
        main: 'Gel para Sobrancelhas Brow Rise',
        sub: 'Ruby Rose'
      };
    }

    var digitSplit = normalized.match(/^(.+?)\s+(\d+\s+.+)$/);
    if (digitSplit && normalized.length > 40) {
      return {
        main: toDisplayTitle(digitSplit[1]),
        sub: sentenceCaseFeature(digitSplit[2])
      };
    }

    return {
      main: toDisplayTitle(normalized),
      sub: ''
    };
  }


  function getFeaturedSummary(p) {
    var raw = lower(p && (p.title || p.name || p.sku || ''));
    if (raw.indexOf('kit cetim anti') >= 0) {
      return 'Conforto e cuidado noturno para cabelos mais alinhados.';
    }
    if (raw.indexOf('gel para sobrancelhas') >= 0 && raw.indexOf('ruby rose') >= 0) {
      return 'Acabamento natural para sobrancelhas alinhadas e visual mais polido.';
    }
    if (raw.indexOf('unha') >= 0 || raw.indexOf('francesinha') >= 0) {
      return 'Praticidade e acabamento delicado para uma rotina de beleza mais elegante.';
    }
    return 'Achado selecionado pela curadoria para facilitar sua compra.';
  }

  function renderFeatured(p, state) {
    var root = qs('#featured');
    if (!root) return;
    root.innerHTML = '';

    if (!p) {
      var note = document.createElement('div');
      note.className = 'imperialNote';
      note.innerHTML = '<b>ATENÇÃO:</b> nenhum produto ativo encontrado.';
      root.appendChild(note);
      return;
    }

    trackProductViewOnce(state, 'featured', p, {
      placement: 'featured_main',
      source_block: 'produto_do_dia',
      position_on_page: 1,
      quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
    });

    var wrap = document.createElement('div');
    wrap.className = 'cnFeaturedWrap';

    var cardImg = document.createElement('div');
    cardImg.className = 'cnCard cnFeaturedMedia';
    var img = document.createElement('img');
    img.className = 'cnImg';
    img.alt = safeText(p.title || 'Produto do Dia');
    img.loading = 'lazy';
    var src = getImage(p);
    if (src) {
      img.src = src;
    } else {
      img.style.display = 'none';
    }
    cardImg.appendChild(img);
    wrap.appendChild(cardImg);

    var cardInfo = document.createElement('div');
    cardInfo.className = 'cnCard cnFeaturedInfo';
    var pad = document.createElement('div');
    pad.className = 'cnCardPad';

    var titleParts = getFeaturedTitleParts(p);
    var h = document.createElement('h3');
    h.className = 'cnTitle';

    var titleMain = document.createElement('span');
    titleMain.className = 'cnTitleMain';
    titleMain.textContent = titleParts.main;
    h.appendChild(titleMain);

    if (titleParts.sub) {
      var titleSub = document.createElement('span');
      titleSub.className = 'cnTitleSub';
      titleSub.textContent = titleParts.sub;
      h.appendChild(titleSub);
    }

    pad.appendChild(h);

    var featureSummary = document.createElement('p');
    featureSummary.className = 'cnFeatureSummary';
    featureSummary.textContent = getFeaturedSummary(p);
    pad.appendChild(featureSummary);

    var badges = parseBadges(p);
    if (badges.length) {
      var bwrap = document.createElement('div');
      bwrap.className = 'cnBadges';
      for (var i = 0; i < badges.length && i < 3; i++) {
        var sp = document.createElement('span');
        sp.textContent = badges[i];
        bwrap.appendChild(sp);
      }
      pad.appendChild(bwrap);
    }

    var buyBox = document.createElement('div');
    buyBox.className = 'cnBuyBox';

    var buyTitle = document.createElement('div');
    buyTitle.className = 'cnBuyTitle';
    buyTitle.textContent = 'Compra rápida';
    buyBox.appendChild(buyTitle);

    var steps = document.createElement('ol');
    steps.className = 'cnSteps';
    var mlid = getMlId(p);
    steps.innerHTML =
      '<li>Acesse o <b>Mercado Livre</b> pelo botão principal</li>' +
      '<li>Se preferir, use o código de busca: <b>' + safeText(mlid) + '</b></li>';
    buyBox.appendChild(steps);
    pad.appendChild(buyBox);

    var row1 = document.createElement('div');
    row1.className = 'cnRow';

    var aBuy = document.createElement('a');
    aBuy.className = 'btn btn--gold btn--tiny btn--buy-primary cnActionPrimary';
    aBuy.textContent = 'Ver no Mercado Livre';
    var buyLink = getLink(p);
    aBuy.href = buyLink || '#';
    aBuy.target = '_blank';
    aBuy.rel = 'noopener noreferrer';
    aBuy.setAttribute('data-cn-track-owned', '1');
    aBuy.onclick = function (ev) {
      if (!buyLink) {
        if (ev && ev.preventDefault) ev.preventDefault();
        toast('Link do produto não encontrado');
        return false;
      }

      trackEvent('click_buy_home_featured', getTrackProduct(p, {
        placement: 'featured_buy',
        source_block: 'produto_do_dia',
        position_on_page: 1,
        quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
      }));

      return openBuy(buyLink, ev);
    };
    row1.appendChild(aBuy);

    var bCopyId = document.createElement('button');
    bCopyId.type = 'button';
    bCopyId.className = 'btn btn--glass btn--tiny cnActionSecondary';
    bCopyId.textContent = 'Copiar ID';
    bCopyId.onclick = function () {
      trackEvent('click_copy_id_home', getTrackProduct(p, {
        placement: 'featured_copy_id',
        source_block: 'produto_do_dia',
        position_on_page: 1,
        quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
      }));

      copyText(mlid).then(function (ok) { toast(ok ? 'ID copiado ✅' : 'Falha ao copiar'); });
    };
    row1.appendChild(bCopyId);

    var bCopyLink = document.createElement('button');
    bCopyLink.type = 'button';
    bCopyLink.className = 'btn btn--glass btn--tiny cnActionSecondary';
    bCopyLink.textContent = 'Copiar Link';
    bCopyLink.onclick = function () {
      var link = getLink(p);

      trackEvent('click_copy_link_home', getTrackProduct(p, {
        placement: 'featured_copy_link',
        source_block: 'produto_do_dia',
        position_on_page: 1,
        quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
      }));

      copyText(link).then(function (ok) { toast(ok ? 'Link copiado ✅' : 'Falha ao copiar'); });
    };
    row1.appendChild(bCopyLink);

    var aStore = document.createElement('a');
    aStore.className = 'btn btn--glass btn--tiny cnActionTertiary';
    aStore.setAttribute('data-cn-track-owned', '1');
    aStore.setAttribute('data-cn-role', 'open-store');
    aStore.textContent = 'Abrir Loja Completa';
    aStore.href = getStoreUrl(['cn_source_page=home', 'cn_source_block=produto_do_dia']);
    aStore.onclick = function () {
      trackEvent('click_open_store', {
        page_type: 'home',
        placement: 'featured_open_store',
        source_block: 'produto_do_dia',
        quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
      });
    };
    row1.appendChild(aStore);

    pad.appendChild(row1);

    var meta = document.createElement('div');
    meta.className = 'cnMeta';
    meta.innerHTML = '<span>Código de busca</span><b>' + safeText(mlid) + '</b>';
    pad.appendChild(meta);

    cardInfo.appendChild(pad);
    wrap.appendChild(cardInfo);

    root.appendChild(wrap);
  }

  function makeQuickCard(p, idx, state) {
    var card = document.createElement('article');
    card.className = 'cnProd';

    trackProductViewOnce(state, 'quick', p, {
      placement: 'quick_grid',
      source_block: 'vitrine_rapida',
      position_on_page: idx + 1,
      quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
    });

    var img = document.createElement('img');
    img.className = 'cnImg';
    img.loading = 'lazy';
    img.alt = safeText(p.title || p.sku || 'Produto');
    var src = getImage(p);
    if (src) img.src = src;
    card.appendChild(img);

    var pad = document.createElement('div');
    pad.className = 'cnProdPad';

    var h3 = document.createElement('h3');
    h3.textContent = toDisplayTitle(p.title || p.name || p.sku || 'Produto');
    pad.appendChild(h3);

    var badges = parseBadges(p);
    if (badges.length) {
      var bwrap = document.createElement('div');
      bwrap.className = 'cnBadges';
      for (var i = 0; i < badges.length && i < 3; i++) {
        var sp = document.createElement('span');
        sp.textContent = badges[i];
        bwrap.appendChild(sp);
      }
      pad.appendChild(bwrap);
    }

    var mlid = getMlId(p);
    var meta = document.createElement('div');
    meta.className = 'cnMeta';
    meta.innerHTML = '<span>Código</span><b>' + safeText(mlid) + '</b>';
    pad.appendChild(meta);

    var row = document.createElement('div');
    row.className = 'cnRow';

    var buy = document.createElement('a');
    buy.className = 'btn btn--gold btn--tiny btn--buy-primary cnQuickPrimary';
    buy.textContent = 'Comprar';
    var buyLink = getLink(p);
    buy.href = buyLink || '#';
    buy.target = '_blank';
    buy.rel = 'noopener noreferrer';
    buy.setAttribute('data-cn-track-owned', '1');
    buy.onclick = function (ev) {
      if (!buyLink) {
        if (ev && ev.preventDefault) ev.preventDefault();
        toast('Link do produto não encontrado');
        return false;
      }

      trackEvent('click_buy_home_quick', getTrackProduct(p, {
        placement: 'quick_buy',
        source_block: 'vitrine_rapida',
        position_on_page: idx + 1,
        quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
      }));

      return openBuy(buyLink, ev);
    };
    row.appendChild(buy);

    var cId = document.createElement('button');
    cId.className = 'btn btn--glass btn--tiny cnQuickSecondary';
    cId.type = 'button';
    cId.textContent = 'Copiar ID';
    cId.onclick = function () {
      trackEvent('click_copy_id_home', getTrackProduct(p, {
        placement: 'quick_copy_id',
        source_block: 'vitrine_rapida',
        position_on_page: idx + 1,
        quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
      }));

      copyText(mlid).then(function (ok) { toast(ok ? 'ID copiado ✅' : 'Falha ao copiar'); });
    };
    row.appendChild(cId);

    var cLink = document.createElement('button');
    cLink.className = 'btn btn--glass btn--tiny cnQuickTertiary';
    cLink.type = 'button';
    cLink.textContent = 'Copiar Link';
    cLink.onclick = function () {
      var link = getLink(p);

      trackEvent('click_copy_link_home', getTrackProduct(p, {
        placement: 'quick_copy_link',
        source_block: 'vitrine_rapida',
        position_on_page: idx + 1,
        quick_source: state && state.quickSource ? state.quickSource : 'fallback',
      quick_mode: state && state.quickMode ? state.quickMode : 'fallback'
      }));

      copyText(link).then(function (ok) { toast(ok ? 'Link copiado ✅' : 'Falha ao copiar'); });
    };
    row.appendChild(cLink);

    pad.appendChild(row);
    card.appendChild(pad);

    return card;
  }

  function renderQuick(list, state) {
    var grid = qs('#quickGrid');
    if (!grid) return;
    grid.innerHTML = '';

    var limit = QUICK_HOME_LIMIT;
    var n = Math.min(limit, list.length);
    for (var i = 0; i < n; i++) {
      grid.appendChild(makeQuickCard(list[i], i, state));
    }
    setQuickCount(n);
  }

  function bindSearch(state) {
    var input = qs('#qHome');
    var clear = qs('#qClear');
    if (!input) {
      renderQuick(state.quickDefault || state.sorted || [], state);
      return;
    }

    var debounce = 0;

    function apply(shouldTrack) {
      var q = lower(input.value);
      var out = [];
      if (!q) {
        out = (state.quickDefault && state.quickDefault.length) ? state.quickDefault : state.sorted;
      } else {
        for (var i = 0; i < state.sorted.length; i++) {
          var p = state.sorted[i];
          var blob = lower((p.title || '') + ' ' + parseBadges(p).join(' ') + ' ' + getMlId(p) + ' ' + (p.sku || ''));
          if (blob.indexOf(q) >= 0) out.push(p);
        }
      }
      renderQuick(out, state);

      if (shouldTrack) {
        var normalized = trim(q);
        if (state._lastTrackedSearch !== normalized) {
          state._lastTrackedSearch = normalized;
          trackEvent('search', {
            page_type: 'home',
            placement: 'home_search',
            source_block: 'vitrine_rapida',
            query: normalized,
            results_count: out.length,
            quick_source: !normalized ? (state.quickSource || 'fallback') : 'search_all'
          });
        }
      }
    }

    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        apply(true);
      }, 350);
    });

    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        state._lastTrackedSearch = '__force__';
        apply(true);
      });
    }
    apply(false);
  }

  function bindButtons() {
    var btnCopyLoja = qs('#copyLoja');
    if (btnCopyLoja) {
      btnCopyLoja.addEventListener('click', function () {
        var loja = getStoreUrl(['cn_source_page=home', 'cn_source_block=copy_loja']);
        trackEvent('click_copy_store_link', getPageTrackBase({
          placement: 'copy_store_link',
          source_block: 'header_actions',
          section: 'home_top'
        }));
        copyText(loja).then(function (ok) { toast(ok ? 'Link da vitrine copiado ✅' : 'Falha ao copiar'); });
      });
    }

    var btnCopyHome = qs('[data-copy="bio"]');
    if (btnCopyHome) {
      btnCopyHome.addEventListener('click', function () {
        trackEvent('click_copy_home_link', getPageTrackBase({
          placement: 'copy_home_link',
          source_block: 'header_actions',
          section: 'home_top'
        }));
        copyText(location.href).then(function (ok) { toast(ok ? 'Link da home copiado ✅' : 'Falha ao copiar'); });
      });
    }

    var btnRefresh = qs('#refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', function () {
        trackEvent('click_refresh_home', getPageTrackBase({
          placement: 'refresh',
          source_block: 'header_actions',
          section: 'home_top'
        }));
        location.reload();
      });
    }
  }

  function bindOutboundLinks() {
    document.addEventListener('click', function (ev) {
      var a = findAnchor(ev.target);
      if (!a) return;
      if (a.getAttribute('data-cn-track-owned') === '1') return;

      var href = ensureHttpUrl(a.getAttribute('href') || a.href || '');
      if (!href || href === '#') return;

      var platform = detectSocialPlatform(href);
      if (!platform) return;

      trackEvent('click_outbound_link', {
        page_type: 'home',
        placement: safeText(a.getAttribute('data-placement') || 'outbound_link'),
        source_block: safeText(a.getAttribute('data-source-block') || 'home_links'),
        section: safeText(a.getAttribute('data-section') || 'home'),
        social_platform: platform,
        target_url: href
      });
    }, false);
  }

  function setLastUpdate(iso) {
    var el = qs('#lastUpdate');
    if (!el) return;
    el.textContent = iso ? formatIsoToPt(iso) : 'agora';
  }

  function init() {
    makeBgClickThrough();
    bindButtons();
    bindOutboundLinks();

    trackEvent('page_view', {
      page_type: 'home',
      placement: 'landing_entry',
      source_block: 'home',
      section: 'entry'
    });

    var y = new Date().getFullYear();
    var yEl = qs('#year');
    if (yEl) yEl.textContent = String(y);

    var state = {
      products: [],
      active: [],
      sorted: [],
      quickDefault: [],
      quickSource: 'fallback',
      quickMode: 'fallback',
      featured: null,
      updated_at: '',
      _trackedViews: {
        featured: {},
        quick: {}
      }
    };

    fetch('./produtos.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('fetch produtos.json'); return r.json(); })
      .then(function (j) {
        var list = j.products || j.items || [];
        state.updated_at = j.updated_at || j.updatedAt || (j.meta && (j.meta.updated_at || j.meta.updatedAt)) || '';
        state.products = Array.isArray(list) ? list : [];
        state.active = state.products.filter(isActive);
        state.sorted = sortRelev(state.active);

        var quickPick = pickQuickProducts(state.active, state.sorted, QUICK_HOME_LIMIT);
        state.quickDefault = quickPick.items;
        state.quickSource = quickPick.source;
        state.quickMode = quickPick.mode || quickPick.source || 'fallback';

        setTotals(state.active.length);
        setLastUpdate(state.updated_at);

        var feat = null;
        for (var i = 0; i < state.sorted.length; i++) {
          if (isFeatured(state.sorted[i])) { feat = state.sorted[i]; break; }
        }
        if (!feat) feat = state.sorted.length ? state.sorted[0] : null;
        state.featured = feat;

        renderFeatured(state.featured, state);
        bindSearch(state);

        qsa('[data-total-products]').forEach(function (el) { el.textContent = String(state.active.length); });
      })
      .catch(function () {
        var rootF = qs('#featured');
        if (rootF) {
          rootF.innerHTML = '<div class="imperialNote"><b>ERRO:</b> não consegui carregar <b>produtos.json</b> no celular. Tenta abrir o link com barra no final: <b>/La_Famiglia_Links/</b>.</div>';
        }
        setTotals(0);
        setQuickCount(0);
        setLastUpdate('');
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
