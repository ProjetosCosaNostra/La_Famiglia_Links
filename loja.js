/* ==========================================================
   Arquivo: loja.js
   Página : Loja Completa (loja.html)
   Objetivo:
     - Renderizar produtos a partir de produtos.json
     - Produto do Dia (featured) sem “inventar featured”
     - Filtro por texto + filtro por tag + ordenação + paginação
     - Admin mode (?admin=1): editar em memória + exportar produtos.json

   HOTFIX 2026-02-24 (ANTI-WIPE FRONT):
     - Se a contagem de ativos cair demais (ex: por falso-positivo / bloqueio do ML),
       a UI entra em FAILSAFE e resgata produtos com last_ok recente para não zerar a vitrine.
   ========================================================== */

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const ADMIN = new URLSearchParams(location.search).get("admin") === "1";
  const SHOW_FEATURED_IN_GRID = true;

  const PAGE_SIZE = 60;

  // =========================
  // FRONT FAILSAFE (ANTI-WIPE)
  // =========================
  const FRONT_FAILSAFE_MIN_ACTIVE = 10;     // mínimo absoluto de ativos que a UI “aceita”
  const FRONT_FAILSAFE_MIN_RATIO = 0.35;    // ou 35% do total
  const FRONT_FAILSAFE_OK_DAYS = 7;         // resgata quem teve last_ok nos últimos N dias

  const toast = $("#toast");
  function showToast(msg = "Copiado ✅") {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1150);
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

  function baseUrl() {
    return new URL("./", window.location.href).href;
  }

  function lojaUrl() {
    return new URL("./loja.html", window.location.href).href;
  }

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

  function hostOf(url) {
    try {
      const u = new URL(String(url || ""));
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
    const x = String(u ?? "").toLowerCase().trim();
    if (!x) return false;

    if (x.includes("github.com/user-attachments/assets")) return false;

    const h = hostOf(x);
    return isMLHost(h);
  }

  function pickBestLink(raw) {
    const open = cleanUrl(raw.open_url || raw.link || raw.url || "");
    const check = cleanUrl(raw.check_url || "");
    const canonical = cleanUrl(raw.canonical_url || "");
    const resolved = cleanUrl(raw.resolved_url || "");
    const shorty = cleanUrl(raw.short_url || "");

    const candidates = [open, check, canonical, resolved, shorty].filter(Boolean);
    const primary = candidates.find(isProbablyValidLink) || "";
    const alt = candidates.find((c) => c && c !== primary && isProbablyValidLink(c)) || "";

    return { primary, alt, open, check, canonical, resolved, shorty };
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

  function normalizeProducts(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.items)) return data.items;
    return [];
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

  function tagsText(badges) {
    const arr = safeArray(badges);
    return arr
      .slice(0, 4)
      .map((t) => `#${String(t).trim().replaceAll(" ", "_")}`)
      .join(" ");
  }

  function cloneObj(o) {
    try {
      return structuredClone(o);
    } catch {
      return JSON.parse(JSON.stringify(o || {}));
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

  function adaptForUI(rawProduct) {
    const raw = cloneObj(rawProduct || {});

    const sku = cleanText(raw.sku || raw.slug || "");
    const title = cleanText(raw.title || raw.nome || raw.name || "");
    const id_busca = cleanText(raw.id_busca || raw.idML || raw.id || "");

    const badges = safeArray(raw.badges || raw.tags)
      .map(cleanText)
      .filter(Boolean);

    const active =
      (raw.active !== undefined) ? !!raw.active :
      (raw.ativo !== undefined) ? !!raw.ativo :
      true;

    const featured =
      (raw.featured === true) || (raw.destaque === true) || (raw.is_featured === true);

    const links = pickBestLink(raw);

    const image = cleanUrl(raw.image || raw.imagem || "");
    const price_text = cleanText(raw.price_text || "");

    // validações mínimas (evita lixo)
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

      // diagnóstico (não derruba UI sozinho, mas ajuda failsafe)
      guardian_last_reason: cleanText(raw.guardian_last_reason || ""),
      guardian_disabled_at: cleanText(raw.guardian_disabled_at || ""),
      guardian_dead_reason: cleanText(raw.guardian_dead_reason || ""),
      guardian_fail_count: Number(raw.guardian_fail_count || 0),

      _raw: raw,
    };
  }

  // DEDUPE forte (id_busca > canonical_url > buy_url > sku)
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
        // se duplicado e o novo é featured, substitui
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

  function featuredHTML(p, isProdutoDoDia) {
    const img = p.image
      ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:24px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const disabled = (p.active === false);
    const hasLink = String(p.buy_url || "").startsWith("http");

    const buyBtn = (disabled || !hasLink)
      ? `<button class="btn btn--gold" type="button" disabled style="opacity:.55; cursor:not-allowed;">INDISPONÍVEL</button>`
      : `<a class="btn btn--gold" href="${escapeHTML(p.buy_url)}" target="_blank" rel="noopener">COMPRAR AGORA</a>`;

    const badge = isProdutoDoDia
      ? `<div class="badge">⭐ Produto do dia</div>`
      : `<div class="badge" style="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.88);">🛒 Destaque</div>`;

    const desc = safeArray(p.badges).join(" • ");
    const tags = tagsText(p.badges);

    const altBtn = p.alt_url
      ? `<button class="btn btn--tiny btn--glass" type="button" data-action="copyAlt" data-sku="${escapeHTML(p.sku)}">Copiar Link Alt</button>`
      : ``;

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
            ${altBtn}
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
            ${p.alt_url ? `<button class="btn btn--tiny btn--glass" type="button" data-action="copyAlt" data-sku="${escapeHTML(p.sku)}">Copiar Alt</button>` : ``}
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
      ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:18px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const disabled = (p.active === false);
    const hasLink = String(p.buy_url || "").startsWith("http");

    const buy = (disabled || !hasLink)
      ? `<button class="smallBtn smallBtnGold" type="button" disabled style="opacity:.55; cursor:not-allowed;">Indisponível</button>`
      : `<a class="smallBtn smallBtnGold" href="${escapeHTML(p.buy_url)}" target="_blank" rel="noopener">Comprar</a>`;

    const desc = safeArray(p.badges).join(" • ");
    const tags = tagsText(p.badges);

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
          ${tags ? `<p class="pSmall" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(tags)}</p>` : ``}

          <div class="pActions">
            ${buy}
            <button class="smallBtn" type="button" data-action="copyId" data-sku="${escapeHTML(p.sku)}">Copiar ID</button>
            <button class="smallBtn" type="button" data-action="copyLink" data-sku="${escapeHTML(p.sku)}">Copiar Link</button>
            ${p.alt_url ? `<button class="smallBtn" type="button" data-action="copyAlt" data-sku="${escapeHTML(p.sku)}">Link Alt</button>` : ``}
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
            <br/>
            ✅ Ou use o issue <b>[CMS] Produto do Dia</b> (label <b>cms-produto-do-dia</b>) apontando o SKU.
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

  function buildTagCounts(list) {
    const counts = new Map();
    for (const p of (list || [])) {
      for (const b of safeArray(p.badges)) {
        const key = String(b || "").trim();
        if (!key) continue;
        const k = key.toLowerCase();
        counts.set(k, { label: key, n: (counts.get(k)?.n || 0) + 1 });
      }
    }
    // ordena por frequência
    return Array.from(counts.values()).sort((a, b) => b.n - a.n);
  }

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

    // preserva admin
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

    // "relev": featured primeiro, depois title
    arr.sort((a, b) => {
      const fa = a.featured ? 0 : 1;
      const fb = b.featured ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return String(a.title).localeCompare(String(b.title), "pt-BR");
    });
    return arr;
  }

  function matchesFilter(p) {
    const q = (STATE.query || "").trim().toLowerCase();
    const tag = (STATE.tag || "").trim().toLowerCase();

    if (tag) {
      const has = safeArray(p.badges).some((b) => String(b).toLowerCase() === tag);
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

    return hay.includes(q);
  }

  function renderTagChips(activeList) {
    const box = $("#tagChips");
    const totalTagsEl = $("#tagsCount");
    if (!box) return;

    const counts = buildTagCounts(activeList);
    setText(totalTagsEl, counts.length);

    // top 18 tags
    const top = counts.slice(0, 18);

    const allActive = !STATE.tag;
    const chips = [];

    chips.push(`
      <button class="tagChip ${allActive ? "tagChip--active" : ""}" type="button" data-tag="">
        👑 Tudo
      </button>
    `);

    for (const t of top) {
      const isActive = (STATE.tag || "").toLowerCase() === String(t.label).toLowerCase();
      chips.push(`
        <button class="tagChip ${isActive ? "tagChip--active" : ""}" type="button" data-tag="${escapeHTML(String(t.label).toLowerCase())}">
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
    if (fs) fs.style.display = (STATE.query || STATE.tag) ? "inline" : "none";
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

  function render() {
    const grid = $("#grid");
    const featuredEl = $("#featured");
    if (!grid || !featuredEl) return;

    const allProducts = dedupeProducts(STATE.products).filter((p) => p);

    // ativos (vendáveis) — regra base
    let activeAll = allProducts.filter((p) => p && p.active !== false);

    // FAILSAFE UI (ANTI-WIPE)
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

    // chips/categorias sempre baseadas no “ativo total”
    renderTagChips(activeAll);

    // aplica filtros
    let filtered = activeAll.filter(matchesFilter);
    filtered = applySort(filtered);

    const destaque = getFeatured(activeAll);

    // featured só “entra” se passar no filtro (se tiver filtro)
    let featuredPass = null;
    if (destaque) {
      featuredPass = matchesFilter(destaque) ? destaque : null;
    }

    // render featured bloco
    featuredEl.innerHTML = featuredPass
      ? featuredHTML(featuredPass, true)
      : (destaque ? featuredHTML(destaque, false) : emptyFeaturedHTML());

    // monta lista da grade
    let list = filtered.slice();

    if (featuredPass && SHOW_FEATURED_IN_GRID) {
      list = [featuredPass, ...list.filter((p) => p.sku !== featuredPass.sku)];
    } else if (featuredPass && !SHOW_FEATURED_IN_GRID) {
      list = list.filter((p) => p.sku !== featuredPass.sku);
    }

    // paginação
    const shown = list.slice(0, STATE.limit);
    grid.innerHTML = shown.map(productCardHTML).join("");

    // load more
    const wrap = $("#loadMoreWrap");
    if (wrap) {
      if (shown.length < list.length) wrap.classList.remove("hidden");
      else wrap.classList.add("hidden");
    }

    setCounters({
      totalActive: activeAll.length,
      totalFiltered: list.length,
      shownNow: shown.length,
    });

    updateUrlState();
  }

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

    // Se por algum motivo vier vazio, dispara fallback (melhor 1 do que 0)
    if (!deduped.length) throw new Error("Nenhum produto válido em produtos.json");

    return deduped;
  }

  // ===== ADMIN ACTIONS (em memória) =====
  function findBySku(sku) {
    return STATE.products.find((p) => p && p.sku === sku) || null;
  }

  function setFeaturedSku(sku) {
    for (const p of STATE.products) {
      if (!p) continue;
      p.featured = (p.sku === sku);
      if (p._raw) p._raw.featured = p.featured;
    }
    showToast("Produto do Dia definido ⭐");
    render();
  }

  function toggleActiveSku(sku) {
    const p = findBySku(sku);
    if (!p) return;

    p.active = !p.active;
    if (p.active === false && p.featured) p.featured = false;

    if (p._raw) {
      p._raw.active = p.active;
      p._raw.featured = p.featured;
    }

    showToast(p.active ? "Ativado ✅" : "Desativado ⛔");
    render();
  }

  function editLinkSku(sku) {
    const p = findBySku(sku);
    if (!p) return;

    const current = p.open_url || p.buy_url || p.check_url || p.canonical_url || "";
    const v = prompt("Cole o LINK do Mercado Livre (aceita https://mercadolivre.com/sec/... ou https://meli.la/...)", current);
    if (v === null) return;

    const nv = cleanUrl(String(v).trim());
    if (!nv.startsWith("http")) return alert("Link inválido. Precisa começar com http/https.");
    if (!isProbablyValidLink(nv)) return alert("Link inválido: precisa ser do Mercado Livre (mercadolivre/mercadolibre) ou shortlink (meli.la / meli.xx).");

    p.open_url = nv;
    p.check_url = nv;
    p.buy_url = nv;

    if (p._raw) {
      p._raw.open_url = nv;
      p._raw.check_url = nv;
    }

    showToast("Link atualizado ✅");
    render();
  }

  function editIdSku(sku) {
    const p = findBySku(sku);
    if (!p) return;

    const v = prompt("Cole o ID de busca (ex: 5J5PKG-JBQE)", p.id_busca || "");
    if (v === null) return;

    p.id_busca = cleanText(v);
    if (p._raw) p._raw.id_busca = p.id_busca;

    showToast("ID atualizado ✅");
    render();
  }

  function editBadgesSku(sku) {
    const p = findBySku(sku);
    if (!p) return;

    const current = safeArray(p.badges).join(", ");
    const v = prompt("Badges (separe por vírgula)", current);
    if (v === null) return;

    p.badges = String(v).split(",").map((s) => cleanText(s)).filter(Boolean);
    if (p._raw) p._raw.badges = p.badges.slice();

    showToast("Badges atualizadas ✅");
    render();
  }

  function editPriceSku(sku) {
    const p = findBySku(sku);
    if (!p) return;

    const v = prompt("Preço/Texto (ex: R$ 199,90 • Frete grátis)", p.price_text || "");
    if (v === null) return;

    p.price_text = cleanText(v);
    if (p._raw) p._raw.price_text = p.price_text;

    showToast("Preço atualizado ✅");
    render();
  }

  function exportProdutosJson() {
    const out = {
      updated_at: new Date().toISOString(),
      products: dedupeProducts(STATE.products).map((p) => {
        const r = cloneObj(p._raw || {});

        r.sku = p.sku;
        r.title = p.title;
        r.badges = safeArray(p.badges);
        r.id_busca = p.id_busca;

        r.open_url = p.open_url || p.buy_url || "";
        r.check_url = p.check_url || r.open_url || "";

        if (p.canonical_url) r.canonical_url = p.canonical_url;
        if (p.short_url) r.short_url = p.short_url;
        if (p.resolved_url) r.resolved_url = p.resolved_url;

        r.image = p.image || r.image || "";
        r.price_text = p.price_text || "";

        r.active = (p.active !== false);
        r.featured = (p.featured === true);

        r.last_checked = p.last_checked || r.last_checked || "";
        r.last_ok = p.last_ok || r.last_ok || "";

        // remove lixo de UI
        delete r._raw;
        return r;
      }),
    };

    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "produtos.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("Exportado ⬇️");
  }

  // ===== EVENTS =====
  function bind() {
    const q = $("#qLoja");
    const clear = $("#btnClear");
    const copyBtn = $("#btnCopyLoja");
    const homeBtn = $("#btnHome");

    const sortSel = $("#sortSel");
    const moreBtn = $("#btnMore");

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
        STATE.limit = PAGE_SIZE;

        // reset chips active
        render();
        showToast("Filtro limpo ✅");
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        copyText(lojaUrl());
      });
    }

    if (homeBtn) {
      homeBtn.addEventListener("click", () => {
        // navega normal
      });
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

    // delegação de clicks (copy + tags + admin)
    document.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tag]");
      if (chip && chip.classList.contains("tagChip")) {
        const t = String(chip.getAttribute("data-tag") || "").trim();
        STATE.tag = t; // já vem lower
        STATE.limit = PAGE_SIZE;
        render();
        return;
      }

      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.getAttribute("data-action");
      const sku = el.getAttribute("data-sku") || "";
      const p = sku ? findBySku(sku) : null;

      if (action === "copyLink" && p) return copyText(p.buy_url || p.open_url || "");
      if (action === "copyAlt" && p) return copyText(p.alt_url || p.canonical_url || p.check_url || "");
      if (action === "copyId" && p) return copyText(p.id_busca || "");

      if (!ADMIN) return;

      if (action === "setFeatured") return setFeaturedSku(sku);
      if (action === "toggleActive") return toggleActiveSku(sku);
      if (action === "editLink") return editLinkSku(sku);
      if (action === "editId") return editIdSku(sku);
      if (action === "editBadges") return editBadgesSku(sku);
      if (action === "editPrice") return editPriceSku(sku);
    });

    // admin bar
    if (ADMIN) {
      const adminBar = $("#adminBar");
      if (adminBar) adminBar.style.display = "flex";

      const btnExport = $("#btnExport");
      const btnReload = $("#btnReload");

      if (btnExport) btnExport.addEventListener("click", exportProdutosJson);
      if (btnReload) {
        btnReload.addEventListener("click", async () => {
          showToast("Recarregando…");
          try {
            STATE.products = await fetchProducts();
            showToast("Carregado ✅");
            STATE.limit = PAGE_SIZE;
            render();
          } catch {
            alert("Erro ao carregar produtos.json");
          }
        });
      }
    }
  }

  // ===== STATE =====
  const STATE = {
    products: [],
    updated_at: "",
    query: "",
    tag: "",
    sort: "relev",
    limit: PAGE_SIZE,
    _failsafeNotified: false,
  };

  async function boot() {
    readUrlState();

    // status no topo
    setText($("#year"), new Date().getFullYear());

    try {
      STATE.products = await fetchProducts();
    } catch {
      // fallback mínimo (não quebra)
      STATE.products = [{
        sku: "fallback-power-bank-20000mah",
        title: "Power Bank 20000mAh — Carga Rápida 22.5W Turbo USB-C (Preto)",
        badges: ["Achados do Dia", "20000mAh", "22.5W Turbo", "USB-C", "Preto"],
        id_busca: "5J5PKG-H0JA",
        open_url: "https://mercadolivre.com/sec/1iReZ7Y",
        check_url: "https://mercadolivre.com/sec/1iReZ7Y",
        canonical_url: "https://lista.mercadolivre.com.br/5J5PKG-H0JA",
        short_url: "",
        resolved_url: "",
        image: "assets/produtos/power_bank_20000mah.png",
        price_text: "",
        active: true,
        featured: true,
        last_checked: "",
        last_ok: "",
      }].map(adaptForUI).filter(Boolean);
    }

    // aplica estado do URL (q/tag/sort)
    const q = $("#qLoja");
    if (q) q.value = STATE.query || "";

    const sortSel = $("#sortSel");
    if (sortSel) sortSel.value = STATE.sort || "relev";

    // se tag veio do URL, mantém
    STATE.tag = (STATE.tag || "").toLowerCase().trim();

    bind();
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
