/* ==========================================================
   Arquivo: loja.js
   Página : Loja Completa (loja.html)
   Objetivo:
     - Renderizar produtos a partir de produtos.json
     - Produto do Dia (featured) real
     - Filtro por texto + filtro por tag + ordenação + paginação
     - Export: Copiar lista / Baixar TXT / CSV
     - Modal "Ver todas" tags com busca
     - Admin mode (?admin=1): exportar produtos.json
   ========================================================== */

(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const QS = new URLSearchParams(location.search);
  const ADMIN = QS.get("admin") === "1";

  const PAGE_SIZE = 60;

  // FAILSAFE (ANTI-WIPE)
  const FRONT_FAILSAFE_MIN_ACTIVE = 10;
  const FRONT_FAILSAFE_MIN_RATIO = 0.35;
  const FRONT_FAILSAFE_OK_DAYS = 7;

  // TAGS UI
  const TAGS_MAIN_MAX = 18;     // quantas categorias aparecem no painel
  const TAGS_MODAL_MAX = 400;   // limite de render no modal (segurança)

  // “Categorias principais” (mesmo se tiver número)
  const TAG_ALLOW = new Set([
    "achados do dia", "produto do dia",
    "casa", "cozinha", "banheiro", "quarto", "organização", "decoração",
    "home office", "setup", "tecnologia", "informática",
    "wi-fi", "wifi", "wi-fi 6", "wifi 6", "bluetooth", "sem fio",
    "segurança", "carro", "viagem", "portátil", "notebook", "pc",
    "tws", "gamer", "streaming",
    "preto", "branco", "premium"
  ]);

  const STATE = {
    products: [],
    updated_at: "",
    query: "",
    tag: "",
    sort: "relev",
    limit: PAGE_SIZE,

    // cache de tags
    tagCounts: [],

    // snapshot para export
    _export: null,
    _failsafeNotified: false,
  };

  // =========================
  // UI helpers
  // =========================
  const toast = $("#toast");
  function showToast(msg = "OK ✅") {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  async function copyText(txt) {
    const v = String(txt ?? "");
    try {
      await navigator.clipboard.writeText(v);
      showToast("Copiado ✅");
    } catch {
      const t = document.createElement("textarea");
      t.value = v;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
      showToast("Copiado ✅");
    }
  }

  function setText(el, v) {
    if (!el) return;
    el.textContent = String(v ?? "");
  }

  function cleanText(s) {
    return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
    return isMLHost(hostOf(x));
  }

  function bestBuyUrl(p) {
    return ensureHttpUrl(
      p.buy_url ||
      p.open_url ||
      p.check_url ||
      p.canonical_url ||
      p.short_url ||
      p.resolved_url ||
      p.link ||
      p.url ||
      ""
    );
  }

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

  function formatUpdatedAt(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function parseISO(iso) {
    try {
      const d = new Date(String(iso || ""));
      if (Number.isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  }

  function isRecentOk(iso, days = FRONT_FAILSAFE_OK_DAYS) {
    const d = parseISO(iso);
    if (!d) return false;
    const ms = Date.now() - d.getTime();
    const max = days * 24 * 60 * 60 * 1000;
    return ms >= 0 && ms <= max;
  }

  // =========================
  // Normalização de produtos.json
  // =========================
  function normalizeProducts(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.produtos)) return data.produtos;
    return [];
  }

  function safeArray(x) {
    return Array.isArray(x) ? x : [];
  }

  function adaptForUI(rawProduct) {
    const raw = rawProduct || {};

    const sku = cleanText(raw.sku || raw.slug || raw.key || "");
    const title = cleanText(raw.title || raw.nome || raw.name || "");
    const id_busca = cleanText(raw.id_busca || raw.idML || raw.id_ml || raw.ml_id || raw.id || "");

    const badges = safeArray(raw.badges || raw.tags || raw.categorias)
      .map(cleanText)
      .filter(Boolean);

    const active =
      (raw.active !== undefined) ? !!raw.active :
      (raw.ativo !== undefined) ? !!raw.ativo :
      true;

    const featured = (raw.featured === true) || (raw.destaque === true) || (raw.is_featured === true);

    const image = cleanUrl(raw.image || raw.imagem || raw.img || "");

    const open_url = ensureHttpUrl(raw.open_url || raw.link || raw.url || "");
    const check_url = ensureHttpUrl(raw.check_url || "");
    const canonical_url = ensureHttpUrl(raw.canonical_url || "");
    const short_url = ensureHttpUrl(raw.short_url || "");
    const resolved_url = ensureHttpUrl(raw.resolved_url || "");

    const buy_url =
      (isProbablyValidLink(open_url) ? open_url : "") ||
      (isProbablyValidLink(check_url) ? check_url : "") ||
      (isProbablyValidLink(canonical_url) ? canonical_url : "") ||
      (isProbablyValidLink(short_url) ? short_url : "") ||
      (isProbablyValidLink(resolved_url) ? resolved_url : "");

    if (!sku || !title) return null;

    return {
      sku,
      title,
      id_busca,
      badges,
      image,

      open_url,
      check_url,
      canonical_url,
      short_url,
      resolved_url,
      buy_url,

      price_text: cleanText(raw.price_text || ""),
      active,
      featured,

      last_ok: cleanText(raw.last_ok || ""),
      last_checked: cleanText(raw.last_checked || ""),

      _raw: raw,
    };
  }

  function dedupeProducts(list) {
    const out = [];
    const seen = new Set();

    for (const p of (list || [])) {
      if (!p) continue;

      const kId = p.id_busca ? `id:${String(p.id_busca).trim().toUpperCase()}` : "";
      const kUrl = bestBuyUrl(p) ? `url:${String(bestBuyUrl(p)).trim().toLowerCase()}` : "";
      const kSku = p.sku ? `sku:${String(p.sku).trim().toLowerCase()}` : "";

      const key = kId || kUrl || kSku;
      if (!key) continue;

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }

    return out;
  }
  // =========================
  // Tags “inteligentes”
  // =========================
  function tagKey(t) { return String(t || "").trim().toLowerCase(); }

  function looksLikeSpecTag(label) {
    const s = tagKey(label);
    if (!s) return true;

    // allowlist manda
    if (TAG_ALLOW.has(s)) return false;

    // muito curto = ruído
    if (s.length <= 2) return true;

    // contém dígitos (tende a ser spec)
    if (/\d/.test(s)) return true;

    // unidades e padrões técnicos
    if (/(tb|gb|mb|mah|w|hz|cm|mm|v|a|mbps|mps|ghz)\b/.test(s)) return true;
    if (/(pcie|nvme|m\.2|ax\d{3,4}|usb|usb-c|usbc|type-c|fhd|qhd|uhd|4k|8k)/.test(s)) return true;

    return false;
  }

  function buildTagCounts(list) {
    const counts = new Map();
    for (const p of (list || [])) {
      for (const b of safeArray(p.badges)) {
        const label = String(b || "").trim();
        if (!label) continue;
        const k = tagKey(label);
        const prev = counts.get(k);
        counts.set(k, { label, n: ((prev && prev.n) ? prev.n : 0) + 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.n - a.n);
  }

  function pickMainTags(counts) {
    const cats = counts.filter((t) => !looksLikeSpecTag(t.label));
    // Se quase tudo é “spec”, não quebra: usa o top geral.
    const base = cats.length >= 6 ? cats : counts;
    return base.slice(0, TAGS_MAIN_MAX);
  }

  // =========================
  // Modal tags
  // =========================
  function openTagModal() {
    const modal = $("#tagModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    renderTagModal("");
    const input = $("#tagModalSearch");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 20);
    }
  }

  function closeTagModal() {
    const modal = $("#tagModal");
    if (!modal) return;
    modal.classList.add("hidden");
  }

  function renderTagModal(filterText) {
    const listEl = $("#tagModalList");
    if (!listEl) return;

    const f = tagKey(filterText);
    const counts = STATE.tagCounts || [];

    const base = counts
      .filter((t) => !f || tagKey(t.label).includes(f))
      .slice(0, TAGS_MODAL_MAX);

    const parts = [];

    // item "Tudo"
    parts.push(`
      <div class="cnTagItem ${STATE.tag ? "" : "active"}" data-tag="">
        <span>👑 Tudo</span>
        <span class="n">${String($("#countAll")?.textContent || "")}</span>
      </div>
    `);

    for (const t of base) {
      const active = (tagKey(STATE.tag) === tagKey(t.label));
      parts.push(`
        <div class="cnTagItem ${active ? "active" : ""}" data-tag="${t.label}">
          <span>${t.label}</span>
          <span class="n">${t.n}</span>
        </div>
      `);
    }

    listEl.innerHTML = parts.join("");
  }

  // =========================
  // Render HTML
  // =========================
  function escapeHTML(s) {
    return String(s ?? "")
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#039;");
  }

  function applyImageFixes(root) {
    const scope = root || document;
    scope.querySelectorAll('img[data-cnimg="1"]').forEach((img) => {
      img.setAttribute("referrerpolicy", "no-referrer");
      try { img.loading = "lazy"; } catch {}
      try { img.decoding = "async"; } catch {}
    });
  }

  function featuredHTML(p) {
    const img = p.image
      ? `<img data-cnimg="1" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:24px;">Sem imagem</div>`;

    const buyUrl = bestBuyUrl(p);
    const hasLink = String(buyUrl || "").startsWith("http");

    const buyBtn = (!hasLink || p.active === false)
      ? `<button class="btn btn--gold" type="button" disabled style="opacity:.55; cursor:not-allowed;">INDISPONÍVEL</button>`
      : `<a class="btn btn--gold" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">COMPRAR AGORA</a>`;

    const desc = safeArray(p.badges).slice(0, 6).join(" • ");

    return `
      <div class="card">
        <div class="card__img">
          <div class="badge">⭐ Produto do dia</div>
          ${img}
        </div>
        <div class="card__body">
          <h3 class="name">${escapeHTML(p.title)}</h3>
          ${p.price_text ? `<p class="meta" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(p.price_text)}</p>` : ``}
          <p class="meta">${escapeHTML(desc)}</p>

          <div class="row">
            <div class="idbox">ID Mercado Livre: <b>${escapeHTML(p.id_busca || "—")}</b></div>
          </div>

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
            ✅ Como comprar (rápido)
          </h3>
          <p class="meta">
            1) Abra o app/site do <b>Mercado Livre</b><br/>
            2) Cole o <b>ID</b> na busca: <b>${escapeHTML(p.id_busca || "—")}</b><br/>
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

  function emptyFeaturedHTML() {
    return `
      <div class="card">
        <div class="card__body">
          <h3 class="name" style="font-size:16px; letter-spacing:.12em; text-transform:uppercase; color:rgba(224,195,107,.95);">
            ⚠️ Nenhum Produto do Dia definido
          </h3>
          <p class="meta">
            Para existir “Produto do Dia”, um item precisa estar com <b>featured=true</b>.
          </p>
        </div>
      </div>
      <div class="card">
        <div class="card__body">
          <h3 class="name" style="font-size:16px; letter-spacing:.12em; text-transform:uppercase; color:rgba(224,195,107,.95);">
            ✅ Dica rápida
          </h3>
          <p class="meta">
            Enquanto isso, use <b>Story com sticker de LINK</b> e mantenha esta vitrine como link da bio.
          </p>
        </div>
      </div>
    `;
  }

  function productCardHTML(p) {
    const img = p.image
      ? `<img data-cnimg="1" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:18px;">Sem imagem</div>`;

    const buyUrl = bestBuyUrl(p);
    const hasLink = String(buyUrl || "").startsWith("http");

    const buy = (!hasLink || p.active === false)
      ? `<button class="smallBtn smallBtnGold" type="button" disabled style="opacity:.55; cursor:not-allowed;">Indisponível</button>`
      : `<a class="smallBtn smallBtnGold" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">Comprar</a>`;

    const desc = safeArray(p.badges).slice(0, 5).join(" • ");

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
  // =========================
  // Filtros / Sort
  // =========================
  function matchesFilter(p) {
    const q = tagKey(STATE.query);
    const tag = tagKey(STATE.tag);

    if (tag) {
      const has = safeArray(p.badges).some((b) => tagKey(b) === tag);
      if (!has) return false;
    }

    if (!q) return true;

    const hay = tagKey(
      (p.title || "") + " " +
      (p.sku || "") + " " +
      (p.id_busca || "") + " " +
      safeArray(p.badges).join(" ") + " " +
      (p.price_text || "")
    );

    // AND por termos
    const parts = q.split(/\s+/g).filter(Boolean);
    for (const part of parts) {
      if (!hay.includes(part)) return false;
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
  // Render principal
  // =========================
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

  function renderTagChips(activeList) {
    const box = $("#tagChips");
    const totalTagsEl = $("#tagsCount");
    if (!box) return;

    const counts = buildTagCounts(activeList);
    STATE.tagCounts = counts;
    setText(totalTagsEl, counts.length);

    const main = pickMainTags(counts);

    const chips = [];
    const allActive = !STATE.tag;

    chips.push(`
      <button class="${allActive ? "active" : ""}" type="button" data-tag="" aria-pressed="${allActive}">
        👑 Tudo
      </button>
    `);

    // se a tag atual não está no top, “pina” ela
    if (STATE.tag) {
      const cur = counts.find((x) => tagKey(x.label) === tagKey(STATE.tag));
      const inMain = main.some((x) => tagKey(x.label) === tagKey(STATE.tag));
      if (cur && !inMain) {
        chips.push(`
          <button class="active" type="button" data-tag="${escapeHTML(cur.label)}" aria-pressed="true">
            📌 ${escapeHTML(cur.label)} <span style="opacity:.75;">(${cur.n})</span>
          </button>
        `);
      }
    }

    for (const t of main) {
      const isActive = tagKey(STATE.tag) === tagKey(t.label);
      chips.push(`
        <button class="${isActive ? "active" : ""}" type="button" data-tag="${escapeHTML(t.label)}" aria-pressed="${isActive}">
          ${escapeHTML(t.label)} <span style="opacity:.75;">(${t.n})</span>
        </button>
      `);
    }

    box.innerHTML = chips.join("");
  }

  function setCounters({ totalActive, totalFiltered, shownNow }) {
    setText($("#countAll"), totalActive);
    setText($("#countShown"), totalFiltered);
    setText($("#countRendered"), shownNow);

    const fs = $("#filterStatus");
    const active = (STATE.query || STATE.tag || (STATE.sort && STATE.sort !== "relev"));
    if (fs) fs.style.display = active ? "block" : "none";
  }

  function getFeatured(list) {
    const actives = (list || []).filter((p) => p && p.active !== false);
    return actives.find((p) => p.featured) || null;
  }

  function render() {
    const grid = $("#grid");
    const featuredEl = $("#featured");
    if (!grid || !featuredEl) return;

    const allProducts = dedupeProducts(STATE.products).filter(Boolean);

    let activeAll = allProducts.filter((p) => p && p.active !== false);

    if (allProducts.length > 0) {
      const minAllowed = Math.max(
        FRONT_FAILSAFE_MIN_ACTIVE,
        Math.floor(allProducts.length * FRONT_FAILSAFE_MIN_RATIO)
      );

      if (activeAll.length < minAllowed) {
        const rescued = allProducts.filter((p) => (p.active !== false) || isRecentOk(p.last_ok));
        if (rescued.length > activeAll.length) {
          activeAll = rescued;
          if (!STATE._failsafeNotified) {
            STATE._failsafeNotified = true;
            showToast("FAILSAFE: vitrine preservada ✅");
          }
        }
      }
    }

    renderTagChips(activeAll);

    let filtered = activeAll.filter(matchesFilter);
    filtered = applySort(filtered);

    const destaque = getFeatured(activeAll);

    featuredEl.innerHTML = destaque ? featuredHTML(destaque) : emptyFeaturedHTML();
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

    STATE._export = {
      updated_at: STATE.updated_at || "",
      all: allProducts.slice(),
      active: activeAll.slice(),
      visible: filtered.slice(),
    };
  }

  // =========================
  // Export TXT/CSV
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

  function exportListTxt(list, title) {
    const now = new Date().toLocaleString("pt-BR");
    const header = [
      "Cosa Nostra — Loja Completa",
      title,
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

  function exportListCsv(list) {
    const rows = [];
    rows.push(["n", "title", "id_busca", "sku", "buy_url"].join(";"));

    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      const n = i + 1;
      const title = String(p.title || "").replaceAll(";", ",");
      const id = String(p.id_busca || "").replaceAll(";", ",");
      const sku = String(p.sku || "").replaceAll(";", ",");
      const url = String(bestBuyUrl(p) || "").replaceAll(";", ",");
      rows.push([n, title, id, sku, url].join(";"));
    }
    return rows.join("\n") + "\n";
  }

  // =========================
  // Fetch / Boot
  // =========================
  async function fetchProducts() {
    const res = await fetch(`./produtos.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("produtos.json não encontrado");
    const data = await res.json();

    STATE.updated_at = cleanText(data.updated_at || "");
    setUpdatedAt(STATE.updated_at);

    const list = normalizeProducts(data)
      .map(adaptForUI)
      .filter(Boolean);

    const deduped = dedupeProducts(list);
    if (!deduped.length) throw new Error("Nenhum produto válido em produtos.json");
    return deduped;
  }

  function bind() {
    const q = $("#qLoja");
    const clear = $("#btnClear");
    const copyBtn = $("#btnCopyLoja");
    const copyPageBtn = $("#btnCopyPage");

    const sortSel = $("#sortSel");
    const moreBtn = $("#btnMore");

    const btnAllTags = $("#btnAllTags");
    const btnCloseTags = $("#btnCloseTags");
    const modal = $("#tagModal");
    const modalSearch = $("#tagModalSearch");
    const modalList = $("#tagModalList");

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

    if (copyPageBtn) {
      copyPageBtn.addEventListener("click", () => copyText(location.href));
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

    // Modal tags
    if (btnAllTags) btnAllTags.addEventListener("click", openTagModal);
    if (btnCloseTags) btnCloseTags.addEventListener("click", closeTagModal);
    if (modal) {
      modal.addEventListener("click", (e) => {
        const close = e.target.closest("[data-close='1']");
        if (close) closeTagModal();
      });
    }
    if (modalSearch) {
      modalSearch.addEventListener("input", (e) => renderTagModal(String(e.target.value || "")));
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeTagModal();
    });

    // Exports
    if (btnCopyActive) btnCopyActive.addEventListener("click", async () => {
      const list = (STATE._export?.active) || [];
      await copyText(exportListTxt(list, "LISTA (ATIVOS)"));
      showToast("Lista copiada ✅");
    });

    if (btnDownloadActiveTxt) btnDownloadActiveTxt.addEventListener("click", () => {
      const list = (STATE._export?.active) || [];
      const txt = exportListTxt(list, "LISTA (ATIVOS)");
      downloadFile(`lista_active_${dateStamp()}.txt`, txt, "text/plain;charset=utf-8");
      showToast("Lista baixada ⬇️");
    });

    if (btnDownloadAllTxt) btnDownloadAllTxt.addEventListener("click", () => {
      const list = (STATE._export?.all) || [];
      const txt = exportListTxt(list, "LISTA (TUDO)");
      downloadFile(`lista_tudo_${dateStamp()}.txt`, txt, "text/plain;charset=utf-8");
      showToast("Lista (tudo) ⬇️");
    });

    if (btnDownloadCSV) btnDownloadCSV.addEventListener("click", () => {
      const list = (STATE._export?.all) || [];
      const csv = exportListCsv(list);
      downloadFile(`produtos_${fileSafe("tudo")}_${dateStamp()}.csv`, csv, "text/csv;charset=utf-8");
      showToast("CSV (tudo) ⬇️");
    });

    // Delegação de cliques
    document.addEventListener("click", (e) => {
      // Comprar: força abrir (in-app IG/FB)
      const aBuy = e.target.closest('a.btn--gold[href], a.smallBtnGold[href]');
      if (aBuy) {
        const href = aBuy.getAttribute("href") || aBuy.href || "";
        if (isProbablyValidLink(href)) {
          e.preventDefault();
          openBuy(href);
          return;
        }
      }

      // Clique em chip (sempre funciona)
      const chip = e.target.closest("#tagChips [data-tag]");
      if (chip) {
        const t = cleanText(chip.getAttribute("data-tag") || "");
        STATE.tag = t;
        STATE.limit = PAGE_SIZE;
        render();
        return;
      }

      // Clique no modal
      const mt = e.target.closest("#tagModalList [data-tag]");
      if (mt) {
        const t = cleanText(mt.getAttribute("data-tag") || "");
        STATE.tag = t;
        STATE.limit = PAGE_SIZE;
        closeTagModal();
        render();
        return;
      }

      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.getAttribute("data-action");
      const sku = el.getAttribute("data-sku") || "";
      const p = (STATE.products || []).find((x) => x && x.sku === sku) || null;

      if (action === "copyLink" && p) return copyText(bestBuyUrl(p) || "");
      if (action === "copyId" && p) return copyText(p.id_busca || "");
    });

    // Admin
    if (ADMIN) {
      const adminBar = $("#adminBar");
      if (adminBar) adminBar.style.display = "flex";

      const btnReload = $("#btnReload");
      const btnExport = $("#btnExport");

      if (btnReload) {
        btnReload.addEventListener("click", async () => {
          showToast("Recarregando…");
          try {
            STATE.products = await fetchProducts();
            STATE.limit = PAGE_SIZE;
            render();
            showToast("Carregado ✅");
          } catch {
            alert("Erro ao carregar produtos.json");
          }
        });
      }

      if (btnExport) {
        btnExport.addEventListener("click", () => {
          const out = {
            updated_at: new Date().toISOString(),
            products: dedupeProducts(STATE.products).map((p) => {
              const r = { ...(p._raw || {}) };
              r.sku = p.sku;
              r.title = p.title;
              r.badges = safeArray(p.badges);
              r.id_busca = p.id_busca;
              r.open_url = ensureHttpUrl(p.open_url || bestBuyUrl(p) || "");
              r.check_url = ensureHttpUrl(p.check_url || r.open_url || "");
              r.image = p.image || r.image || "";
              r.price_text = p.price_text || "";
              r.active = (p.active !== false);
              r.featured = (p.featured === true);
              return r;
            }),
          };

          downloadFile("produtos.json", JSON.stringify(out, null, 2), "application/json;charset=utf-8");
          showToast("Exportado ⬇️");
        });
      }
    }
  }

  async function boot() {
    setText($("#year"), new Date().getFullYear());

    bind();

    try {
      STATE.products = await fetchProducts();
      render();
      showToast("Loja carregada ✅");
    } catch (err) {
      console.error(err);
      $("#featured").innerHTML = emptyFeaturedHTML();
      $("#grid").innerHTML = "";
      showToast("Falha ao carregar produtos");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
