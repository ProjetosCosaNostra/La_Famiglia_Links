/* script.js — Central Premium (Home)
   ✅ FIX MOBILE: reescrito para rodar em navegadores Android mais antigos.
   - Sem dateStyle/timeStyle (quebra em alguns celulares)
   - Sem replaceAll / toSorted / optional chaining
   - Copy com fallback (execCommand)
*/
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function safeText(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(s) { return safeText(s).replace(/^\s+|\s+$/g, ''); }
  function lower(s) { return safeText(s).toLowerCase(); }

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

  function parseBadges(p) {
    var b = p.badges || p.tags || p.badge || p.badges_tags || p.badgesTags;
    if (Array.isArray(b)) return b;
    if (typeof b === 'string') {
      return b.split(',').map(function (x) { return trim(x); }).filter(function (x) { return x; });
    }
    return [];
  }

  function getImage(p) {
    return p.image_url || p.image || p.img || p.imageUrl || p.imageURL || p.image_path || p.imagePath || p.media || p.cover || '';
  }

  function getLink(p) {
    return p.link || p.url || p.href || p.mercadolivre_link || p.mercado_livre_link || p.ml_link || '';
  }

  function getMlId(p) {
    return p.ml_id || p.id_ml || p.mercadolivre_id || p.mercado_livre_id || p.id || '';
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

  function formatIsoToPt(iso) {
    iso = safeText(iso);
    // yyyy-mm-ddTHH:MM:SSZ
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

  function renderFeatured(p) {
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

    var wrap = document.createElement('div');
    wrap.className = 'cnFeaturedWrap';

    // Card imagem
    var cardImg = document.createElement('div');
    cardImg.className = 'cnCard';
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

    // Card info
    var cardInfo = document.createElement('div');
    cardInfo.className = 'cnCard';
    var pad = document.createElement('div');
    pad.className = 'cnCardPad';

    var h = document.createElement('h3');
    h.className = 'cnTitle';
    h.textContent = safeText(p.title || p.name || p.sku || 'Produto do Dia');
    pad.appendChild(h);

    var badges = parseBadges(p);
    if (badges.length) {
      var bwrap = document.createElement('div');
      bwrap.className = 'cnBadges';
      for (var i = 0; i < badges.length && i < 6; i++) {
        var sp = document.createElement('span');
        sp.textContent = badges[i];
        bwrap.appendChild(sp);
      }
      pad.appendChild(bwrap);
    }

    var steps = document.createElement('ol');
    steps.className = 'cnSteps';
    var mlid = getMlId(p);
    steps.innerHTML =
      '<li>Abra o app/site do <b>Mercado Livre</b></li>' +
      '<li>Cole o ID na busca: <b>' + safeText(mlid) + '</b></li>' +
      '<li>Ou clique em <b>COMPRAR AGORA</b> (abre direto)</li>';
    pad.appendChild(steps);

    var row1 = document.createElement('div');
    row1.className = 'cnRow';
    var aBuy = document.createElement('a');
    aBuy.className = 'btn btn--gold btn--tiny';
    aBuy.textContent = 'COMPRAR AGORA';
    aBuy.href = getLink(p) || '#';
    aBuy.target = '_blank';
    aBuy.rel = 'noopener';
    row1.appendChild(aBuy);

    var bCopyId = document.createElement('button');
    bCopyId.type = 'button';
    bCopyId.className = 'btn btn--glass btn--tiny';
    bCopyId.textContent = 'Copiar ID';
    bCopyId.onclick = function () {
      copyText(mlid).then(function (ok) { toast(ok ? 'ID copiado ✅' : 'Falha ao copiar'); });
    };
    row1.appendChild(bCopyId);

    var bCopyLink = document.createElement('button');
    bCopyLink.type = 'button';
    bCopyLink.className = 'btn btn--glass btn--tiny';
    bCopyLink.textContent = 'Copiar Link';
    bCopyLink.onclick = function () {
      var link = getLink(p);
      copyText(link).then(function (ok) { toast(ok ? 'Link copiado ✅' : 'Falha ao copiar'); });
    };
    row1.appendChild(bCopyLink);

    var bAlt = document.createElement('button');
    bAlt.type = 'button';
    bAlt.className = 'btn btn--glass btn--tiny';
    bAlt.textContent = 'Copiar Link Alternativo';
    bAlt.onclick = function () {
      // alternativa: abrir pela Loja completa (mesma página) — útil se meli.la bloquear
      var alt = (location.origin + location.pathname.replace(/index\.html$/,'') + 'loja.html');
      copyText(alt).then(function (ok) { toast(ok ? 'Link alternativo copiado ✅' : 'Falha ao copiar'); });
    };
    row1.appendChild(bAlt);

    var aStore = document.createElement('a');
    aStore.className = 'btn btn--glass btn--tiny';
    aStore.textContent = 'Abrir Loja Completa';
    aStore.href = './loja.html';
    row1.appendChild(aStore);

    pad.appendChild(row1);

    var meta = document.createElement('div');
    meta.className = 'cnMeta';
    meta.innerHTML = '<span style="opacity:.85">ID Mercado Livre:</span> <b>' + safeText(mlid) + '</b>';
    pad.appendChild(meta);

    var mini = document.createElement('div');
    mini.className = 'cnMini';
    mini.innerHTML = 'Melhor funil: <b>Story com sticker de LINK</b> + <b>Loja na Bio</b>.';
    pad.appendChild(mini);

    cardInfo.appendChild(pad);
    wrap.appendChild(cardInfo);

    root.appendChild(wrap);
  }

  function makeQuickCard(p) {
    var card = document.createElement('article');
    card.className = 'cnProd';

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
    h3.textContent = safeText(p.title || p.name || p.sku || 'Produto');
    pad.appendChild(h3);

    var badges = parseBadges(p);
    if (badges.length) {
      var bwrap = document.createElement('div');
      bwrap.className = 'cnBadges';
      for (var i = 0; i < badges.length && i < 4; i++) {
        var sp = document.createElement('span');
        sp.textContent = badges[i];
        bwrap.appendChild(sp);
      }
      pad.appendChild(bwrap);
    }

    var mlid = getMlId(p);
    var meta = document.createElement('div');
    meta.className = 'cnMeta';
    meta.innerHTML = '<span style="opacity:.85">ID:</span> <b>' + safeText(mlid) + '</b>';
    pad.appendChild(meta);

    var row = document.createElement('div');
    row.className = 'cnRow';

    var buy = document.createElement('a');
    buy.className = 'btn btn--gold btn--tiny';
    buy.textContent = 'Comprar';
    buy.href = getLink(p) || '#';
    buy.target = '_blank';
    buy.rel = 'noopener';
    row.appendChild(buy);

    var cId = document.createElement('button');
    cId.className = 'btn btn--glass btn--tiny';
    cId.type = 'button';
    cId.textContent = 'Copiar ID';
    cId.onclick = function () {
      copyText(mlid).then(function (ok) { toast(ok ? 'ID copiado ✅' : 'Falha ao copiar'); });
    };
    row.appendChild(cId);

    var cLink = document.createElement('button');
    cLink.className = 'btn btn--glass btn--tiny';
    cLink.type = 'button';
    cLink.textContent = 'Copiar Link';
    cLink.onclick = function () {
      var link = getLink(p);
      copyText(link).then(function (ok) { toast(ok ? 'Link copiado ✅' : 'Falha ao copiar'); });
    };
    row.appendChild(cLink);

    pad.appendChild(row);
    card.appendChild(pad);

    return card;
  }

  function renderQuick(list) {
    var grid = qs('#quickGrid');
    if (!grid) return;
    grid.innerHTML = '';

    var limit = 9; // ✅ igual no PC (prévia)
    var n = Math.min(limit, list.length);
    for (var i = 0; i < n; i++) {
      grid.appendChild(makeQuickCard(list[i]));
    }
    setQuickCount(n);
  }

  function bindSearch(state) {
    var input = qs('#qHome');
    var clear = qs('#qClear');
    if (!input) return;

    function apply() {
      var q = lower(input.value);
      var out = [];
      if (!q) {
        out = state.sorted;
      } else {
        for (var i = 0; i < state.sorted.length; i++) {
          var p = state.sorted[i];
          var blob = lower((p.title || '') + ' ' + parseBadges(p).join(' ') + ' ' + getMlId(p) + ' ' + (p.sku || ''));
          if (blob.indexOf(q) >= 0) out.push(p);
        }
      }
      renderQuick(out);
    }

    input.addEventListener('input', apply);
    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        apply();
      });
    }
    apply();
  }

  function bindButtons() {
    var btnCopyLoja = qs('#copyLoja');
    if (btnCopyLoja) {
      btnCopyLoja.addEventListener('click', function () {
        var link = location.origin + location.pathname.replace(/index\.html$/,'');
        copyText(link).then(function (ok) { toast(ok ? 'Link da vitrine copiado ✅' : 'Falha ao copiar'); });
      });
    }

    var btnCopyHome = qs('[data-copy="bio"]');
    if (btnCopyHome) {
      btnCopyHome.addEventListener('click', function () {
        var link = location.origin + location.pathname;
        copyText(link).then(function (ok) { toast(ok ? 'Link da home copiado ✅' : 'Falha ao copiar'); });
      });
    }

    var btnRefresh = qs('#refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', function () {
        location.reload();
      });
    }
  }

  function setLastUpdate(iso) {
    var el = qs('#lastUpdate');
    if (!el) return;
    el.textContent = iso ? formatIsoToPt(iso) : 'agora';
  }

  function init() {
    bindButtons();

    // ano
    var y = new Date().getFullYear();
    var yEl = qs('#year');
    if (yEl) yEl.textContent = String(y);

    var state = { products: [], active: [], sorted: [], featured: null, updated_at: '' };

    fetch('./produtos.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('fetch produtos.json'); return r.json(); })
      .then(function (j) {
        var list = j.products || j.items || [];
        state.updated_at = j.updated_at || j.updatedAt || (j.meta && (j.meta.updated_at || j.meta.updatedAt)) || '';
        state.products = Array.isArray(list) ? list : [];
        state.active = state.products.filter(isActive);
        state.sorted = sortRelev(state.active);

        setTotals(state.active.length);
        setLastUpdate(state.updated_at);

        // featured
        var feat = null;
        for (var i = 0; i < state.sorted.length; i++) {
          if (isFeatured(state.sorted[i])) { feat = state.sorted[i]; break; }
        }
        if (!feat) feat = state.sorted.length ? state.sorted[0] : null;
        state.featured = feat;

        renderFeatured(state.featured);
        bindSearch(state);

        // também atualiza o CTA flutuante
        qsa('[data-total-products]').forEach(function (el) { el.textContent = String(state.active.length); });
      })
      .catch(function (e) {
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
