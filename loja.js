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

  function findBySku(sku) {
    return STATE.products.find((p) => p && p.sku === sku) || null;
  }

  function buildProdutosJsonSnapshot() {
    return {
      updated_at: new Date().toISOString(),
      products: dedupeProducts(STATE.products).map((p) => {
        const r = cloneObj(p._raw || {});
        r.sku = p.sku;
        r.title = p.title;
        r.badges = safeArray(p.badges);
        r.id_busca = p.id_busca;

        const b = bestBuyUrl(p);
        r.open_url = ensureHttpUrl(p.open_url || b || "");
        r.check_url = ensureHttpUrl(p.check_url || r.open_url || "");

        if (p.canonical_url) r.canonical_url = p.canonical_url;
        if (p.short_url) r.short_url = p.short_url;
        if (p.resolved_url) r.resolved_url = p.resolved_url;

        r.image = p.image || r.image || "";
        r.price_text = p.price_text || "";

        r.active = (p.active !== false);
        r.featured = (p.featured === true);

        r.last_checked = p.last_checked || r.last_checked || "";
        r.last_ok = p.last_ok || r.last_ok || "";

        delete r._raw;
        return r;
      }),
    };
  }

  function exportProdutosJson() {
    const out = buildProdutosJsonSnapshot();
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "produtos.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("Exportado ⬇️");
  }

  function exportProdutosJsonTxt() {
    const out = buildProdutosJsonSnapshot();
    const txt = JSON.stringify(out, null, 2);
    downloadFile("produtos.json.txt", txt, "text/plain;charset=utf-8");
    showToast("produtos.json em TXT ⬇️");
  }

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

  function exportListGet(kind) {
    const snap = STATE._export || {};
    if (kind === "all") return Array.isArray(snap.all) ? snap.all : [];
    if (kind === "active") return Array.isArray(snap.active) ? snap.active : [];
    if (kind === "visible") return Array.isArray(snap.visible) ? snap.visible : [];
    return [];
  }

  function exportListTxt(kind) {
    const snap = STATE._export || {};
    const list = exportListGet(kind);

    const now = new Date().toLocaleString("pt-BR");
    const title =
      kind === "all" ? "LISTA (TUDO)" :
      kind === "visible" ? "LISTA (VISÍVEL / FILTRADA)" :
      "LISTA (ATIVOS)";

    const header = [
      "Cosa Nostra — Loja Completa",
      title,
      `Gerado em: ${now}`,
      snap.updated_at ? `updated_at: ${snap.updated_at}` : "",
      `Total: ${list.length}`,
      (kind === "visible" && (snap.query || snap.tag))
        ? `Filtro: q="${snap.query || ""}" tag="${snap.tag || ""}" sort="${snap.sort || "relev"}"`
        : "",
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

  function exportListCsv(kind) {
    const list = exportListGet(kind);

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

  function doExportTxt(kind) {
    const txt = exportListTxt(kind);
    const fname = `lista_${fileSafe(kind)}_${dateStamp()}.txt`;
    downloadFile(fname, txt, "text/plain;charset=utf-8");
    showToast("Lista baixada ⬇️");
  }

  function doExportCsv(kind) {
    const csv = exportListCsv(kind);
    const fname = `lista_${fileSafe(kind)}_${dateStamp()}.csv`;
    downloadFile(fname, csv, "text/csv;charset=utf-8");
    showToast("CSV baixado ⬇️");
  }

  async function doCopyTxt(kind) {
    const txt = exportListTxt(kind);
    await copyText(txt);
    showToast("Lista copiada ✅");
  }

  function makeBgClickThrough() {
    const bg = document.querySelector(".bg");
    if (!bg) return;
    bg.style.pointerEvents = "none";
    bg.querySelectorAll("*").forEach((el) => { el.style.pointerEvents = "none"; });
  }

  function bind() {
    const q = $("#qLoja");
    const clear = $("#btnClear");
    const copyBtn = $("#btnCopyLoja");
    const copyPageBtn = $("#btnCopyPage");
    const btnExportCatalogTxt = $("#btnExportCatalogTxt");
    const sortSel = $("#sortSel");
    const moreBtn = $("#btnMore");

    if (q) {
      q.value = STATE.query || "";
      q.addEventListener("input", (e) => {
        STATE.query = String(e.target.value || "");
        STATE.limit = PAGE_SIZE;
        render();

        clearTimeout(STATE._searchTimer);
        STATE._searchTimer = setTimeout(() => {
          const query = String(q.value || "").trim();
          if (!query) return;
          trackEvent("search_loja", {
            page_type: "loja",
            query,
            placement: "search_box",
            active_filter_tag: String(STATE.tag || ""),
            active_sort: String(STATE.sort || "relev")
          });
        }, 700);
      });
    }

    if (clear) {
      clear.addEventListener("click", () => {
        if (q) q.value = "";
        STATE.query = "";
        STATE.tag = "";
        STATE.limit = PAGE_SIZE;
        render();
        showToast("Filtro limpo ✅");
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();

        trackEvent("click_copy_store_link", {
          page_type: "loja",
          placement: "hero_copy_store_link"
        });

        copyText(lojaUrl());
      });
    }

    if (copyPageBtn) {
      copyPageBtn.addEventListener("click", () => {
        trackEvent("click_copy_page_link_loja", {
          page_type: "loja",
          placement: "footer_copy_page_link"
        });

        copyText(location.href);
      });
    }

    if (btnExportCatalogTxt) {
      btnExportCatalogTxt.addEventListener("click", () => {
        exportProdutosJsonTxt();
      });
    }

    if (sortSel) {
      sortSel.value = STATE.sort || "relev";
      sortSel.addEventListener("change", (e) => {
        STATE.sort = String(e.target.value || "relev");
        STATE.limit = PAGE_SIZE;

        trackEvent("sort_change", {
          page_type: "loja",
          sort: STATE.sort,
          placement: "sort_select",
          query: String(STATE.query || ""),
          active_filter_tag: String(STATE.tag || "")
        });

        render();
      });
    }

    if (moreBtn) {
      moreBtn.addEventListener("click", () => {
        STATE.limit += PAGE_SIZE;

        trackEvent("click_load_more", {
          page_type: "loja",
          placement: "load_more_button",
          query: String(STATE.query || ""),
          active_filter_tag: String(STATE.tag || ""),
          active_sort: String(STATE.sort || "relev")
        });

        render();
      });
    }

    (function ensureExportRow(){
      const tools = document.querySelector(".lojaTools");
      if (!tools) return;
      if (document.getElementById("cnExportRow")) return;

      const row = document.createElement("div");
      row.className = "toolRow cnToolsRow";
      row.id = "cnExportRow";

      const isMobile = window.matchMedia("(max-width: 720px)").matches;
      const openAttr = isMobile ? "" : "open";

      row.innerHTML = `
        <details class="cnTools" ${openAttr}>
          <summary class="btn btn--tiny btn--glass">
            <span class="cnToolsSummary">
              <span>🧾 Ferramentas (listas/export)</span>
              <span style="opacity:.75;">${isMobile ? "abrir" : "ok"}</span>
            </span>
          </summary>

          <div class="cnToolsGrid">
            <button class="btn btn--tiny btn--glass" type="button" id="btnCopyList">📋 Copiar (ativos)</button>
            <button class="btn btn--tiny btn--gold"  type="button" id="btnDlList">⬇️ TXT (ativos)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlListAll">⬇️ TXT (tudo)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlCsvAll">⬇️ CSV (tudo)</button>
          </div>
        </details>
      `;
      tools.appendChild(row);
    })();

    const btnCopyList = $("#btnCopyList");
    const btnDlList = $("#btnDlList");
    const btnDlListAll = $("#btnDlListAll");
    const btnDlCsvAll = $("#btnDlCsvAll");

    if (btnCopyList) btnCopyList.addEventListener("click", () => doCopyTxt("active"));
    if (btnDlList) btnDlList.addEventListener("click", () => doExportTxt("active"));
    if (btnDlListAll) btnDlListAll.addEventListener("click", () => doExportTxt("all"));
    if (btnDlCsvAll) btnDlCsvAll.addEventListener("click", () => doExportCsv("all"));

    document.addEventListener("click", (e) => {
      const openCats = e.target.closest('[data-action="openTags"]');
      if (openCats) {
        e.preventDefault();
        openTagModal();
        return;
      }

      const aBuy = e.target.closest('a.btn--gold[href], a.smallBtnGold[href]');
      if (aBuy) {
        const href = aBuy.getAttribute("href") || aBuy.href || "";
        const card = aBuy.closest(".pCard");
        const sku = card ? (card.getAttribute("data-sku") || "") : "";
        const p = sku ? findBySku(sku) : (STATE._lastFeaturedShown || null);

        if (p) {
          trackEvent("click_buy", getTrackProduct(p, {
            placement: card ? "grid_buy" : "featured_buy",
            source_block: card ? "loja_grid" : "featured_loja",
            position_on_page: card ? null : 1
          }));
        }

        e.preventDefault();

        if (!isBuyableProductLink(href)) {
          showToast("Produto sem link direto válido. Revisar no Guardian.");
          return;
        }

        openBuy(href);
        return;
      }

      const chip = e.target.closest("[data-tag]");
      if (chip && chip.classList.contains("tagChip")) {
        const t = String(chip.getAttribute("data-tag") || "").trim();

        trackEvent("filter_tag", {
          page_type: "loja",
          tag: t,
          placement: "tag_chip",
          query: String(STATE.query || ""),
          active_sort: String(STATE.sort || "relev")
        });

        STATE.tag = t;
        STATE.limit = PAGE_SIZE;
        render();
        return;
      }

      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.getAttribute("data-action");
      const sku = el.getAttribute("data-sku") || "";
      const p = sku ? findBySku(sku) : null;

      if (action === "copyLink" && p) {
        const link = bestBuyUrl(p) || "";
        if (!link) {
          showToast("Produto sem link direto válido.");
          return;
        }

        trackEvent("click_copy_link", getTrackProduct(p, {
          placement: getActionPlacement(el, action),
          source_block: getActionSourceBlock(el)
        }));
        return copyText(link);
      }

      if (action === "copyAlt" && p) {
        const alt = ensureHttpUrl(p.alt_url || "");
        if (!alt) {
          showToast("Produto sem link alternativo válido.");
          return;
        }

        trackEvent("click_copy_alt", getTrackProduct(p, {
          placement: getActionPlacement(el, action),
          source_block: getActionSourceBlock(el)
        }));
        return copyText(alt);
      }

      if (action === "copyId" && p) {
        trackEvent("click_copy_id", getTrackProduct(p, {
          placement: getActionPlacement(el, action),
          source_block: getActionSourceBlock(el)
        }));
        return copyText(p.id_busca || "");
      }

      if (!ADMIN) return;
    });

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

  const STATE = {
    products: [],
    updated_at: "",
    query: "",
    tag: "",
    sort: "relev",
    limit: PAGE_SIZE,
    _failsafeNotified: false,
    _export: null,
    _categoryCounts: [],
    _activeCount: 0,
    _trackedViews: {
      featured: {},
      grid: {}
    },
    _lastFeaturedShown: null,
    _searchTimer: null,
  };

  async function boot() {
    injectUiCss();
    makeBgClickThrough();
    ensureTagModal();

    readUrlState();
    setText($("#year"), new Date().getFullYear());

    try {
      if (window.CNTracking && typeof window.CNTracking.init === "function") {
        window.CNTracking.init({
          pageType: "loja",
          autoPageView: false,
          debug: false
        });

        trackEvent("page_view_loja", {
          page_type: "loja"
        });
      }
    } catch {}

    try {
      STATE.products = await fetchProducts();
    } catch {
      STATE.products = [{
        sku: "fallback-power-bank-20000mah",
        title: "Power Bank 20000mAh — Carga Rápida 22.5W Turbo USB-C (Preto)",
        badges: ["Achados do Dia", "USB-C", "Preto"],
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

    const q = $("#qLoja");
    if (q) q.value = STATE.query || "";

    const sortSel = $("#sortSel");
    if (sortSel) sortSel.value = STATE.sort || "relev";

    STATE.tag = (STATE.tag || "").toLowerCase().trim();

    bind();
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
  function pickBestLink(raw) {
    const open = ensureHttpUrl(raw.open_url || raw.link || raw.url || "");
    const check = ensureHttpUrl(raw.check_url || "");
    const canonical = ensureHttpUrl(raw.canonical_url || "");
    const resolved = ensureHttpUrl(raw.resolved_url || "");
    const shorty = ensureHttpUrl(raw.short_url || "");

    const candidates = Array.from(
      new Set([open, check, canonical, resolved, shorty].filter(Boolean))
    );

    const primary = candidates.find(isBuyableProductLink) || "";
    const alt = candidates.find((c) => c && c !== primary && isBuyableProductLink(c)) || "";
    const diagnostic = candidates.find((c) => c && c !== primary && !isBuyableProductLink(c) && isProbablyValidLink(c)) || "";

    return { primary, alt, diagnostic, open, check, canonical, resolved, shorty };
  }

  function bestBuyUrl(p) {
    const candidates = [
      p.buy_url,
      p.open_url,
      p.check_url,
      p.canonical_url,
      p.short_url,
      p.resolved_url
    ]
      .map(ensureHttpUrl)
      .filter(Boolean);

    return candidates.find(isBuyableProductLink) || "";
  }

  function openBuy(url) {
    const u = ensureHttpUrl(url);
    if (!u) {
      showToast("Produto sem link válido.");
      return false;
    }

    if (!isBuyableProductLink(u)) {
      showToast("Link de compra inválido. Produto precisa de revisão.");
      return false;
    }

    if (isMobileLike()) {
      try {
        window.location.href = u;
        return true;
      } catch {
        showToast("Não consegui abrir o produto.");
        return false;
      }
    }

    try {
      const w = window.open(u, "_blank", "noopener,noreferrer");
      if (w) {
        try { w.opener = null; } catch {}
        return true;
      }
    } catch {}

    try {
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {}

    showToast("O navegador bloqueou a nova guia. Permita pop-ups para abrir o produto.");
    return false;
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
      diagnostic_url: links.diagnostic || "",

      image,
      price_text,

      active,
      featured,

      last_checked: cleanText(raw.last_checked || ""),
      last_ok: cleanText(raw.last_ok || ""),

      guardian_last_reason: cleanText(raw.guardian_last_reason || ""),
      guardian_disabled_at: cleanText(raw.guardian_disabled_at || ""),
      guardian_dead_reason: cleanText(raw.guardian_dead_reason || ""),
      guardian_fail_count: Number(raw.guardian_fail_count || 0),

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
  function trackEvent(eventName, payload = {}) {
    try {
      if (!window.CNTracking || typeof window.CNTracking.track !== "function") return;
      window.CNTracking.track(eventName, payload);
    } catch {}
  }

  function getTrackProduct(p, extra = {}) {
    return {
      page_type: "loja",
      sku: String((p && p.sku) || ""),
      product_title: String((p && p.title) || ""),
      id_busca: String((p && p.id_busca) || ""),
      badges: safeArray((p && p.badges) || []),
      featured: !!(p && p.featured === true),
      position_on_page: Number.isFinite(Number(extra.position_on_page)) ? Number(extra.position_on_page) : null,
      placement: String(extra.placement || ""),
      source_block: String(extra.source_block || ""),
      query: String(STATE.query || ""),
      active_filter_tag: String(STATE.tag || ""),
      active_sort: String(STATE.sort || "relev"),
    };
  }

  function trackViewOnce(kind, sku, payloadBuilder) {
    if (!sku) return;
    if (!STATE._trackedViews[kind]) STATE._trackedViews[kind] = {};
    if (STATE._trackedViews[kind][sku]) return;
    STATE._trackedViews[kind][sku] = true;
    payloadBuilder();
  }

  function getActionPlacement(el, action) {
    const inGrid = !!el.closest(".pCard");
    if (action === "copyId") return inGrid ? "grid_copy_id" : "featured_copy_id";
    if (action === "copyLink") return inGrid ? "grid_copy_link" : "featured_copy_link";
    if (action === "copyAlt") return inGrid ? "grid_copy_alt" : "featured_copy_alt";
    return inGrid ? "grid_action" : "featured_action";
  }

  function getActionSourceBlock(el) {
    return el.closest(".pCard") ? "loja_grid" : "featured_loja";
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
        const raw = String(b || "").trim();
        if (!raw) continue;
        const k = raw.toLowerCase();
        const prev = counts.get(k);
        counts.set(k, { label: raw, n: ((prev && prev.n) ? prev.n : 0) + 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.n - a.n);
  }

  function normalizeTagKey(s) {
    return String(s || "").trim().toLowerCase();
  }
  function isNoisyTag(label) {
    const s = String(label || "").trim();
    if (!s) return true;

    const t = s.toLowerCase();

    if (CN_CAT_NOISE.has(t)) return true;
    if (CN_CAT_BRANDS.has(t)) return true;

    if (t.length > 26) return true;

    if (/\d/.test(t) && !CN_CAT_ALLOW_DIGITS.has(t)) return true;

    if (/^[0-9]+([.,][0-9]+)?\s*(w|wh|mah|ah|v|a|hz|gb|tb|mbps|psi|cm|mm|kg|l|ml|m|s)?$/i.test(t)) return true;
    if (/^(abnt|ip\d{2}|ipx\d)$/i.test(t)) return true;
    if (/^\d+\s*(tomadas|portas|peças|unidades|baterias)$/i.test(t)) return true;

    if (/[()\/+]/.test(t)) return true;

    return false;
  }

  function isCategoryTag(label, n) {
    if ((n || 0) < CN_CAT_MIN_COUNT) {
      const key = normalizeTagKey(label);
      const pinned = CN_CAT_PINNED.some((x) => normalizeTagKey(x) === key);
      if (!pinned) return false;
    }
    if (isNoisyTag(label)) return false;
    return true;
  }

  function orderCategories(list) {
    const map = new Map(list.map((x) => [normalizeTagKey(x.label), x]));
    const out = [];

    for (const pin of CN_CAT_PINNED) {
      const k = normalizeTagKey(pin);
      if (map.has(k)) {
        const it = map.get(k);
        out.push({ label: pin, n: it.n });
        map.delete(k);
      }
    }

    const rest = Array.from(map.values()).sort((a, b) => b.n - a.n);
    return out.concat(rest);
  }

  function setText(el, v) {
    if (!el) return;
    el.textContent = String(v ?? "");
  }

  function updateUrlState() {
    const sp = new URLSearchParams(location.search);
    if (STATE.query) sp.set("q", STATE.query); else sp.delete("q");
    if (STATE.tag) sp.set("tag", STATE.tag); else sp.delete("tag");
    if (STATE.sort && STATE.sort !== "relev") sp.set("sort", STATE.sort); else sp.delete("sort");
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

    const parts = q.split(/\s+/g).filter(Boolean);
    for (const part of parts) {
      if (!hay.includes(part)) return false;
    }
    return true;
  }

  function ensureTagModal() {
    if (document.getElementById("cnTagModal")) return;

    const modal = document.createElement("div");
    modal.id = "cnTagModal";
    modal.className = "cnModal";
    modal.innerHTML = `
      <div class="cnModal__panel" role="dialog" aria-modal="true" aria-label="Categorias">
        <div class="cnModal__head">
          <div class="cnModal__title">🏷️ Categorias</div>
          <button class="cnModal__close" type="button" id="cnTagClose">Fechar ✕</button>
        </div>
        <div class="cnModal__search">
          <input id="cnTagSearch" placeholder="Buscar categoria..." autocomplete="off" />
        </div>
        <div class="cnModal__list" id="cnTagList"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeTagModal();
    });

    const btnClose = document.getElementById("cnTagClose");
    if (btnClose) btnClose.addEventListener("click", closeTagModal);

    const inp = document.getElementById("cnTagSearch");
    if (inp) inp.addEventListener("input", () => renderTagModalList());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeTagModal();
    });
  }

  function openTagModal() {
    ensureTagModal();
    const modal = document.getElementById("cnTagModal");
    if (!modal) return;

    const inp = document.getElementById("cnTagSearch");
    if (inp) inp.value = "";

    renderTagModalList();
    modal.classList.add("show");

    try { if (inp) inp.focus(); } catch {}
  }

  function closeTagModal() {
    const modal = document.getElementById("cnTagModal");
    if (!modal) return;
    modal.classList.remove("show");
  }

  function renderTagModalList() {
    const listEl = document.getElementById("cnTagList");
    if (!listEl) return;

    const all = Array.isArray(STATE._categoryCounts) ? STATE._categoryCounts.slice() : [];
    const q = normalizeTagKey((document.getElementById("cnTagSearch") || {}).value || "");

    const filtered = q
      ? all.filter((t) => normalizeTagKey(t.label).includes(q))
      : all;

    const activeKey = normalizeTagKey(STATE.tag || "");

    const items = [];
    items.push(`
      <button type="button" class="${!activeKey ? "active" : ""}" data-tag="">
        👑 Tudo <span style="opacity:.75;">(${STATE._activeCount || 0})</span>
      </button>
    `);

    for (const t of filtered) {
      const key = normalizeTagKey(t.label);
      const isActive = (activeKey === key);
      items.push(`
        <button type="button" class="${isActive ? "active" : ""}" data-tag="${escapeHTML(key)}">
          ${escapeHTML(t.label)} <span style="opacity:.75;">(${t.n})</span>
        </button>
      `);
    }

    listEl.innerHTML = items.join("");

    listEl.onclick = (ev) => {
      const btn = ev.target.closest("button[data-tag]");
      if (!btn) return;

      const tag = String(btn.getAttribute("data-tag") || "").trim();

      trackEvent("filter_tag", {
        page_type: "loja",
        tag: tag,
        placement: "tag_modal",
        query: String(STATE.query || ""),
        active_sort: String(STATE.sort || "relev")
      });

      STATE.tag = tag;
      STATE.limit = PAGE_SIZE;
      closeTagModal();
      render();
    };
  }

  function renderTagChips(activeList) {
    const box = $("#tagChips");
    const totalTagsEl = $("#tagsCount");
    if (!box) return;

    const countsAll = buildTagCounts(activeList);
    const categoriesRaw = countsAll.filter((t) => isCategoryTag(t.label, t.n));
    const categories = orderCategories(categoriesRaw);

    STATE._categoryCounts = categories.slice();
    STATE._activeCount = (activeList || []).length;

    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const maxChips = isMobile ? CN_CAT_MAX_CHIPS_MOBILE : CN_CAT_MAX_CHIPS_DESKTOP;

    let top = categories.slice(0, maxChips);

    const activeKey = normalizeTagKey(STATE.tag || "");
    if (activeKey && !top.some((t) => normalizeTagKey(t.label) === activeKey)) {
      const sel = categories.find((t) => normalizeTagKey(t.label) === activeKey);
      if (sel) top = [sel, ...top].slice(0, maxChips);
    }

    setText(totalTagsEl, categories.length > top.length ? `${top.length}+` : `${top.length}`);

    const allActive = !STATE.tag;
    const chips = [];

    chips.push(`
      <button class="tagChip ${allActive ? "tagChip--active" : ""}" type="button" data-tag="">
        👑 Tudo
      </button>
    `);

    for (const t of top) {
      const isActive = normalizeTagKey(STATE.tag) === normalizeTagKey(t.label);
      chips.push(`
        <button class="tagChip ${isActive ? "tagChip--active" : ""}" type="button" data-tag="${escapeHTML(normalizeTagKey(t.label))}">
          ${escapeHTML(t.label)} <span style="opacity:.75;">(${t.n})</span>
        </button>
      `);
    }

    if (categories.length > top.length) {
      chips.push(`
        <button class="tagChip" type="button" data-action="openTags">
          🔎 Ver todas (${categories.length})
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

    let featuredPass = null;
    if (destaque) featuredPass = matchesFilter(destaque) ? destaque : null;

    STATE._lastFeaturedShown = featuredPass || destaque || null;

    featuredEl.innerHTML = featuredPass
      ? featuredHTML(featuredPass, true)
      : (destaque ? featuredHTML(destaque, false) : emptyFeaturedHTML());

    if (featuredPass) {
      trackViewOnce("featured", featuredPass.sku, () => {
        trackEvent("view_featured_loja", getTrackProduct(featuredPass, {
          placement: "featured_top",
          source_block: "featured_loja",
          position_on_page: 1
        }));
      });
    } else if (destaque) {
      trackViewOnce("featured", destaque.sku, () => {
        trackEvent("view_featured_loja", getTrackProduct(destaque, {
          placement: "featured_auto",
          source_block: "featured_loja",
          position_on_page: 1
        }));
      });
    }

    applyImageFixes(featuredEl);

    let list = filtered.slice();

    if (featuredPass && SHOW_FEATURED_IN_GRID) {
      list = [featuredPass, ...list.filter((p) => p.sku !== featuredPass.sku)];
    } else if (featuredPass && !SHOW_FEATURED_IN_GRID) {
      list = list.filter((p) => p.sku !== featuredPass.sku);
    }

    const shown = list.slice(0, STATE.limit);
    grid.innerHTML = shown.map(productCardHTML).join("");

    shown.forEach((p, idx) => {
      trackViewOnce("grid", p.sku, () => {
        trackEvent("view_product_card", getTrackProduct(p, {
          placement: "grid_card",
          source_block: "loja_grid",
          position_on_page: idx + 1
        }));
      });
    });

    applyImageFixes(grid);

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

    STATE._export = {
      updated_at: STATE.updated_at || "",
      all: allProducts.slice(),
      active: activeAll.slice(),
      visible: list.slice(),
      query: STATE.query || "",
      tag: STATE.tag || "",
      sort: STATE.sort || "relev",
    };

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
    if (!deduped.length) throw new Error("Nenhum produto válido em produtos.json");

    return deduped;
  }

  function findBySku(sku) {
    return STATE.products.find((p) => p && p.sku === sku) || null;
  }

  function buildProdutosJsonSnapshot() {
    return {
      updated_at: new Date().toISOString(),
      products: dedupeProducts(STATE.products).map((p) => {
        const r = cloneObj(p._raw || {});
        r.sku = p.sku;
        r.title = p.title;
        r.badges = safeArray(p.badges);
        r.id_busca = p.id_busca;

        const b = bestBuyUrl(p);
        r.open_url = ensureHttpUrl(p.open_url || b || "");
        r.check_url = ensureHttpUrl(p.check_url || r.open_url || "");

        if (p.canonical_url) r.canonical_url = p.canonical_url;
        if (p.short_url) r.short_url = p.short_url;
        if (p.resolved_url) r.resolved_url = p.resolved_url;

        r.image = p.image || r.image || "";
        r.price_text = p.price_text || "";

        r.active = (p.active !== false);
        r.featured = (p.featured === true);

        r.last_checked = p.last_checked || r.last_checked || "";
        r.last_ok = p.last_ok || r.last_ok || "";

        delete r._raw;
        return r;
      }),
    };
  }

  function exportProdutosJson() {
    const out = buildProdutosJsonSnapshot();
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "produtos.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("Exportado ⬇️");
  }

  function exportProdutosJsonTxt() {
    const out = buildProdutosJsonSnapshot();
    const txt = JSON.stringify(out, null, 2);
    downloadFile("produtos.json.txt", txt, "text/plain;charset=utf-8");
    showToast("produtos.json em TXT ⬇️");
  }

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

  function exportListGet(kind) {
    const snap = STATE._export || {};
    if (kind === "all") return Array.isArray(snap.all) ? snap.all : [];
    if (kind === "active") return Array.isArray(snap.active) ? snap.active : [];
    if (kind === "visible") return Array.isArray(snap.visible) ? snap.visible : [];
    return [];
  }

  function exportListTxt(kind) {
    const snap = STATE._export || {};
    const list = exportListGet(kind);

    const now = new Date().toLocaleString("pt-BR");
    const title =
      kind === "all" ? "LISTA (TUDO)" :
      kind === "visible" ? "LISTA (VISÍVEL / FILTRADA)" :
      "LISTA (ATIVOS)";

    const header = [
      "Cosa Nostra — Loja Completa",
      title,
      `Gerado em: ${now}`,
      snap.updated_at ? `updated_at: ${snap.updated_at}` : "",
      `Total: ${list.length}`,
      (kind === "visible" && (snap.query || snap.tag))
        ? `Filtro: q="${snap.query || ""}" tag="${snap.tag || ""}" sort="${snap.sort || "relev"}"`
        : "",
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

  function exportListCsv(kind) {
    const list = exportListGet(kind);

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

  function doExportTxt(kind) {
    const txt = exportListTxt(kind);
    const fname = `lista_${fileSafe(kind)}_${dateStamp()}.txt`;
    downloadFile(fname, txt, "text/plain;charset=utf-8");
    showToast("Lista baixada ⬇️");
  }

  function doExportCsv(kind) {
    const csv = exportListCsv(kind);
    const fname = `lista_${fileSafe(kind)}_${dateStamp()}.csv`;
    downloadFile(fname, csv, "text/csv;charset=utf-8");
    showToast("CSV baixado ⬇️");
  }

  async function doCopyTxt(kind) {
    const txt = exportListTxt(kind);
    await copyText(txt);
    showToast("Lista copiada ✅");
  }

  function makeBgClickThrough() {
    const bg = document.querySelector(".bg");
    if (!bg) return;
    bg.style.pointerEvents = "none";
    bg.querySelectorAll("*").forEach((el) => { el.style.pointerEvents = "none"; });
  }

  function bind() {
    const q = $("#qLoja");
    const clear = $("#btnClear");
    const copyBtn = $("#btnCopyLoja");
    const copyPageBtn = $("#btnCopyPage");
    const btnExportCatalogTxt = $("#btnExportCatalogTxt");
    const sortSel = $("#sortSel");
    const moreBtn = $("#btnMore");

    if (q) {
      q.value = STATE.query || "";
      q.addEventListener("input", (e) => {
        STATE.query = String(e.target.value || "");
        STATE.limit = PAGE_SIZE;
        render();

        clearTimeout(STATE._searchTimer);
        STATE._searchTimer = setTimeout(() => {
          const query = String(q.value || "").trim();
          if (!query) return;
          trackEvent("search_loja", {
            page_type: "loja",
            query,
            placement: "search_box",
            active_filter_tag: String(STATE.tag || ""),
            active_sort: String(STATE.sort || "relev")
          });
        }, 700);
      });
    }

    if (clear) {
      clear.addEventListener("click", () => {
        if (q) q.value = "";
        STATE.query = "";
        STATE.tag = "";
        STATE.limit = PAGE_SIZE;
        render();
        showToast("Filtro limpo ✅");
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();

        trackEvent("click_copy_store_link", {
          page_type: "loja",
          placement: "hero_copy_store_link"
        });

        copyText(lojaUrl());
      });
    }

    if (copyPageBtn) {
      copyPageBtn.addEventListener("click", () => {
        trackEvent("click_copy_page_link_loja", {
          page_type: "loja",
          placement: "footer_copy_page_link"
        });

        copyText(location.href);
      });
    }

    if (btnExportCatalogTxt) {
      btnExportCatalogTxt.addEventListener("click", () => {
        exportProdutosJsonTxt();
      });
    }

    if (sortSel) {
      sortSel.value = STATE.sort || "relev";
      sortSel.addEventListener("change", (e) => {
        STATE.sort = String(e.target.value || "relev");
        STATE.limit = PAGE_SIZE;

        trackEvent("sort_change", {
          page_type: "loja",
          sort: STATE.sort,
          placement: "sort_select",
          query: String(STATE.query || ""),
          active_filter_tag: String(STATE.tag || "")
        });

        render();
      });
    }

    if (moreBtn) {
      moreBtn.addEventListener("click", () => {
        STATE.limit += PAGE_SIZE;

        trackEvent("click_load_more", {
          page_type: "loja",
          placement: "load_more_button",
          query: String(STATE.query || ""),
          active_filter_tag: String(STATE.tag || ""),
          active_sort: String(STATE.sort || "relev")
        });

        render();
      });
    }

    (function ensureExportRow(){
      const tools = document.querySelector(".lojaTools");
      if (!tools) return;
      if (document.getElementById("cnExportRow")) return;

      const row = document.createElement("div");
      row.className = "toolRow cnToolsRow";
      row.id = "cnExportRow";

      const isMobile = window.matchMedia("(max-width: 720px)").matches;
      const openAttr = isMobile ? "" : "open";

      row.innerHTML = `
        <details class="cnTools" ${openAttr}>
          <summary class="btn btn--tiny btn--glass">
            <span class="cnToolsSummary">
              <span>🧾 Ferramentas (listas/export)</span>
              <span style="opacity:.75;">${isMobile ? "abrir" : "ok"}</span>
            </span>
          </summary>

          <div class="cnToolsGrid">
            <button class="btn btn--tiny btn--glass" type="button" id="btnCopyList">📋 Copiar (ativos)</button>
            <button class="btn btn--tiny btn--gold"  type="button" id="btnDlList">⬇️ TXT (ativos)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlListAll">⬇️ TXT (tudo)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlCsvAll">⬇️ CSV (tudo)</button>
          </div>
        </details>
      `;
      tools.appendChild(row);
    })();

    const btnCopyList = $("#btnCopyList");
    const btnDlList = $("#btnDlList");
    const btnDlListAll = $("#btnDlListAll");
    const btnDlCsvAll = $("#btnDlCsvAll");

    if (btnCopyList) btnCopyList.addEventListener("click", () => doCopyTxt("active"));
    if (btnDlList) btnDlList.addEventListener("click", () => doExportTxt("active"));
    if (btnDlListAll) btnDlListAll.addEventListener("click", () => doExportTxt("all"));
    if (btnDlCsvAll) btnDlCsvAll.addEventListener("click", () => doExportCsv("all"));

    document.addEventListener("click", (e) => {
      const openCats = e.target.closest('[data-action="openTags"]');
      if (openCats) {
        e.preventDefault();
        openTagModal();
        return;
      }

      const aBuy = e.target.closest('a.btn--gold[href], a.smallBtnGold[href]');
      if (aBuy) {
        const href = aBuy.getAttribute("href") || aBuy.href || "";
        const card = aBuy.closest(".pCard");
        const sku = card ? (card.getAttribute("data-sku") || "") : "";
        const p = sku ? findBySku(sku) : (STATE._lastFeaturedShown || null);

        if (p) {
          trackEvent("click_buy", getTrackProduct(p, {
            placement: card ? "grid_buy" : "featured_buy",
            source_block: card ? "loja_grid" : "featured_loja",
            position_on_page: card ? null : 1
          }));
        }

        e.preventDefault();

        if (!isBuyableProductLink(href)) {
          showToast("Produto sem link direto válido. Revisar no Guardian.");
          return;
        }

        openBuy(href);
        return;
      }

      const chip = e.target.closest("[data-tag]");
      if (chip && chip.classList.contains("tagChip")) {
        const t = String(chip.getAttribute("data-tag") || "").trim();

        trackEvent("filter_tag", {
          page_type: "loja",
          tag: t,
          placement: "tag_chip",
          query: String(STATE.query || ""),
          active_sort: String(STATE.sort || "relev")
        });

        STATE.tag = t;
        STATE.limit = PAGE_SIZE;
        render();
        return;
      }

      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.getAttribute("data-action");
      const sku = el.getAttribute("data-sku") || "";
      const p = sku ? findBySku(sku) : null;

      if (action === "copyLink" && p) {
        const link = bestBuyUrl(p) || "";
        if (!link) {
          showToast("Produto sem link direto válido.");
          return;
        }

        trackEvent("click_copy_link", getTrackProduct(p, {
          placement: getActionPlacement(el, action),
          source_block: getActionSourceBlock(el)
        }));
        return copyText(link);
      }

      if (action === "copyAlt" && p) {
        const alt = ensureHttpUrl(p.alt_url || "");
        if (!alt) {
          showToast("Produto sem link alternativo válido.");
          return;
        }

        trackEvent("click_copy_alt", getTrackProduct(p, {
          placement: getActionPlacement(el, action),
          source_block: getActionSourceBlock(el)
        }));
        return copyText(alt);
      }

      if (action === "copyId" && p) {
        trackEvent("click_copy_id", getTrackProduct(p, {
          placement: getActionPlacement(el, action),
          source_block: getActionSourceBlock(el)
        }));
        return copyText(p.id_busca || "");
      }

      if (!ADMIN) return;
    });

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

  const STATE = {
    products: [],
    updated_at: "",
    query: "",
    tag: "",
    sort: "relev",
    limit: PAGE_SIZE,
    _failsafeNotified: false,
    _export: null,
    _categoryCounts: [],
    _activeCount: 0,
    _trackedViews: {
      featured: {},
      grid: {}
    },
    _lastFeaturedShown: null,
    _searchTimer: null,
  };

  async function boot() {
    injectUiCss();
    makeBgClickThrough();
    ensureTagModal();

    readUrlState();
    setText($("#year"), new Date().getFullYear());

    try {
      if (window.CNTracking && typeof window.CNTracking.init === "function") {
        window.CNTracking.init({
          pageType: "loja",
          autoPageView: false,
          debug: false
        });

        trackEvent("page_view_loja", {
          page_type: "loja"
        });
      }
    } catch {}

    try {
      STATE.products = await fetchProducts();
    } catch {
      STATE.products = [{
        sku: "fallback-power-bank-20000mah",
        title: "Power Bank 20000mAh — Carga Rápida 22.5W Turbo USB-C (Preto)",
        badges: ["Achados do Dia", "USB-C", "Preto"],
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

    const q = $("#qLoja");
    if (q) q.value = STATE.query || "";

    const sortSel = $("#sortSel");
    if (sortSel) sortSel.value = STATE.sort || "relev";

    STATE.tag = (STATE.tag || "").toLowerCase().trim();

    bind();
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
