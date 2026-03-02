/* ==========================================================
   Arquivo: loja.js
   Página : Loja Completa (loja.html)
   Objetivo (PRO):
     - Renderizar produtos (produtos.json)
     - Produto do Dia (featured real)
     - Filtro por texto + filtro por categoria REAL (sem lixo de specs)
     - Ordenação + paginação
     - Export: copiar/baixar listas (TXT/CSV)
     - Mobile impecável (sem botões gigantes)
     - Modal “Ver todas” categorias (com busca)
     - Compatível com IG/FB in-app (abrir link ML com fallback)
   ========================================================== */

(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const ADMIN = new URLSearchParams(location.search).get("admin") === "1";
  const PAGE_SIZE = 60;

  // ================
  // Toast / Clipboard
  // ================
  const toastEl = $("#toast");
  function showToast(msg = "Copiado ✅", ms = 1400) {
    if (!toastEl) return;
    toastEl.textContent = String(msg || "");
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  async function copyText(txt) {
    const v = String(txt ?? "");
    try {
      await navigator.clipboard.writeText(v);
      showToast("Copiado ✅");
    } catch {
      try {
        const t = document.createElement("textarea");
        t.value = v;
        t.style.position = "fixed";
        t.style.left = "-9999px";
        document.body.appendChild(t);
        t.focus();
        t.select();
        document.execCommand("copy");
        t.remove();
        showToast("Copiado ✅");
      } catch {
        showToast("Falha ao copiar", 1800);
      }
    }
  }

  // =================
  // Text / URL helpers
  // =================
  function stripTags(s) {
    return String(s ?? "").replace(/<[^>]*>/g, " ");
  }
  function cleanText(s) {
    return stripTags(s).replace(/\s+/g, " ").trim();
  }
  function cleanUrl(u) {
    let raw = String(u ?? "").trim();
    if (!raw) return "";
    raw = raw.replace(/^[\s"'`]+/, "");
    raw = raw.replace(/[\s"'`]+$/, "");
    raw = raw.replace(/[)"'`\\]+$/g, "");
    return raw.trim();
  }
  function ensureHttpUrl(u) {
    let s = cleanUrl(u);
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("//")) return "https:" + s;
    if (/^(mercadolivre|mercadolibre)\./i.test(s)) return "https://" + s;
    if (/^meli\./i.test(s)) return "https://" + s;
    if (s.startsWith("meli.la/")) return "https://" + s;
    if (s.startsWith("meli.co/")) return "https://" + s;
    return s;
  }

  function hostOf(url) {
    try {
      const fixed = ensureHttpUrl(url);
      const u = new URL(String(fixed || ""));
      let h = (u.hostname || "").toLowerCase().trim();
      if (h.startsWith("www.")) h = h.slice(4);
      return h;
    } catch {
      return "";
    }
  }
  function isMLHost(host) {
    const h = String(host || "").toLowerCase().trim();
    if (!h) return false;
    if (h.includes("mercadolivre") || h.includes("mercadolibre")) return true;
    if (h === "meli.la" || h === "meli.co") return true;
    if (/^meli\.[a-z]{2,6}$/.test(h)) return true;
    return false;
  }
  function isProbablyValidLink(u) {
    const fixed = ensureHttpUrl(u);
    const x = String(fixed ?? "").toLowerCase().trim();
    if (!x) return false;
    if (x.includes("github.com/user-attachments/assets")) return false;
    const h = hostOf(x);
    return isMLHost(h);
  }

  function pickBestLink(raw) {
    const open = ensureHttpUrl(raw.open_url || raw.link || raw.url || "");
    const check = ensureHttpUrl(raw.check_url || "");
    const canonical = ensureHttpUrl(raw.canonical_url || "");
    const resolved = ensureHttpUrl(raw.resolved_url || "");
    const shorty = ensureHttpUrl(raw.short_url || "");
    const candidates = [open, check, canonical, resolved, shorty].filter(Boolean);
    const primary = candidates.find(isProbablyValidLink) || "";
    const alt = candidates.find((c) => c && c !== primary && isProbablyValidLink(c)) || "";
    return { primary, alt, open, check, canonical, resolved, shorty };
  }

  function bestBuyUrl(p) {
    return ensureHttpUrl(
      p.buy_url ||
      p.open_url ||
      p.check_url ||
      p.canonical_url ||
      p.short_url ||
      p.resolved_url ||
      ""
    );
  }

  // IG/FB in-app: tenta nova aba; se bloquear, cai no mesmo tab.
  function openBuy(url) {
    const u = ensureHttpUrl(url);
    if (!u) return;
    try {
      const w = window.open(u, "_blank", "noopener,noreferrer");
      if (!w) window.location.href = u;
    } catch {
      window.location.href = u;
    }
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#039;");
  }

  function safeArray(x) {
    return Array.isArray(x) ? x : [];
  }

  // =========================
  // Imagens: premium smart-fit
  // =========================
  const CN_IMAGE_MODE = "smart";   // smart | contain | cover
  const CN_SMART_THRESHOLD = 0.12;
  const CN_BG_BLUR_PX = 18;
  const CN_BG_OPACITY = 0.35;

  const CN_PLACEHOLDER_IMG =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700">
        <defs>
          <radialGradient id="g" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stop-color="#2a2417"/>
            <stop offset="55%" stop-color="#0f0f12"/>
            <stop offset="100%" stop-color="#07070a"/>
          </radialGradient>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f2d27a"/>
            <stop offset="50%" stop-color="#d7b058"/>
            <stop offset="100%" stop-color="#8b6a2a"/>
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="0.65"/>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <rect x="42" y="42" width="816" height="616" rx="28" ry="28"
              fill="rgba(255,255,255,0.02)" stroke="rgba(215,176,88,0.28)" stroke-width="2"/>
        <g filter="url(#shadow)">
          <text x="50%" y="44%" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
                font-size="56" fill="url(#gold)" letter-spacing="6">COSA NOSTRA</text>
          <text x="50%" y="52%" text-anchor="middle" font-family="Arial, sans-serif"
                font-size="22" fill="rgba(255,255,255,0.78)" letter-spacing="2">IMAGEM INDISPONÍVEL</text>
          <text x="50%" y="60%" text-anchor="middle" font-family="Arial, sans-serif"
                font-size="18" fill="rgba(215,176,88,0.88)" letter-spacing="1.2">Atualize o campo "image" no produtos.json</text>
        </g>
      </svg>`
    );

  function applyImageFixes(root) {
    const scope = root || document;
    const imgs = scope.querySelectorAll('img[data-cnimg="1"]');

    imgs.forEach((img) => {
      try { img.loading = "lazy"; } catch {}
      try { img.decoding = "async"; } catch {}
      img.setAttribute("referrerpolicy", "no-referrer");

      const parent = img.parentElement;

      img.style.width = "100%";
      img.style.height = "100%";
      img.style.display = "block";
      img.style.position = "relative";
      img.style.zIndex = "2";

      if (parent && !parent.dataset.cnImgReady) {
        parent.dataset.cnImgReady = "1";
        parent.style.position = "relative";
        parent.style.overflow = "hidden";
        parent.style.display = "flex";
        parent.style.alignItems = "center";
        parent.style.justifyContent = "center";
        parent.style.background = "rgba(0,0,0,0.25)";

        const bg = document.createElement("div");
        bg.className = "cnImgBg";
        bg.style.position = "absolute";
        bg.style.inset = "0";
        bg.style.backgroundPosition = "center";
        bg.style.backgroundRepeat = "no-repeat";
        bg.style.backgroundSize = "cover";
        bg.style.filter = `blur(${CN_BG_BLUR_PX}px) saturate(1.12) brightness(0.80)`;
        bg.style.transform = "scale(1.15)";
        bg.style.opacity = String(CN_BG_OPACITY);
        bg.style.pointerEvents = "none";
        bg.style.zIndex = "1";
        parent.insertBefore(bg, parent.firstChild);

        const vignette = document.createElement("div");
        vignette.className = "cnImgVignette";
        vignette.style.position = "absolute";
        vignette.style.inset = "0";
        vignette.style.background =
          "radial-gradient(circle at 50% 30%, rgba(0,0,0,0.05), rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.78) 100%)";
        vignette.style.pointerEvents = "none";
        vignette.style.zIndex = "1";
        parent.insertBefore(vignette, parent.firstChild);
      }

      function setBg(url) {
        if (!parent) return;
        const bg = parent.querySelector(":scope > .cnImgBg");
        if (bg) bg.style.backgroundImage = url ? `url("${url}")` : "none";
      }

      function decideFit() {
        if (!parent) return "contain";
        if (CN_IMAGE_MODE === "contain") return "contain";
        if (CN_IMAGE_MODE === "cover") return "cover";

        const iw = img.naturalWidth || 0;
        const ih = img.naturalHeight || 0;
        const cw = parent.clientWidth || 1;
        const ch = parent.clientHeight || 1;

        const imgR = iw && ih ? (iw / ih) : 1;
        const boxR = cw / ch;

        if (imgR < (boxR - CN_SMART_THRESHOLD)) return "contain";
        return "cover";
      }

      img.addEventListener("load", () => {
        const fit = decideFit();
        img.style.objectFit = fit;
        setBg(img.currentSrc || img.src || "");

        if (parent) {
          const bg = parent.querySelector(":scope > .cnImgBg");
          const v = parent.querySelector(":scope > .cnImgVignette");
          const show = (fit === "contain");
          if (bg) bg.style.display = show ? "block" : "none";
          if (v) v.style.display = show ? "block" : "none";
        }
      }, { once: true });

      img.addEventListener("error", () => {
        img.src = CN_PLACEHOLDER_IMG;
        img.style.objectFit = "contain";
        img.style.opacity = "0.94";
        setBg("");
      }, { once: true });
    });
  }
  // =========================
  // Data normalize / dedupe
  // =========================
  function normalizeProducts(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.produtos)) return data.produtos;
    return [];
  }

  function cloneObj(o) {
    try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o || {})); }
  }

  function adaptForUI(rawProduct) {
    const raw = cloneObj(rawProduct || {});
    const sku = cleanText(raw.sku || raw.slug || raw.key || "");
    const title = cleanText(raw.title || raw.nome || raw.name || raw.titulo || "");
    const id_busca = cleanText(raw.id_busca || raw.idML || raw.id_ml || raw.ml_id || raw.id || "");

    const badges = safeArray(raw.badges || raw.tags || raw.categorias || [])
      .map(cleanText)
      .filter(Boolean);

    const active =
      (raw.active !== undefined) ? !!raw.active :
      (raw.ativo !== undefined) ? !!raw.ativo :
      true;

    const featured =
      (raw.featured === true) || (raw.destaque === true) || (raw.is_featured === true);

    const links = pickBestLink(raw);
    const image = cleanUrl(raw.image || raw.imagem || raw.img || "");
    const price_text = cleanText(raw.price_text || raw.preco || raw.price || "");

    if (!sku || !title) return null;

    return {
      sku,
      title,
      badges,
      id_busca,

      open_url: links.open,
      check_url: links.check || links.open,
      canonical_url: links.canonical || "",
      short_url: links.shorty || "",
      resolved_url: links.resolved || "",

      buy_url: links.primary,
      alt_url: links.alt,

      image,
      price_text,

      active,
      featured,

      last_checked: cleanText(raw.last_checked || ""),
      last_ok: cleanText(raw.last_ok || ""),

      _raw: raw,
    };
  }

  function dedupeProducts(list) {
    const out = [];
    const seen = new Set();

    for (const p of (list || [])) {
      if (!p) continue;

      const kId = p.id_busca ? `id:${String(p.id_busca).trim().toUpperCase()}` : "";
      const kCan = p.canonical_url ? `c:${String(p.canonical_url).trim().toLowerCase()}` : "";
      const kUrl = p.buy_url ? `url:${String(p.buy_url).trim().toLowerCase()}` : "";
      const kSku = p.sku ? `sku:${String(p.sku).trim().toLowerCase()}` : "";

      const key = kId || kCan || kUrl || kSku;
      if (!key) continue;

      if (seen.has(key)) {
        const idx = out.findIndex((x) => {
          const kk =
            (x.id_busca ? `id:${String(x.id_busca).trim().toUpperCase()}` : "") ||
            (x.canonical_url ? `c:${String(x.canonical_url).trim().toLowerCase()}` : "") ||
            (x.buy_url ? `url:${String(x.buy_url).trim().toLowerCase()}` : "") ||
            (x.sku ? `sku:${String(x.sku).trim().toLowerCase()}` : "");
          return kk === key;
        });
        if (idx >= 0 && p.featured && !out[idx].featured) out[idx] = p;
        continue;
      }

      seen.add(key);
      out.push(p);
    }

    return out;
  }

  function getFeatured(list) {
    const actives = (list || []).filter((p) => p && p.active !== false);
    return actives.find((p) => p.featured) || null;
  }

  // =========================
  // Categorias REAIS (sem lixo)
  // =========================
  const PREFERRED_CATS = [
    "Achados do Dia", "Casa", "Cozinha", "Home Office", "Setup", "Wi-Fi", "Wi-Fi",
    "Notebook", "Bluetooth", "Carro", "Segurança", "Praticidade", "Premium", "Portátil",
    "Organização", "Casa Inteligente", "Tecnologia", "PC", "Celular", "USB"
  ];

  function normKey(s) {
    return cleanText(s).toLowerCase();
  }

  function looksLikeSpecTag(tag) {
    const t = normKey(tag);

    // exceções que podem ter número e ainda são categoria útil
    if (t.includes("wi-fi") || t.includes("wifi")) return false;
    if (t === "4k" || t === "3d") return false;
    if (t.includes("usb")) return false;
    if (t.includes("bluetooth")) return false;
    if (t.includes("m.2") || t.includes("nvme")) return false;

    // se for curto e tiver número: quase sempre spec (1tb, 4l, 12v etc)
    if (/[0-9]/.test(t) && t.length <= 6) return true;

    // unidades / padrões típicos de especificação
    const unitRe = /(mah|mbps|mb\/s|gb|tb|hz|w\b|kw|v\b|a\b|mm|cm|m\b|l\b|psi|dpi|rpm|db|°|polegada|pol|kg|g\b|litro)/i;
    if (unitRe.test(tag)) return true;

    // padrões tipo 2x1, 1x2, 3 em 1, 10m, 60w, 220v etc
    const patRe = /(^\d+\s?x\s?\d+$)|(\d+\s?em\s?\d+)|(^\d+\s?(m|cm|mm|w|v|a|l|kg|gb|tb)$)/i;
    if (patRe.test(t)) return true;

    // muito número no texto (ruído)
    const digits = (t.match(/[0-9]/g) || []).length;
    if (digits >= 3) return true;

    return false;
  }

  function isGoodCategoryTag(tag, count) {
    const label = cleanText(tag);
    if (!label) return false;

    // remove tags gigantes
    if (label.length > 22) return false;

    const k = normKey(label);

    // nunca deixa entrar "lixo puro"
    if (looksLikeSpecTag(label)) return false;

    // se é preferida, aceita mesmo com count 1 (mas continua sem spec)
    if (PREFERRED_CATS.map(normKey).includes(k)) return true;

    // caso normal: categoria precisa aparecer pelo menos 2x (evita “milhão”)
    if ((count || 0) < 2) return false;

    // evita tags com cara de frase
    const words = k.split(/\s+/g).filter(Boolean);
    if (words.length >= 4) return false;

    return true;
  }

  function buildTagCounts(activeList) {
    const counts = new Map();
    for (const p of (activeList || [])) {
      for (const b of safeArray(p.badges)) {
        const label = cleanText(b);
        if (!label) continue;
        const key = normKey(label);
        counts.set(key, { label, n: (counts.get(key)?.n || 0) + 1 });
      }
    }
    return counts;
  }

  function buildCategories(activeList) {
    const counts = buildTagCounts(activeList);
    const all = Array.from(counts.values());

    const cats = all
      .filter((x) => isGoodCategoryTag(x.label, x.n))
      .sort((a, b) => (b.n - a.n) || a.label.localeCompare(b.label, "pt-BR"));

    // prioriza preferidas (se existirem), depois completa com as maiores
    const preferredKeys = new Set(PREFERRED_CATS.map(normKey));
    const preferred = cats.filter((c) => preferredKeys.has(normKey(c.label)));
    const rest = cats.filter((c) => !preferredKeys.has(normKey(c.label)));

    // preferred também ordenada por count desc
    preferred.sort((a, b) => (b.n - a.n) || a.label.localeCompare(b.label, "pt-BR"));

    return [...preferred, ...rest];
  }

  // =========================
  // UI render (featured + grid)
  // =========================
  function tagsText(badges) {
    const arr = safeArray(badges);
    return arr.slice(0, 4).map((t) => `#${String(t).trim().replace(/\s+/g, "_")}`).join(" ");
  }

  function featuredHTML(p, isProdutoDoDia) {
    const img = p.image
      ? `<img data-cnimg="1" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:24px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const disabled = (p.active === false);
    const buyUrl = bestBuyUrl(p);
    const hasLink = String(buyUrl || "").startsWith("http");

    const buyBtn = (disabled || !hasLink)
      ? `<button class="btn btn--gold" type="button" disabled style="opacity:.55; cursor:not-allowed;">INDISPONÍVEL</button>`
      : `<a class="btn btn--gold" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">COMPRAR AGORA</a>`;

    const badge = isProdutoDoDia
      ? `<div class="badge">⭐ Produto do dia</div>`
      : `<div class="badge" style="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.88);">🛒 Destaque</div>`;

    const desc = safeArray(p.badges).join(" • ");
    const tags = tagsText(p.badges);

    return `
      <div class="card">
        <div class="card__img">
          ${badge}
          ${img}
        </div>
        <div class="card__body">
          <h3 class="name">${escapeHTML(p.title)}</h3>
          ${p.price_text ? `<p class="meta" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(p.price_text)}</p>` : ``}
          <p class="meta">${escapeHTML(desc)}</p>

          <div class="row">
            <div class="idbox">ID Mercado Livre: <b>${escapeHTML(p.id_busca || "")}</b></div>
          </div>

          ${tags ? `<p class="meta" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(tags)}</p>` : ``}

          <div class="actions">
            ${buyBtn}
            <button class="btn btn--tiny btn--glass" type="button" data-action="copyLink" data-sku="${escapeHTML(p.sku)}">Copiar link</button>
            <button class="btn btn--tiny btn--glass" type="button" data-action="copyId" data-sku="${escapeHTML(p.sku)}">Copiar ID</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body">
          <h3 class="name" style="font-size:16px; letter-spacing:.12em; text-transform:uppercase; color:rgba(224,195,107,.95);">
            ${escapeHTML(isProdutoDoDia ? "⭐ Produto do Dia" : "🛒 Destaque da Vitrine")}
          </h3>

          <p class="meta" style="margin-top:6px;">
            ${escapeHTML(isProdutoDoDia
              ? "Esse é o produto escolhido como Produto do Dia."
              : "Nenhum Produto do Dia foi definido — esse é um destaque automático.")}
          </p>

          <p class="meta">
            ✅ Como comprar (rápido)<br/>
            1) Abra o app/site do <b>Mercado Livre</b><br/>
            2) Cole o <b>ID</b> na busca: <b>${escapeHTML(p.id_busca || "")}</b><br/>
            3) Ou clique em <b>COMPRAR AGORA</b> (abre direto)
          </p>

          <div class="actions" style="margin-top:6px;">
            <button class="btn btn--tiny btn--glass" type="button" data-action="copyId" data-sku="${escapeHTML(p.sku)}">Copiar ID</button>
            <button class="btn btn--tiny btn--glass" type="button" data-action="copyLink" data-sku="${escapeHTML(p.sku)}">Copiar Link</button>
            <a class="btn btn--tiny btn--gold" href="./">Abrir Home</a>
          </div>

          <p class="meta" style="margin-top:10px;">
            Melhor funil: <b>Story com sticker de LINK</b> + <b>Loja na Bio</b>.
          </p>
        </div>
      </div>
    `;
  }

  function productCardHTML(p) {
    const img = p.image
      ? `<img data-cnimg="1" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:18px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const disabled = (p.active === false);
    const buyUrl = bestBuyUrl(p);
    const hasLink = String(buyUrl || "").startsWith("http");

    const buy = (disabled || !hasLink)
      ? `<button class="smallBtn smallBtnGold" type="button" disabled style="opacity:.55; cursor:not-allowed;">Indisponível</button>`
      : `<a class="smallBtn smallBtnGold" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">Comprar</a>`;

    const desc = safeArray(p.badges).join(" • ");

    return `
      <div class="pCard" data-sku="${escapeHTML(p.sku)}">
        <div class="pImg">
          ${p.featured ? `<div class="pFeatured">⭐ do dia</div>` : ``}
          ${img}
        </div>
        <div class="pBody">
          <p class="pName">${escapeHTML(p.title)}</p>
          ${p.price_text ? `<p class="pSmall" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(p.price_text)}</p>` : ``}
          <p class="pSmall">${escapeHTML(desc)}</p>

          <div class="pActions">
            ${buy}
            <button class="smallBtn" type="button" data-action="copyId" data-sku="${escapeHTML(p.sku)}">Copiar ID</button>
            <button class="smallBtn" type="button" data-action="copyLink" data-sku="${escapeHTML(p.sku)}">Copiar Link</button>
          </div>
        </div>
      </div>
    `;
  }

  function emptyFeaturedHTML() {
    return `
      <div class="card">
        <div class="card__body">
          <h3 class="name" style="font-size:16px; letter-spacing:.12em; text-transform:uppercase; color:rgba(224,195,107,.95);">
            ⚠️ Nenhum Produto do Dia definido
          </h3>
          <p class="meta">
            Para existir “Produto do Dia”, um item precisa estar com <b>featured=true</b>.
            <br/><br/>
            ✅ No CMS: marque <b>“Definir como Produto do Dia (featured)”</b> no issue do produto.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="card__body">
          <h3 class="name" style="font-size:16px; letter-spacing:.12em; text-transform:uppercase; color:rgba(224,195,107,.95);">
            ✅ Dica rápida
          </h3>
          <p class="meta">
            Enquanto isso, use o <b>Story com sticker de LINK</b> e mantenha esta vitrine como link da bio.
          </p>
        </div>
      </div>
    `;
  }
  // =========================
  // State / URL
  // =========================
  const STATE = {
    products: [],
    updated_at: "",
    query: "",
    tag: "",
    sort: "relev",
    limit: PAGE_SIZE,
    _catsAll: [],
  };

  function setText(el, v) {
    if (!el) return;
    el.textContent = String(v ?? "");
  }

  function updateUrlState() {
    const sp = new URLSearchParams(location.search);

    if (STATE.query) sp.set("q", STATE.query);
    else sp.delete("q");

    if (STATE.tag) sp.set("tag", STATE.tag);
    else sp.delete("tag");

    if (STATE.sort && STATE.sort !== "relev") sp.set("sort", STATE.sort);
    else sp.delete("sort");

    if (ADMIN) sp.set("admin", "1");

    const next = `${location.pathname}?${sp.toString()}`;
    history.replaceState({}, "", next);
  }

  function readUrlState() {
    const sp = new URLSearchParams(location.search);
    STATE.query = sp.get("q") || "";
    STATE.tag = sp.get("tag") || "";
    STATE.sort = sp.get("sort") || "relev";
  }

  function formatUpdatedAt(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function setUpdatedAt(iso) {
    const el = $("#lastUpdate");
    const pretty = iso ? formatUpdatedAt(iso) : "";
    if (pretty) setText(el, pretty);
    else {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      setText(el, `${hh}:${mm}`);
    }
  }

  // =========================
  // Filters / Sort
  // =========================
  function matchesFilter(p) {
    const q = (STATE.query || "").trim().toLowerCase();
    const tag = (STATE.tag || "").trim().toLowerCase();

    if (tag) {
      const has = safeArray(p.badges).some((b) => normKey(b) === tag);
      if (!has) return false;
    }

    if (!q) return true;

    const hay = (
      (p.title || "") + " " +
      (p.sku || "") + " " +
      (p.id_busca || "") + " " +
      safeArray(p.badges).join(" ") + " " +
      (p.price_text || "")
    ).toLowerCase();

    // AND por termos
    const parts = q.split(/\s+/g).filter(Boolean);
    for (const term of parts) {
      if (!hay.includes(term)) return false;
    }
    return true;
  }

  function applySort(list) {
    const arr = (list || []).slice();

    if (STATE.sort === "az") {
      arr.sort((a, b) => String(a.title).localeCompare(String(b.title), "pt-BR"));
      return arr;
    }

    if (STATE.sort === "recent") {
      arr.sort((a, b) => String(b.last_ok || "").localeCompare(String(a.last_ok || "")));
      return arr;
    }

    // relev: featured + A-Z
    arr.sort((a, b) => {
      const fa = a.featured ? 0 : 1;
      const fb = b.featured ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return String(a.title).localeCompare(String(b.title), "pt-BR");
    });
    return arr;
  }

  // =========================
  // Categorias (chips + modal)
  // =========================
  function renderCategoryChips(activeAll) {
    const box = $("#tagChips");
    const btnMore = $("#btnTagsMore");
    const tagsCountEl = $("#tagsCount");
    if (!box) return;

    const categories = buildCategories(activeAll);
    STATE._catsAll = categories.slice();

    // número de categorias “reais”
    setText(tagsCountEl, categories.length);

    // mostra só as principais no bloco (premium e limpo)
    const MAX_CHIPS = (window.innerWidth <= 520) ? 10 : 14;
    const top = categories.slice(0, MAX_CHIPS);

    const allActive = !STATE.tag;
    const chips = [];

    chips.push(`
      <button class="tagChip ${allActive ? "tagChip--active" : ""}" type="button" data-tag="">
        👑 Tudo
      </button>
    `);

    for (const t of top) {
      const isActive = (STATE.tag || "") === normKey(t.label);
      chips.push(`
        <button class="tagChip ${isActive ? "tagChip--active" : ""}" type="button" data-tag="${escapeHTML(normKey(t.label))}">
          ${escapeHTML(t.label)} <span style="opacity:.75;">(${t.n})</span>
        </button>
      `);
    }

    box.innerHTML = chips.join("");

    if (btnMore) {
      if (categories.length > top.length) {
        btnMore.style.display = "inline-flex";
        btnMore.textContent = `🔎 Ver todas (${categories.length})`;
      } else {
        btnMore.style.display = "none";
      }
    }
  }

  function openTagModal() {
    const modal = $("#tagModal");
    if (!modal) return;
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
    renderTagModalList("");
    const q = $("#tagModalQ");
    if (q) {
      q.value = "";
      setTimeout(() => q.focus(), 50);
    }
  }

  function closeTagModal() {
    const modal = $("#tagModal");
    if (!modal) return;
    modal.classList.remove("show");
    document.body.style.overflow = "";
  }

  function renderTagModalList(query) {
    const listEl = $("#tagModalList");
    if (!listEl) return;

    const q = cleanText(query || "").toLowerCase();
    const cats = STATE._catsAll || [];
    const filtered = q
      ? cats.filter((c) => normKey(c.label).includes(q))
      : cats.slice();

    listEl.innerHTML = filtered.map((c) => {
      const isActive = (STATE.tag || "") === normKey(c.label);
      return `
        <div class="cnModal__item" data-tag="${escapeHTML(normKey(c.label))}" aria-pressed="${isActive ? "true" : "false"}">
          <div class="lbl">${escapeHTML(c.label)}</div>
          <div class="cnt">${c.n}</div>
        </div>
      `;
    }).join("");

    if (!filtered.length) {
      listEl.innerHTML = `<div style="padding:8px; opacity:.85;">Nenhuma categoria encontrada.</div>`;
    }
  }

  // =========================
  // Counters
  // =========================
  function setCounters({ totalActive, totalFiltered, shownNow }) {
    setText($("#countAll"), totalActive);
    setText($("#countShown"), totalFiltered);
    setText($("#countRendered"), shownNow);

    const fs = $("#filterStatus");
    if (fs) fs.style.display = (STATE.query || STATE.tag || (STATE.sort && STATE.sort !== "relev")) ? "inline" : "none";
  }

  // =========================
  // Render main
  // =========================
  function render() {
    const grid = $("#grid");
    const featuredEl = $("#featured");
    if (!grid || !featuredEl) return;

    const allProducts = dedupeProducts(STATE.products).filter((p) => p);
    const activeAll = allProducts.filter((p) => p && p.active !== false);

    renderCategoryChips(activeAll);

    let filtered = activeAll.filter(matchesFilter);
    filtered = applySort(filtered);

    const destaque = getFeatured(activeAll);

    featuredEl.innerHTML = destaque
      ? featuredHTML(destaque, true)
      : emptyFeaturedHTML();

    applyImageFixes(featuredEl);

    const shown = filtered.slice(0, STATE.limit);
    grid.innerHTML = shown.map(productCardHTML).join("");
    applyImageFixes(grid);

    const wrap = $("#loadMoreWrap");
    if (wrap) {
      if (shown.length < filtered.length) wrap.classList.remove("hidden");
      else wrap.classList.add("hidden");
    }

    setCounters({
      totalActive: activeAll.length,
      totalFiltered: filtered.length,
      shownNow: shown.length,
    });

    updateUrlState();
  }

  // =========================
  // Fetch produtos.json
  // =========================
  async function fetchProducts() {
    const res = await fetch(`./produtos.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("produtos.json não encontrado");
    const data = await res.json();

    STATE.updated_at = cleanText(data.updated_at || "");
    setUpdatedAt(STATE.updated_at);

    const list = normalizeProducts(data).map(adaptForUI).filter(Boolean);
    const deduped = dedupeProducts(list);
    if (!deduped.length) throw new Error("Nenhum produto válido em produtos.json");
    return deduped;
  }

  // =========================
  // Exports (TXT/CSV)
  // =========================
  function two(n){ return String(n).padStart(2, "0"); }
  function dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}`;
  }
  function fileSafe(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^\w\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  }
  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function exportListTxt(kind) {
    const now = new Date().toLocaleString("pt-BR");
    const allProducts = dedupeProducts(STATE.products).filter(Boolean);
    const active = allProducts.filter((p) => p.active !== false);

    const list = (kind === "all") ? allProducts : active;

    const header = [
      "Cosa Nostra — Loja Completa",
      kind === "all" ? "LISTA (TUDO)" : "LISTA (ATIVOS)",
      `Gerado em: ${now}`,
      STATE.updated_at ? `updated_at: ${STATE.updated_at}` : "",
      `Total: ${list.length}`,
      "",
    ].filter(Boolean).join("\n");

    const lines = list.map((p, i) => {
      const name = (p && p.title) ? String(p.title) : "";
      const id = (p && p.id_busca) ? String(p.id_busca) : "";
      if (id) return `${i + 1}. ${name} (ID: ${id})`;
      return `${i + 1}. ${name}`;
    });

    return header + "\n" + lines.join("\n") + "\n";
  }

  function exportListCsvAll() {
    const allProducts = dedupeProducts(STATE.products).filter(Boolean);
    const rows = [];
    rows.push(["n", "title", "id_busca", "sku", "buy_url", "active", "featured"].join(";"));

    for (let i = 0; i < allProducts.length; i++) {
      const p = allProducts[i] || {};
      const n = i + 1;
      const title = String(p.title || "").replaceAll(";", ",");
      const id = String(p.id_busca || "").replaceAll(";", ",");
      const sku = String(p.sku || "").replaceAll(";", ",");
      const url = String(bestBuyUrl(p) || "").replaceAll(";", ",");
      const active = (p.active !== false) ? "true" : "false";
      const featured = (p.featured === true) ? "true" : "false";
      rows.push([n, title, id, sku, url, active, featured].join(";"));
    }

    return rows.join("\n") + "\n";
  }

  // =========================
  // Bind UI
  // =========================
  function bind() {
    const q = $("#qLoja");
    const clear = $("#btnClear");
    const copyBtn = $("#btnCopyLoja");
    const copyPage = $("#btnCopyPage");
    const sortSel = $("#sortSel");
    const moreBtn = $("#btnMore");
    const btnTagsMore = $("#btnTagsMore");

    // export buttons
    const btnCopyActive = $("#btnCopyActive");
    const btnDownloadActiveTxt = $("#btnDownloadActiveTxt");
    const btnDownloadAllTxt = $("#btnDownloadAllTxt");
    const btnDownloadCSV = $("#btnDownloadCSV");

    if (q) {
      q.value = STATE.query || "";
      q.addEventListener("input", (e) => {
        STATE.query = String(e.target.value || "");
        STATE.limit = PAGE_SIZE;
        render();
      });
    }

    if (clear) {
      clear.addEventListener("click", () => {
        if (q) q.value = "";
        STATE.query = "";
        STATE.tag = "";
        STATE.sort = "relev";
        if (sortSel) sortSel.value = "relev";
        STATE.limit = PAGE_SIZE;
        render();
        showToast("Filtros limpos ✅");
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        copyText(location.href);
      });
    }
    if (copyPage) {
      copyPage.addEventListener("click", () => copyText(location.href));
    }

    if (sortSel) {
      sortSel.value = STATE.sort || "relev";
      sortSel.addEventListener("change", (e) => {
        STATE.sort = String(e.target.value || "relev");
        STATE.limit = PAGE_SIZE;
        render();
      });
    }

    if (moreBtn) {
      moreBtn.addEventListener("click", () => {
        STATE.limit += PAGE_SIZE;
        render();
      });
    }

    // chips click
    document.addEventListener("click", (e) => {
      // Comprar (in-app safe)
      const aBuy = e.target.closest('a.btn--gold[href], a.smallBtnGold[href]');
      if (aBuy) {
        const href = aBuy.getAttribute("href") || aBuy.href || "";
        if (isProbablyValidLink(href)) {
          e.preventDefault();
          openBuy(href);
          return;
        }
      }

      const chip = e.target.closest(".tagChip[data-tag]");
      if (chip) {
        const t = String(chip.getAttribute("data-tag") || "").trim();
        STATE.tag = t; // já vem normalizado
        STATE.limit = PAGE_SIZE;
        render();
        return;
      }

      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.getAttribute("data-action");
      const sku = el.getAttribute("data-sku") || "";
      const p = STATE.products.find((x) => x && x.sku === sku) || null;

      if (action === "copyLink" && p) return copyText(bestBuyUrl(p) || "");
      if (action === "copyId" && p) return copyText(p.id_busca || "");
    });

    // Ver todas (modal)
    if (btnTagsMore) btnTagsMore.addEventListener("click", openTagModal);

    const modal = $("#tagModal");
    const modalClose = $("#btnTagModalClose");
    const modalClear = $("#btnTagModalClear");
    const modalAll = $("#btnTagModalAll");
    const modalQ = $("#tagModalQ");
    const modalList = $("#tagModalList");

    if (modalClose) modalClose.addEventListener("click", closeTagModal);
    if (modalClear) modalClear.addEventListener("click", () => {
      if (modalQ) modalQ.value = "";
      renderTagModalList("");
    });
    if (modalAll) modalAll.addEventListener("click", () => {
      STATE.tag = "";
      STATE.limit = PAGE_SIZE;
      render();
      closeTagModal();
    });
    if (modalQ) modalQ.addEventListener("input", (e) => renderTagModalList(e.target.value || ""));

    if (modal) {
      modal.addEventListener("click", (e) => {
        // clique fora do card fecha
        if (e.target === modal) closeTagModal();
      });
    }
    if (modalList) {
      modalList.addEventListener("click", (e) => {
        const it = e.target.closest(".cnModal__item[data-tag]");
        if (!it) return;
        const t = String(it.getAttribute("data-tag") || "").trim();
        STATE.tag = t;
        STATE.limit = PAGE_SIZE;
        render();
        closeTagModal();
      });
    }

    // export
    if (btnCopyActive) btnCopyActive.addEventListener("click", () => copyText(exportListTxt("active")));
    if (btnDownloadActiveTxt) btnDownloadActiveTxt.addEventListener("click", () => {
      const txt = exportListTxt("active");
      downloadFile(`lista_active_${dateStamp()}.txt`, txt, "text/plain;charset=utf-8");
      showToast("Download iniciado ⬇️", 1800);
    });
    if (btnDownloadAllTxt) btnDownloadAllTxt.addEventListener("click", () => {
      const txt = exportListTxt("all");
      downloadFile(`lista_tudo_${dateStamp()}.txt`, txt, "text/plain;charset=utf-8");
      showToast("Download iniciado ⬇️", 1800);
    });
    if (btnDownloadCSV) btnDownloadCSV.addEventListener("click", () => {
      const csv = exportListCsvAll();
      downloadFile(`produtos_${dateStamp()}.csv`, csv, "text/csv;charset=utf-8");
      showToast("CSV gerado ⬇️", 1800);
    });

    // admin bar
    const adminBar = $("#adminBar");
    if (adminBar) adminBar.style.display = ADMIN ? "flex" : "none";

    const btnReload = $("#btnReload");
    if (btnReload) {
      btnReload.addEventListener("click", async () => {
        showToast("Recarregando…", 1400);
        try {
          STATE.products = await fetchProducts();
          STATE.limit = PAGE_SIZE;
          render();
          showToast("Carregado ✅", 1400);
        } catch {
          showToast("Erro ao carregar produtos.json", 2000);
        }
      });
    }

    const btnExport = $("#btnExport");
    if (btnExport) {
      btnExport.addEventListener("click", () => {
        // exporta o JSON “cru” atual (sem edição)
        const out = {
          updated_at: new Date().toISOString(),
          products: dedupeProducts(STATE.products).map((p) => p._raw || {}),
        };
        downloadFile("produtos.json", JSON.stringify(out, null, 2), "application/json;charset=utf-8");
        showToast("produtos.json exportado ⬇️", 1800);
      });
    }
  }

  async function boot() {
    readUrlState();
    setText($("#year"), new Date().getFullYear());

    const sortSel = $("#sortSel");
    if (sortSel) sortSel.value = STATE.sort || "relev";

    try {
      STATE.products = await fetchProducts();
    } catch {
      STATE.products = [];
      showToast("Falha ao carregar produtos.json", 2000);
    }

    // normaliza tag vinda na URL
    STATE.tag = (STATE.tag || "").toLowerCase().trim();

    bind();
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
