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
   - a grade rápida agora exibe até 32 produtos
   - quick_home_order (1..32) fixa o produto na posição desejada
   - ao substituir 1 posição, o restante da estrutura é preservado

   ✅ HOTFIX VITRINE RÁPIDA POSIÇÕES DUPLICADAS (2026-05-04):
   - quando dois produtos disputam a mesma quick_home_order, vence o produto editado/publicado mais recentemente
   - evita que um produto antigo sobrescreva a posição recém-definida via issue
   - remove Produto do Dia da Vitrine Rápida para não duplicar destaque na home

   ✅ PATCH MOBILE UX + PREÇO/GALERIA (2026-05-09):
   - CTA principal agora fala compra, não apenas visualização
   - suporte a preço/desconto editável via produtos.json
   - suporte a galeria de imagens por produto na home
*/
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function safeText(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(s) { return safeText(s).replace(/^\s+|\s+$/g, ''); }
  function lower(s) { return safeText(s).toLowerCase(); }

  function isMobileHomeLayout() {
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) return true;
    } catch (e) {}

    try {
      var ua = lower(navigator.userAgent || '');
      if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return true;
      if (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth <= 860) return true;
    } catch (e2) {}

    return false;
  }

  var QUICK_HOME_LIMIT = 32;
  var cnGalleryPreloadCache = {};
  var cnGalleryPreloadLinkCache = {};
  var cnLazyImageObserver = null;


  // ✅ FIX REAL VELOCIDADE IMAGENS — usa versão leve/cached para exibição.
  // Mantém o link original como fallback caso o proxy de imagem não consiga buscar a origem.
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
    var mobile = isMobileHomeLayout();
    if (kind === 'lightbox') return mobile ? 900 : 1180;
    if (kind === 'featured') return mobile ? 620 : 860;
    if (kind === 'hero') return mobile ? 900 : 1400;
    return mobile ? 520 : 620;
  }

  function fastImageUrl(url, kind) {
    var u = ensureHttpUrl(url);
    if (!canUseFastImageProxy(u)) return u;

    var w = getFastImageWidth(kind || 'quick');
    // URL precisa ser codificada porque muitas imagens do GitHub têm querystring/token.
    return CN_IMAGE_PROXY_BASE + '?url=' + encodeURIComponent(u) + '&w=' + encodeURIComponent(String(w)) + '&q=72&output=webp&we=1';
  }

  function mapFastImages(images, kind) {
    var out = [];
    if (!images || !images.length) return out;
    for (var i = 0; i < images.length; i++) {
      out.push(fastImageUrl(images[i], kind));
    }
    return out;
  }

  function setImageSrcWithFallback(img, src, fallbackSrc) {
    if (!img || !src) return;
    var fb = trim(fallbackSrc || '');
    if (fb && fb !== src) img.setAttribute('data-cn-fallback-src', fb);
    else img.removeAttribute('data-cn-fallback-src');

    // ✅ PERFORMANCE: se a imagem já está carregada no elemento, não reatribui src.
    // Reatribuir o mesmo src pode causar piscada/revalidação no modal.
    var current = img.currentSrc || img.getAttribute('src') || '';
    if (current === src || img.getAttribute('src') === src) return;

    img.src = src;
  }

  function scheduleIdleTask(fn, delay) {
    if (typeof fn !== 'function') return;
    try {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(fn, { timeout: 1800 });
        return;
      }
    } catch (e) {}
    setTimeout(fn, delay || 700);
  }

  function loadDeferredImage(img) {
    if (!img) return;
    var src = img.getAttribute('data-cn-src') || '';
    if (!src) return;
    img.removeAttribute('data-cn-src');
    img.src = src;
  }

  function observeDeferredImage(img) {
    if (!img) return;
    try {
      if (!('IntersectionObserver' in window)) {
        loadDeferredImage(img);
        return;
      }

      if (!cnLazyImageObserver) {
        cnLazyImageObserver = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry && (entry.isIntersecting || entry.intersectionRatio > 0)) {
              cnLazyImageObserver.unobserve(entry.target);
              loadDeferredImage(entry.target);
            }
          }
        }, { rootMargin: '520px 0px', threshold: 0.01 });
      }

      cnLazyImageObserver.observe(img);
    } catch (e) {
      loadDeferredImage(img);
    }
  }

  function getProductKey(p) {
    if (!p) return '';
    return safeText(p.sku || p.id_busca || p.id || p.title || p.name || '');
  }

  function toPositiveInt(v) {
    var n = parseInt(v, 10);
    if (!isFinite(n) || n <= 0) return 0;
    return n;
  }

  function getQuickPriority(p) {
    if (!p) return 0;

    var best = 0;
    var candidates = [
      p._source_issue_number,
      p.source_issue_number,
      p.sourceIssueNumber,
      p._target_issue_number,
      p.target_issue_number,
      p.targetIssueNumber,
      p.issue_number,
      p.issueNumber,
      p.issue,
      p.id
    ];

    for (var i = 0; i < candidates.length; i++) {
      var n = toPositiveInt(candidates[i]);
      if (n > best) best = n;
    }

    return best;
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

  function firstFilled(values) {
    for (var i = 0; i < values.length; i++) {
      var s = trim(values[i]);
      if (s) return s;
    }
    return '';
  }

  function looksLikeImageUrl(v) {
    var s = trim(v);
    var x = lower(s);
    if (!s) return false;
    if (x.indexOf('data:image/') === 0) return true;
    if (x.indexOf('github.com/user-attachments/assets/') >= 0) return true;
    if (x.indexOf('raw.githubusercontent.com/') >= 0) return true;
    if (/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(s)) return true;
    return false;
  }

  function pushImageCandidate(out, value) {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) pushImageCandidate(out, value[i]);
      return;
    }

    if (typeof value === 'object') {
      pushImageCandidate(out, value.url || value.src || value.image || value.image_url || value.href || '');
      return;
    }

    var raw = trim(value);
    if (!raw) return;

    var parts = raw.split(/[\n,;|]+/);
    for (var j = 0; j < parts.length; j++) {
      var item = ensureHttpUrl(trim(parts[j]));
      if (!item || !looksLikeImageUrl(item)) continue;
      var key = lower(item);
      var exists = false;
      for (var k = 0; k < out.length; k++) {
        if (lower(out[k]) === key) { exists = true; break; }
      }
      if (!exists) out.push(item);
    }
  }

  function getImages(p) {
    var out = [];
    if (!p) return out;

    pushImageCandidate(out, getImage(p));
    pushImageCandidate(out, p.images);
    pushImageCandidate(out, p.imagens);
    pushImageCandidate(out, p.gallery);
    pushImageCandidate(out, p.galeria);
    pushImageCandidate(out, p.gallery_images);
    pushImageCandidate(out, p.image_gallery);
    pushImageCandidate(out, p.extra_images);
    pushImageCandidate(out, p.images_extra);
    pushImageCandidate(out, p.additional_images);
    pushImageCandidate(out, p.product_images);

    for (var i = 2; i <= 12; i++) {
      pushImageCandidate(out, p['image_' + i]);
      pushImageCandidate(out, p['imagem_' + i]);
      pushImageCandidate(out, p['image' + i]);
      pushImageCandidate(out, p['imagem' + i]);
    }

    return out;
  }

  function formatCheckedDate(v) {
    var s = trim(v);
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatIsoToPt(s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
    }
    return s;
  }

  function getPromoInfo(p) {
    p = p || {};
    var current = firstFilled([
      p.price_text,
      p.current_price_text,
      p.price_current_text,
      p.sale_price_text,
      p.preco_texto,
      p.preco_atual,
      p.preco,
      p.price_current,
      p.current_price,
      p.price
    ]);

    var old = firstFilled([
      p.old_price_text,
      p.price_old_text,
      p.price_before_text,
      p.previous_price_text,
      p.preco_anterior,
      p.preco_de,
      p.old_price,
      p.price_old,
      p.previous_price
    ]);

    var discount = firstFilled([
      p.discount_text,
      p.desconto_texto,
      p.desconto,
      p.sale_badge,
      p.offer_badge,
      p.promo_badge
    ]);

    var checked = firstFilled([
      p.price_checked_at,
      p.price_checked,
      p.preco_conferido_em,
      p.last_price_checked,
      p.price_last_checked
    ]);

    var note = firstFilled([
      p.promo_text,
      p.offer_text,
      p.price_note,
      p.preco_observacao,
      p.urgency_text
    ]);

    var buyCta = firstFilled([
      p.buy_cta,
      p.cta_buy_text,
      p.cta_text
    ]);

    return {
      has: !!(current || old || discount || checked || note),
      current: current,
      old: old,
      discount: discount,
      checked: formatCheckedDate(checked),
      note: note,
      buyCta: buyCta
    };
  }

  function getBuyCtaText(p, compact) {
    // Vitrine Rápida usa CTA curto para não quebrar o card.
    if (compact) return 'Comprar';

    // Produto do Dia pode usar o CTA premium vindo do produtos.json.
    var promo = getPromoInfo(p || {});
    var custom = trim(promo.buyCta || '');
    if (custom) return custom;

    return 'Comprar agora';
  }

  function setupBuyButtonVisual(el, labelText) {
    if (!el) return;

    var text = trim(labelText) || 'Comprar';

    el.setAttribute('data-cn-buy-shine', 'on');
    el.setAttribute('data-cn-buy-ready', '1');
    el.setAttribute('aria-label', text);

    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    var label = document.createElement('span');
    label.className = 'cnBuyLabel';
    label.textContent = text;
    el.appendChild(label);

    var fx = document.createElement('span');
    fx.className = 'cnBuySheenFx';
    fx.setAttribute('aria-hidden', 'true');
    el.appendChild(fx);
  }



  function applyFeaturedMobileActionsLikeQuick(row, buyBtn, copyBtn) {
    if (!row || !isMobileHomeLayout()) return;

    row.setAttribute('data-cn-featured-mobile-actions', '1');
    row.style.setProperty('display', 'grid', 'important');
    row.style.setProperty('grid-template-columns', 'repeat(2, minmax(0, 1fr))', 'important');
    row.style.setProperty('gap', '8px', 'important');
    row.style.setProperty('align-items', 'stretch', 'important');
    row.style.setProperty('width', '100%', 'important');
    row.style.setProperty('margin-top', '10px', 'important');
    row.style.setProperty('padding', '0', 'important');
    row.style.setProperty('overflow', 'visible', 'important');

    function forceButton(btn) {
      if (!btn) return;
      btn.style.setProperty('display', 'inline-flex', 'important');
      btn.style.setProperty('align-items', 'center', 'important');
      btn.style.setProperty('justify-content', 'center', 'important');
      btn.style.setProperty('grid-column', 'auto', 'important');
      btn.style.setProperty('justify-self', 'stretch', 'important');
      btn.style.setProperty('align-self', 'stretch', 'important');
      btn.style.setProperty('width', '100%', 'important');
      btn.style.setProperty('min-width', '0', 'important');
      btn.style.setProperty('max-width', 'none', 'important');
      btn.style.setProperty('min-height', '36px', 'important');
      btn.style.setProperty('height', '36px', 'important');
      btn.style.setProperty('padding', '0 8px', 'important');
      btn.style.setProperty('border-radius', '12px', 'important');
      btn.style.setProperty('font-size', '.70rem', 'important');
      btn.style.setProperty('line-height', '1', 'important');
      btn.style.setProperty('white-space', 'nowrap', 'important');
      btn.style.setProperty('text-align', 'center', 'important');
      btn.style.setProperty('overflow', 'hidden', 'important');
    }

    forceButton(buyBtn);
    forceButton(copyBtn);

    if (copyBtn) {
      copyBtn.style.setProperty('background', 'rgba(255,255,255,.035)', 'important');
      copyBtn.style.setProperty('border-color', 'rgba(255,255,255,.10)', 'important');
      copyBtn.style.setProperty('color', 'rgba(255,255,255,.88)', 'important');
      copyBtn.style.setProperty('box-shadow', '0 10px 22px rgba(0,0,0,.22)', 'important');
    }
  }

  function createPromoBox(p, compact) {
    var promo = getPromoInfo(p);
    if (!promo.has) return null;

    var box = document.createElement('div');
    box.className = compact ? 'cnPromoBox cnPromoBox--compact' : 'cnPromoBox';

    var label = document.createElement('div');
    label.className = 'cnPromoLabel';
    var labelText = document.createElement('span');
    labelText.textContent = promo.current ? 'Preço em destaque' : 'Oferta em destaque';
    label.appendChild(labelText);

    if (promo.discount) {
      var discount = document.createElement('span');
      discount.className = 'cnPromoDiscount';
      discount.textContent = promo.discount;
      label.appendChild(discount);
    }

    box.appendChild(label);

    if (promo.current || promo.old) {
      var prices = document.createElement('div');
      prices.className = 'cnPromoPrices';
      if (promo.current) {
        var current = document.createElement('strong');
        current.className = 'cnCurrentPrice';
        current.textContent = promo.current;
        prices.appendChild(current);
      }
      if (promo.old) {
        var old = document.createElement('span');
        old.className = 'cnOldPrice';
        old.textContent = promo.old;
        prices.appendChild(old);
      }
      box.appendChild(prices);
    }

    if (promo.note) {
      var note = document.createElement('div');
      note.className = 'cnPromoText';
      note.textContent = promo.note;
      box.appendChild(note);
    }

    if (promo.checked) {
      var checked = document.createElement('div');
      checked.className = 'cnPromoChecked';
      checked.textContent = 'Preço conferido em ' + promo.checked + '. Pode mudar no Mercado Livre.';
      box.appendChild(checked);
    }

    return box;
  }

  function injectGalleryPreloadLink(url, highPriority) {
    var u = trim(url);
    if (!u || cnGalleryPreloadLinkCache[u]) return;

    try {
      var link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = u;
      if (highPriority) {
        try { link.fetchPriority = 'high'; } catch (e1) {}
        try { link.setAttribute('fetchpriority', 'high'); } catch (e2) {}
      }
      document.head.appendChild(link);
      cnGalleryPreloadLinkCache[u] = true;
    } catch (e) {}
  }

  function preloadOneGalleryImage(url, highPriority) {
    var u = trim(url);
    if (!u) return null;

    if (highPriority) injectGalleryPreloadLink(u, true);

    if (cnGalleryPreloadCache[u]) return cnGalleryPreloadCache[u];

    var entry = {
      url: u,
      img: new Image(),
      loaded: false,
      failed: false
    };

    try { entry.img.decoding = 'async'; } catch (e0) {}
    if (highPriority) {
      try { entry.img.fetchPriority = 'high'; } catch (e3) {}
    }

    entry.img.onload = function () {
      entry.loaded = true;
      entry.failed = false;
    };
    entry.img.onerror = function () {
      entry.failed = true;
    };

    entry.img.src = u;
    cnGalleryPreloadCache[u] = entry;
    return entry;
  }

  function preloadGalleryImages(images, centerIndex, radius, highPriority) {
    if (!images || images.length < 2) return;
    var center = typeof centerIndex === 'number' ? centerIndex : 0;
    var span = typeof radius === 'number' ? radius : 1;
    var start = Math.max(0, center - span);
    var end = Math.min(images.length - 1, center + span);
    for (var i = start; i <= end; i++) preloadOneGalleryImage(images[i], highPriority === true);
  }

  function preloadAllGalleryImages(images, highPriority) {
    if (!images || images.length < 2) return;
    for (var i = 0; i < images.length; i++) {
      preloadOneGalleryImage(images[i], highPriority === true);
    }
  }


  var CN_STORE_INSTAGRAM = '@cosanostra.blackgold';
  var CN_STORE_TELEGRAM = '@BlackGoldSociety';
  var CN_STORE_HOME_URL = 'https://projetoscosanostra.github.io/La_Famiglia_Links/';

  function getProductDescription(p) {
    if (!p) return '';

    var raw =
      p.description ||
      p.descricao ||
      p.descricao_curta ||
      p.short_description ||
      p.shortDescription ||
      p.summary ||
      p.resumo ||
      '';

    if (trim(raw)) return trim(raw);

    var title = toDisplayTitle(p.title || p.name || p.sku || 'Produto');
    var blob = lower(title + ' ' + parseBadges(p).join(' ') + ' ' + (p.aliases_busca || []).join(' '));

    if (blob.indexOf('agua micelar') >= 0 || blob.indexOf('água micelar') >= 0 || blob.indexOf('garnier') >= 0) {
      return '💧 ' + title + ' — limpa, demaquila, hidrata e suaviza em um só passo. Ideal para todos os tipos de pele, com textura não oleosa e uso no rosto, olhos e lábios.';
    }

    if (blob.indexOf('skincare') >= 0 || blob.indexOf('limpeza facial') >= 0 || blob.indexOf('cuidados com a pele') >= 0) {
      return title + ' — achado de skincare selecionado para deixar sua rotina de cuidado mais prática, bonita e fácil de comprar.';
    }

    if (blob.indexOf('maquiagem') >= 0 || blob.indexOf('beleza') >= 0) {
      return title + ' — achado de beleza selecionado para quem gosta de praticidade, estilo e compra segura pelo Mercado Livre.';
    }

    return title + ' — achado selecionado pela curadoria da loja para facilitar sua compra. Confira preço, frete e disponibilidade no Mercado Livre antes de concluir.';
  }

  function normalizeHashtagWord(s) {
    var x = lower(s);
    x = x.replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i');
    x = x.replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/[ç]/g, 'c');
    x = x.replace(/[^a-z0-9]+/g, ' ');
    x = trim(x);
    if (!x) return '';
    var parts = x.split(/\s+/);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      out += parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
    }
    return out ? ('#' + out) : '';
  }

  function getProductHashtags(p) {
    if (!p) return '#AchadosDoDia #CosaNostraBlackGold';

    var raw = p.hashtags || p.hash_tags || p.tags_hashtags || '';
    if (Array.isArray(raw)) raw = raw.join(' ');
    raw = trim(raw);
    if (raw) return raw;

    var title = safeText(p.title || p.name || p.sku || '');
    var blob = lower(title + ' ' + parseBadges(p).join(' ') + ' ' + (p.aliases_busca || []).join(' '));

    if (blob.indexOf('agua micelar') >= 0 || blob.indexOf('água micelar') >= 0 || blob.indexOf('garnier') >= 0) {
      return '#AguaMicelar #Garnier #GarnierSkinActive #Skincare #LimpezaFacial #Demaquilante #CuidadosComAPele #PeleLimpa #RotinaDeBeleza #BelezaFeminina #AchadosDoDia #MercadoLivre #CosaNostraBlackGold #BlackGoldSociety';
    }

    var seed = parseBadges(p).slice(0, 8);
    if (p.categoria_principal) seed.push(p.categoria_principal);
    if (p.sku) seed.push('Cosa Nostra BlackGold');

    var out = [];
    var seen = {};
    for (var i = 0; i < seed.length; i++) {
      var h = normalizeHashtagWord(seed[i]);
      if (!h) continue;
      var key = lower(h);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(h);
      if (out.length >= 10) break;
    }

    if (!seen['#achadosdodia']) out.push('#AchadosDoDia');
    if (!seen['#mercadolivre']) out.push('#MercadoLivre');
    if (!seen['#cosanostrablackgold']) out.push('#CosaNostraBlackGold');
    return out.join(' ');
  }

  function getProductStoreCaption(p) {
    var desc = getProductDescription(p);
    var id = trim(getMlId(p));
    var link = trim(getLink(p));
    var tags = getProductHashtags(p);

    var lines = [];
    if (desc) lines.push(desc);
    if (id) {
      lines.push('');
      lines.push('🔍 Cole este texto no buscador do Mercado Livre: ' + id);
    }
    if (link) {
      lines.push('');
      lines.push('🔗 Ou acesse o link:');
      lines.push(link);
    }

    lines.push('');
    lines.push('🛒 A vitrine da loja fica no Instagram: ' + CN_STORE_INSTAGRAM);
    lines.push('📣 Telegram: ' + CN_STORE_TELEGRAM);
    lines.push('🏛️ Página principal da Loja Oficial:');
    lines.push(CN_STORE_HOME_URL);

    if (tags) {
      lines.push('');
      lines.push(tags);
    }

    return lines.join('\n');
  }

  function setTextBySelector(root, selector, value) {
    var el = qs(selector, root);
    if (el) el.textContent = safeText(value);
  }

  function appendDetailRow(parent, label, value) {
    if (!parent || !trim(value)) return;

    var row = document.createElement('div');
    row.className = 'cnProductLightbox__detailRow';

    var lab = document.createElement('span');
    lab.textContent = label;

    var val = document.createElement('b');
    val.textContent = value;

    row.appendChild(lab);
    row.appendChild(val);
    parent.appendChild(row);
  }

  function fillLightboxDetails(modal) {
    if (!modal) return;

    var p = modal._cnProduct || {};
    var title = toDisplayTitle(p.title || p.name || modal._cnTitle || 'Produto');
    var desc = getProductDescription(p);
    var mlid = trim(getMlId(p));
    var link = trim(getLink(p));
    var tags = getProductHashtags(p);
    var promo = getPromoInfo(p);

    setTextBySelector(modal, '.cnProductLightbox__detailTitle', title);
    setTextBySelector(modal, '.cnProductLightbox__desc', desc);
    setTextBySelector(modal, '.cnProductLightbox__hash', tags);

    var chips = qs('.cnProductLightbox__chips', modal);
    if (chips) {
      chips.innerHTML = '';
      var badges = parseBadges(p);
      for (var i = 0; i < badges.length && i < 6; i++) {
        var chip = document.createElement('span');
        chip.textContent = badges[i];
        chips.appendChild(chip);
      }
    }

    var meta = qs('.cnProductLightbox__meta', modal);
    if (meta) {
      meta.innerHTML = '';
      appendDetailRow(meta, 'Código Mercado Livre', mlid);
      if (promo.current) appendDetailRow(meta, 'Preço atual', promo.current);
      if (promo.old) appendDetailRow(meta, 'Preço anterior', promo.old);
      if (promo.discount) appendDetailRow(meta, 'Oferta', promo.discount);
      if (promo.checked) appendDetailRow(meta, 'Preço conferido', promo.checked);
    }

    var store = qs('.cnProductLightbox__store', modal);
    if (store) {
      store.innerHTML = '';

      appendDetailRow(store, 'Instagram da vitrine', CN_STORE_INSTAGRAM);
      appendDetailRow(store, 'Telegram', CN_STORE_TELEGRAM);
      appendDetailRow(store, 'Página oficial', CN_STORE_HOME_URL);
    }

    var buy = qs('[data-cn-detail-buy="1"]', modal);
    if (buy) {
      setupBuyButtonVisual(buy, getBuyCtaText(p, false));
      buy.href = link || '#';
      buy.target = '_blank';
      buy.rel = 'noopener noreferrer';
      buy.onclick = function (ev) {
        if (!link) {
          if (ev && ev.preventDefault) ev.preventDefault();
          toast('Link do produto não encontrado');
          return false;
        }

        trackEvent('click_buy_home_lightbox', getTrackProduct(p, {
          placement: 'lightbox_buy',
          source_block: 'image_zoom_details'
        }));

        return openBuy(link, ev);
      };
    }

    var copyLink = qs('[data-cn-detail-copy-link="1"]', modal);
    if (copyLink) {
      copyLink.onclick = function () {
        if (!link) {
          toast('Link do produto não encontrado');
          return;
        }

        trackEvent('click_copy_link_home', getTrackProduct(p, {
          placement: 'lightbox_copy_link',
          source_block: 'image_zoom_details'
        }));

        copyText(link).then(function (ok) { toast(ok ? 'Link copiado ✅' : 'Falha ao copiar'); });
      };
    }

    var copyCaption = qs('[data-cn-detail-copy-caption="1"]', modal);
    if (copyCaption) {
      copyCaption.onclick = function () {
        trackEvent('click_copy_caption_home', getTrackProduct(p, {
          placement: 'lightbox_copy_caption',
          source_block: 'image_zoom_details'
        }));

        copyText(getProductStoreCaption(p)).then(function (ok) { toast(ok ? 'Descrição copiada ✅' : 'Falha ao copiar'); });
      };
    }
  }


  function ensureGalleryLightbox() {
    var existing = qs('#cnProductLightbox');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = 'cnProductLightbox';
    modal.className = 'cnProductLightbox';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '' +
      '<div class="cnProductLightbox__backdrop" data-cn-lightbox-close="1"></div>' +
      '<div class="cnProductLightbox__dialog" role="dialog" aria-modal="true" aria-label="Galeria e detalhes do produto">' +
        '<button class="cnProductLightbox__close" type="button" data-cn-lightbox-close="1" aria-label="Fechar imagem ampliada">×</button>' +
        '<div class="cnProductLightbox__visual">' +
          '<button class="cnProductLightbox__nav cnProductLightbox__nav--prev" type="button" data-cn-lightbox-prev="1" aria-label="Imagem anterior">‹</button>' +
          '<img class="cnProductLightbox__img" alt="Imagem do produto ampliada" />' +
          '<button class="cnProductLightbox__nav cnProductLightbox__nav--next" type="button" data-cn-lightbox-next="1" aria-label="Próxima imagem">›</button>' +
          '<div class="cnProductLightbox__footer">' +
            '<div class="cnProductLightbox__title"></div>' +
            '<div class="cnProductLightbox__counter"></div>' +
          '</div>' +
        '</div>' +
        '<aside class="cnProductLightbox__details" aria-label="Detalhes do produto">' +
          '<div class="cnProductLightbox__eyebrow">Informações do achado</div>' +
          '<h3 class="cnProductLightbox__detailTitle"></h3>' +
          '<p class="cnProductLightbox__desc"></p>' +
          '<div class="cnProductLightbox__chips"></div>' +
          '<div class="cnProductLightbox__meta"></div>' +
          '<div class="cnProductLightbox__storeTitle">Canais oficiais da loja</div>' +
          '<div class="cnProductLightbox__store"></div>' +
          '<div class="cnProductLightbox__hash"></div>' +
          '<div class="cnProductLightbox__detailActions">' +
            '<a class="btn btn--gold btn--tiny cnProductLightbox__buy" data-cn-detail-buy="1" href="#" target="_blank" rel="noopener noreferrer">Comprar</a>' +
            '<button class="btn btn--glass btn--tiny" type="button" data-cn-detail-copy-link="1">Copiar link</button>' +
            '<button class="btn btn--glass btn--tiny" type="button" data-cn-detail-copy-caption="1">Copiar descrição</button>' +
          '</div>' +
        '</aside>' +
      '</div>';

    document.body.appendChild(modal);

    var modalImg = qs('.cnProductLightbox__img', modal);
    if (modalImg) {
      modalImg.onerror = function () {
        var fb = modalImg.getAttribute('data-cn-fallback-src') || '';
        if (fb && modalImg.getAttribute('src') !== fb) {
          modalImg.removeAttribute('data-cn-fallback-src');
          modalImg.src = fb;
          return;
        }
        modal.classList.add('has-image-error');
      };
      modalImg.onload = function () {
        modal.classList.remove('has-image-error');
      };
    }

    modal.addEventListener('click', function (ev) {
      if (!ev) return;
      if (ev.target && ev.target.getAttribute('data-cn-lightbox-close') === '1') {
        closeGalleryLightbox();
      } else if (ev.target && ev.target.getAttribute('data-cn-lightbox-prev') === '1') {
        moveGalleryLightbox(-1);
      } else if (ev.target && ev.target.getAttribute('data-cn-lightbox-next') === '1') {
        moveGalleryLightbox(1);
      }
    });

    document.addEventListener('keydown', function (ev) {
      var m = qs('#cnProductLightbox');
      if (!m || !m.classList.contains('is-open')) return;
      if (ev.key === 'Escape') closeGalleryLightbox();
      if (ev.key === 'ArrowLeft') moveGalleryLightbox(-1);
      if (ev.key === 'ArrowRight') moveGalleryLightbox(1);
    });

    return modal;
  }

  function closeGalleryLightbox() {
    var modal = qs('#cnProductLightbox');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('cnLightboxOpen');
  }

  function warmCurrentModalImage(modal) {
    if (!modal || !modal._cnImages || !modal._cnImages.length) return;
    var idx = modal._cnIndex || 0;
    var target = modal._cnImages[idx] || '';
    if (target) preloadOneGalleryImage(target, true);

    // Aquece só as vizinhas. Nada de baixar galeria inteira na abertura.
    if (modal._cnImages.length > 1) preloadGalleryImages(modal._cnImages, idx, 1, false);
  }

  function updateGalleryLightboxView() {
    var modal = qs('#cnProductLightbox');
    if (!modal || !modal._cnImages || !modal._cnImages.length) return;

    var idx = modal._cnIndex || 0;
    if (idx < 0) idx = 0;
    if (idx >= modal._cnImages.length) idx = modal._cnImages.length - 1;
    modal._cnIndex = idx;

    var img = qs('.cnProductLightbox__img', modal);
    var title = qs('.cnProductLightbox__title', modal);
    var counter = qs('.cnProductLightbox__counter', modal);
    var prev = qs('.cnProductLightbox__nav--prev', modal);
    var next = qs('.cnProductLightbox__nav--next', modal);

    if (img) {
      var target = modal._cnImages[idx] || '';
      var fallback = (modal._cnOriginalImages && modal._cnOriginalImages[idx]) ? modal._cnOriginalImages[idx] : target;

      // ✅ PERFORMANCE: na primeira abertura usa a imagem que já estava no card.
      // Como ela já está em cache, o modal aparece praticamente instantâneo.
      var instant = '';
      if (modal._cnInstantSrc && idx === modal._cnInstantIndex) {
        instant = trim(modal._cnInstantSrc);
        modal._cnInstantSrc = '';
      }

      if (instant) {
        setImageSrcWithFallback(img, instant, fallback || target);
        if (target && target !== instant) preloadOneGalleryImage(target, true);
      } else {
        setImageSrcWithFallback(img, target, fallback);
      }

      warmCurrentModalImage(modal);
    }
    if (title) title.textContent = toDisplayTitle(modal._cnTitle || 'Produto');
    if (counter) counter.textContent = String(idx + 1) + '/' + String(modal._cnImages.length);

    if (prev) prev.classList.toggle('is-hidden', idx <= 0);
    if (next) next.classList.toggle('is-hidden', idx >= modal._cnImages.length - 1);

    fillLightboxDetails(modal);
  }

  function openGalleryLightbox(images, index, title, product, originalImages, instantSrc) {
    if (!images || !images.length) return;
    var modal = ensureGalleryLightbox();
    modal._cnImages = images.slice();
    modal._cnOriginalImages = (originalImages && originalImages.length) ? originalImages.slice() : images.slice();
    modal._cnIndex = Math.max(0, Math.min(Number(index) || 0, images.length - 1));
    modal._cnTitle = safeText(title || 'Produto');
    modal._cnProduct = product || null;
    modal._cnInstantSrc = trim(instantSrc || '');
    modal._cnInstantIndex = modal._cnIndex;

    // Abre a camada imediatamente; a imagem vem da cache do card quando possível.
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('cnLightboxOpen');
    updateGalleryLightboxView();
  }

  function moveGalleryLightbox(delta) {
    var modal = qs('#cnProductLightbox');
    if (!modal || !modal._cnImages || !modal._cnImages.length) return;
    var next = (modal._cnIndex || 0) + delta;
    if (next < 0 || next >= modal._cnImages.length) return;
    modal._cnIndex = next;
    updateGalleryLightboxView();
  }

  function createProductMedia(p, options) {
    options = options || {};
    var images = getImages(p);
    var displayKind = options.variant === 'featured' ? 'featured' : 'quick';
    var displayImages = mapFastImages(images, displayKind);
    // ✅ MODAL RÁPIDO: usa a mesma imagem otimizada do card/featured.
    // Essa imagem normalmente já foi baixada, então o zoom abre sem travar.
    var lightboxImages = displayImages.slice ? displayImages.slice() : mapFastImages(images, displayKind);

    var shell = document.createElement('div');
    shell.className = 'cnMediaShell';
    if (options.variant === 'featured') shell.className += ' cnMediaShell--featured';
    if (options.variant === 'quick') shell.className += ' cnMediaShell--quick';

    var img = document.createElement('img');
    img.className = 'cnImg';
    img.loading = options.loading || 'lazy';
    if (options.fetchPriority) {
      try { img.fetchPriority = options.fetchPriority; } catch (e) {}
      try { img.setAttribute('fetchpriority', options.fetchPriority); } catch (e) {}
    }
    try { img.decoding = 'async'; } catch (e) {}
    img.alt = safeText(options.alt || (p && (p.title || p.sku)) || 'Produto');

    var didScheduleGalleryPreload = false;
    img.onload = function () {
      if (shell.className.indexOf('is-loaded') < 0) shell.className += ' is-loaded';
      shell.className = shell.className.replace(/\bis-gallery-loading\b/g, '').replace(/\s{2,}/g, ' ');
      img.removeAttribute('aria-busy');

      if (!didScheduleGalleryPreload && images.length > 1 && (options.preload === true || options.variant === 'featured')) {
        didScheduleGalleryPreload = true;
        // ✅ PERFORMANCE: não baixa a galeria inteira na entrada da loja.
        // Aquece só a próxima imagem depois que o card principal carregou.
        scheduleIdleTask(function () { preloadGalleryImages(displayImages, 0, 1, options.variant === 'featured'); }, 500);
      }
    };

    img.onerror = function () {
      var fb = img.getAttribute('data-cn-fallback-src') || '';
      if (fb && img.getAttribute('src') !== fb) {
        img.removeAttribute('data-cn-fallback-src');
        img.src = fb;
        return;
      }
      shell.className = shell.className.replace(/\bis-gallery-loading\b/g, '').replace(/\s{2,}/g, ' ');
      img.removeAttribute('aria-busy');
    };

    if (images.length) {
      if (options.deferSrc === true) {
        if (images[0] && displayImages[0] !== images[0]) img.setAttribute('data-cn-fallback-src', images[0]);
        img.setAttribute('data-cn-src', displayImages[0]);
        observeDeferredImage(img);
      } else {
        setImageSrcWithFallback(img, displayImages[0], images[0]);
      }
    } else {
      img.style.display = 'none';
    }

    shell.appendChild(img);

    if (images.length > 1) {
      shell.className += ' cnMediaShell--gallery';
      shell.setAttribute('data-gallery-count', String(images.length));

      // ✅ PERFORMANCE: evita baixar todas as imagens da galeria logo na entrada.
      // O carrossel aquece sob demanda no hover/toque e ao abrir o modal.

      var count = document.createElement('div');
      count.className = 'cnGalleryCount';
      count.textContent = '1/' + images.length;
      shell.appendChild(count);

      var prevArrow = document.createElement('button');
      prevArrow.type = 'button';
      prevArrow.className = 'cnGalleryArrow cnGalleryArrow--prev is-hidden';
      prevArrow.setAttribute('aria-label', 'Imagem anterior');
      prevArrow.textContent = '‹';
      shell.appendChild(prevArrow);

      var arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'cnGalleryArrow cnGalleryArrow--next';
      arrow.setAttribute('aria-label', 'Próxima imagem do produto');
      arrow.textContent = '›';
      shell.appendChild(arrow);

      var zoom = document.createElement('button');
      zoom.type = 'button';
      zoom.className = 'cnGalleryZoom';
      zoom.setAttribute('aria-label', 'Ampliar imagem do produto');
      zoom.textContent = 'Ampliar';
      shell.appendChild(zoom);

      var dots = document.createElement('div');
      dots.className = 'cnGalleryDots';
      var dotButtons = [];
      for (var i = 0; i < images.length; i++) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = i === 0 ? 'cnGalleryDot is-active' : 'cnGalleryDot';
        dot.setAttribute('aria-label', 'Imagem ' + (i + 1) + ' de ' + images.length);
        (function (pos) {
          dot.addEventListener('click', function (ev) {
            if (ev && ev.preventDefault) ev.preventDefault();
            if (ev && ev.stopPropagation) ev.stopPropagation();
            setIndex(pos);
          });
        })(i);
        dotButtons.push(dot);
        dots.appendChild(dot);
      }
      shell.appendChild(dots);

      var currentIndex = 0;
      var touchStartX = 0;

      function warmGalleryNow() {
        preloadGalleryImages(displayImages, currentIndex, 2, options.variant === 'featured');
      }

      try { shell.addEventListener('pointerdown', warmGalleryNow, { passive: true }); } catch (e0) {}
      try { shell.addEventListener('touchstart', warmGalleryNow, { passive: true }); } catch (e1) {}
      try { shell.addEventListener('mouseenter', warmGalleryNow); } catch (e2) {}

      function refreshControls() {
        count.textContent = String(currentIndex + 1) + '/' + String(images.length);
        prevArrow.classList.toggle('is-hidden', currentIndex <= 0);
        arrow.classList.toggle('is-hidden', currentIndex >= images.length - 1);
        for (var d = 0; d < dotButtons.length; d++) {
          if (d === currentIndex) dotButtons[d].classList.add('is-active');
          else dotButtons[d].classList.remove('is-active');
        }
      }

      function setIndex(nextIndex) {
        if (!images.length) return;
        if (nextIndex < 0 || nextIndex >= images.length) return;

        var target = displayImages[nextIndex] || images[nextIndex];
        var originalTarget = images[nextIndex] || target;
        if (!target) return;

        currentIndex = nextIndex;

        // Aquece o alvo e as imagens vizinhas antes/depois da troca.
        // No Produto do Dia a prioridade é alta porque o usuário realmente está clicando no carrossel.
        preloadOneGalleryImage(target, options.variant === 'featured');
        preloadGalleryImages(displayImages, currentIndex, 2, options.variant === 'featured');

        if (img.getAttribute('src') !== target) {
          if (shell.className.indexOf('is-gallery-loading') < 0) shell.className += ' is-gallery-loading';
          img.setAttribute('aria-busy', 'true');
          setImageSrcWithFallback(img, target, originalTarget);
        }

        refreshControls();
      }

      function nextImage(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.stopPropagation) ev.stopPropagation();
        setIndex(currentIndex + 1);
      }

      arrow.addEventListener('click', nextImage);
      prevArrow.addEventListener('click', function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.stopPropagation) ev.stopPropagation();
        setIndex(currentIndex - 1);
      });

      if (zoom) {
        zoom.addEventListener('click', function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
          openGalleryLightbox(lightboxImages.length ? lightboxImages : images, currentIndex, options.alt || (p && p.title) || 'Produto', p, images, img.currentSrc || img.src || '');
        });
        img.addEventListener('click', function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
          openGalleryLightbox(lightboxImages.length ? lightboxImages : images, currentIndex, options.alt || (p && p.title) || 'Produto', p, images, img.currentSrc || img.src || '');
        });
      }

      shell.addEventListener('touchstart', function (ev) {
        if (!ev.touches || !ev.touches.length) return;
        touchStartX = ev.touches[0].clientX;
      }, { passive: true });

      shell.addEventListener('touchend', function (ev) {
        if (!touchStartX || !ev.changedTouches || !ev.changedTouches.length) return;
        var dx = ev.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 38) {
          setIndex(currentIndex + (dx < 0 ? 1 : -1));
        }
        touchStartX = 0;
      }, { passive: true });

      refreshControls();
    } else if (images.length === 1) {
      var singleZoom = document.createElement('button');
      singleZoom.type = 'button';
      singleZoom.className = 'cnGalleryZoom';
      singleZoom.setAttribute('aria-label', 'Ampliar imagem do produto');
      singleZoom.textContent = 'Ampliar';
      shell.appendChild(singleZoom);

      singleZoom.addEventListener('click', function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.stopPropagation) ev.stopPropagation();
        openGalleryLightbox(lightboxImages.length ? lightboxImages : images, 0, options.alt || (p && p.title) || 'Produto', p, images, img.currentSrc || img.src || '');
      });
      img.addEventListener('click', function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.stopPropagation) ev.stopPropagation();
        openGalleryLightbox(lightboxImages.length ? lightboxImages : images, 0, options.alt || (p && p.title) || 'Produto', p, images, img.currentSrc || img.src || '');
      });
    }

    return shell;
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
    var rawBase = Array.isArray(activeList) ? activeList : [];
    var max = parseInt(limit, 10);
    if (!isFinite(max) || max < 1) max = QUICK_HOME_LIMIT;

    var base = [];
    for (var bi = 0; bi < rawBase.length; bi++) {
      // Produto do Dia não entra na Vitrine Rápida enquanto estiver em destaque.
      // Assim ele só volta para a grade quando deixar de ser featured.
      if (isFeatured(rawBase[bi])) continue;
      base.push(rawBase[bi]);
    }

    if (!base.length) base = rawBase.slice();

    var fallbackSource = Array.isArray(sortedList) ? sortedList.slice() : sortRelev(base);
    var fallback = [];
    for (var fi = 0; fi < fallbackSource.length; fi++) {
      if (isFeatured(fallbackSource[fi]) && base.length < rawBase.length) continue;
      fallback.push(fallbackSource[fi]);
    }
    if (!fallback.length) fallback = fallbackSource.slice();

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
    var usedKeys = {};
    var p, order, key, pos;

    ordered.sort(function (a, b) {
      var oa = getQuickHomeOrder(a);
      var ob = getQuickHomeOrder(b);
      if (oa !== ob) return oa - ob;

      // Quando houver conflito de posição, prioriza o produto com issue/edit mais recente.
      // Ex.: edição #213 do produto #100 deve ganhar da publicação antiga #199 na mesma posição 10.
      var pa = getQuickPriority(a);
      var pb = getQuickPriority(b);
      if (pa !== pb) return pb - pa;

      var ta = lower(a.title || a.name || a.sku);
      var tb = lower(b.title || b.name || b.sku);
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    });

    for (i = 0; i < ordered.length; i++) {
      p = ordered[i];
      order = getQuickHomeOrder(p);
      if (order === null || order < 1 || order > max) continue;
      key = getProductKey(p);
      if (!key || usedKeys[key]) continue;
      pos = order - 1;
      if (slots[pos]) continue;
      slots[pos] = p;
      usedKeys[key] = true;
    }

    unordered = sortQuickManual(unordered);
    for (i = 0; i < unordered.length; i++) {
      p = unordered[i];
      key = getProductKey(p);
      if (!key || usedKeys[key]) continue;
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
      mode: 'positional_priority',
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
      .replace(/Mercado livre/gi, 'Mercado Livre')
      // Polimento visual: evita título grudado como "Tudo em 1 400ml".
      .replace(/(Tudo em 1)\s+(\d+\s*(?:ml|g|kg|un|unidades?)\b)/gi, '$1 — $2')
      .replace(/\b(\d+)\s+(ml|g|kg)\b/gi, '$1$2');
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
    cardImg.appendChild(createProductMedia(p, {
      alt: safeText(p.title || 'Produto do Dia'),
      loading: 'eager',
      fetchPriority: 'high',
      preload: true,
      variant: 'featured'
    }));
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

    var promoBox = createPromoBox(p, false);
    if (promoBox) pad.appendChild(promoBox);

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

    var row1 = document.createElement('div');
    row1.className = 'cnRow';

    var aBuy = document.createElement('a');
    aBuy.className = 'btn btn--gold btn--tiny btn--buy-primary cnActionPrimary';
    var isMobileFeaturedLayout = isMobileHomeLayout();
    setupBuyButtonVisual(aBuy, isMobileFeaturedLayout ? 'Comprar' : getBuyCtaText(p, false));
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
    bCopyId.className = 'btn btn--glass btn--tiny cnActionSecondary cnFeaturedCopyId';
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
    if (!isMobileFeaturedLayout) row1.appendChild(bCopyId);

    var bCopyLink = document.createElement('button');
    bCopyLink.type = 'button';
    bCopyLink.className = 'btn btn--glass btn--tiny cnActionSecondary cnFeaturedCopyLink';
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

    applyFeaturedMobileActionsLikeQuick(row1, aBuy, bCopyLink);

    var aStore = document.createElement('a');
    aStore.className = 'btn btn--glass btn--tiny cnActionTertiary cnFeaturedOpenStore';
    aStore.setAttribute('data-cn-track-owned', '1');
    aStore.setAttribute('data-cn-role', 'open-store');
    aStore.textContent = 'Ver todos os produtos';
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
    if (!isMobileFeaturedLayout) row1.appendChild(aStore);

    pad.appendChild(row1);

    var scarcity = document.createElement('div');
    scarcity.className = 'cnScarcityLine';
    scarcity.textContent = 'Confira preço, frete e disponibilidade no Mercado Livre antes de concluir.';
    pad.appendChild(scarcity);

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

    var quickIsMobile = isMobileHomeLayout();
    // Performance geral: Produto do Dia fica prioritário; Vitrine Rápida carrega sob demanda.
    // Mobile: só a primeira imagem da Vitrine Rápida fica pronta para entrar; o resto espera chegar perto da tela.
    // PC: as primeiras imagens ficam normais e o restante também usa IntersectionObserver.
    var quickEagerLimit = quickIsMobile ? 0 : 1;
    var quickDeferAfter = quickIsMobile ? 0 : 3;
    card.appendChild(createProductMedia(p, {
      alt: safeText(p.title || p.sku || 'Produto'),
      loading: idx < quickEagerLimit ? 'eager' : 'lazy',
      fetchPriority: idx < quickEagerLimit ? 'high' : 'low',
      preload: false,
      deferSrc: idx > quickDeferAfter,
      variant: 'quick'
    }));

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

    // Preço/oferta fica concentrado no Produto do Dia para não quebrar a Vitrine Rápida.

    var mlid = getMlId(p);
    var meta = document.createElement('div');
    meta.className = 'cnMeta';
    meta.innerHTML = '<span>Código</span><b>' + safeText(mlid) + '</b>';
    pad.appendChild(meta);

    var row = document.createElement('div');
    row.className = 'cnRow';

    var buy = document.createElement('a');
    buy.className = 'btn btn--gold btn--tiny btn--buy-primary cnQuickPrimary';
    setupBuyButtonVisual(buy, getBuyCtaText(p, true));
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

    var cLink = document.createElement('button');
    cLink.className = 'btn btn--glass btn--tiny cnQuickSecondary';
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

      if (!link) {
        toast('Link do produto não encontrado');
        return;
      }

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

    fetch('./produtos.json', { cache: 'default' })
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


/* REAL17 — marcador limpo do brilho/reflexo nos botões Comprar
   - envolve o texto em .cnBuyLabel para centralizar corretamente
   - cria a camada .cnBuySheenFx para o reflexo passar por cima sem depender de ::before/::after */
(function cnReal17ComprarMarkerExternal(){
  "use strict";

  function textOf(el){
    if (!el) return "";
    var label = null;
    if (el.children) {
      for (var i = 0; i < el.children.length; i++) {
        if (el.children[i].classList && el.children[i].classList.contains("cnBuyLabel")) {
          label = el.children[i];
          break;
        }
      }
    }
    return String(((label && label.textContent) || el.textContent) || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findOwnChildByClass(el, className){
    if (!el || !el.children) return null;
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].classList && el.children[i].classList.contains(className)) return el.children[i];
    }
    return null;
  }

  function findOwnFx(el){
    return findOwnChildByClass(el, "cnBuySheenFx");
  }

  function findOwnLabel(el){
    return findOwnChildByClass(el, "cnBuyLabel");
  }

  function ensureLabel(el){
    if (!el) return;
    var currentLabel = findOwnLabel(el);
    if (currentLabel) return;

    var labelText = String((el.textContent || "").replace(/\s+/g, " ").trim());
    if (!labelText) labelText = "Comprar";

    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    var label = document.createElement("span");
    label.className = "cnBuyLabel";
    label.textContent = labelText;
    el.appendChild(label);
    el.setAttribute("aria-label", labelText);
  }

  function ensureFx(el){
    if (!el || findOwnFx(el)) return;
    var fx = document.createElement("span");
    fx.className = "cnBuySheenFx";
    fx.setAttribute("aria-hidden", "true");
    el.appendChild(fx);
  }

  function removeFx(el){
    var fx = findOwnFx(el);
    if (fx) fx.parentNode.removeChild(fx);
  }

  function mark(){
    var roots = [document.getElementById("featured"), document.getElementById("quickGrid")];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root) continue;
      var nodes = root.querySelectorAll("a, button");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var txt = textOf(el);
        var isBuy = txt.indexOf("comprar") !== -1 && txt.indexOf("copiar") === -1;
        if (isBuy) {
          el.setAttribute("data-cn-buy-shine", "on");
          ensureLabel(el);
          ensureFx(el);
        } else {
          el.removeAttribute("data-cn-buy-shine");
          removeFx(el);
        }
      }
    }
  }

  function start(){
    mark();
    setTimeout(mark, 80);
    setTimeout(mark, 220);
    setTimeout(mark, 520);
    setTimeout(mark, 1200);
    setTimeout(mark, 2600);

    var ids = ["featured", "quickGrid"];
    for (var i = 0; i < ids.length; i++) {
      var root = document.getElementById(ids[i]);
      if (!root || !window.MutationObserver) continue;
      new MutationObserver(mark).observe(root, { childList:true, subtree:true, characterData:true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

