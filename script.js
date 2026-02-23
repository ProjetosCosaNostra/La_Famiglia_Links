(() => {
  const $ = (s) => document.querySelector(s);

  const toast = $("#toast");
  function showToast(msg) {
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
    } catch (e) {
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

  function homeUrl() {
    return baseUrl();
  }

  function stripTags(s) {
    return String(s ?? "").replace(/<[^>]*>/g, " ");
  }

  function cleanText(s) {
    return stripTags(s).replace(/\s+/g, " ").trim();
  }

  function extractFirstUrl(s) {
    const m = String(s ?? "").match(/https?:\/\/[^\s<>"')]+/i);
    return m ? m[0] : "";
  }

  function cleanUrl(u) {
    let raw = String(u ?? "").trim();
    if (!raw) return "";
    // se colarem <img ... src="...">, pega o link
    if (/<\s*img/i.test(raw)) raw = extractFirstUrl(raw);

    raw = raw.trim();
    raw = raw.replace(/^[\s"'`]+/, "");
    raw = raw.replace(/[\s"'`]+$/, "");
    raw = raw.replace(/[)"'`]+$/g, "");
    return raw.trim();
  }

  function resolveUrl(u) {
    let raw = cleanUrl(u);
    if (!raw) return "";
    if (/^(https?:\/\/|data:)/i.test(raw)) return raw;

    // normaliza duplicação clássica
    let p = raw.replace(/^[.\/]+/, "");
    p = p.replace(/^assets\/assets\//i, "assets/");

    return new URL(p, baseUrl()).href;
  }

  function formatUpdatedAt(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
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

    // hosts do Mercado Livre / Mercado Libre
    if (h.includes("mercadolivre") || h.includes("mercadolibre")) return true;

    // short domains: meli.la / meli.co + variações meli.xx
    if (h === "meli.la" || h === "meli.co") return true;
    if (/^meli\.[a-z]{2,6}$/.test(h)) return true;

    return false;
  }

  function isProbablyValidLink(u) {
    const x = String(u ?? "").toLowerCase().trim();
    if (!x) return false;
    // nunca aceitar user-attachments como link de compra
    if (x.includes("github.com/user-attachments/assets")) return false;

    const h = hostOf(x);
    return isMLHost(h);
  }

  function pickBestLink(p) {
    // prioridade: open_url (tracking) -> check_url -> canonical_url -> resolved_url -> short_url -> link legado
    const open = cleanUrl(p.open_url || p.link || p.url || "");
    const check = cleanUrl(p.check_url || "");
    const canonical = cleanUrl(p.canonical_url || "");
    const resolved = cleanUrl(p.resolved_url || "");
    const shorty = cleanUrl(p.short_url || "");

    const candidates = [open, check, canonical, resolved, shorty].filter(Boolean);
    const primary = candidates.find(isProbablyValidLink) || "";

    // link alternativo: primeiro válido diferente do primary
    const alt = candidates.find((c) => c && c !== primary && isProbablyValidLink(c)) || "";

    return { primary, alt, open, check, canonical, resolved, shorty };
  }

  const FALLBACK_PRODUCTS = [
    {
      sku: "mochila-impermeavel-notebook-156",
      featured: true,
      active: true,
      title: "Mochila impermeável • Notebook 15.6”",
      badges: ["Achados do Dia", "Viagem", "USB", "Carry-on"],
      id_busca: "5J5PKG-JBQE",
      open_url: "https://mercadolivre.com/sec/14jFsrH",
      check_url: "https://mercadolivre.com/sec/14jFsrH",
      canonical_url: "https://lista.mercadolivre.com.br/5J5PKG-JBQE",
      image: "assets/produtos/Mochila_Masculina_Notebook_15.6.png"
    }
  ];

  function normalizeProducts(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.items)) return data.items;
    return [];
  }

  function adaptProduct(p) {
    if (!p) return null;

    const ativo =
      (p.ativo !== undefined) ? p.ativo :
      (p.active !== undefined) ? p.active :
      true;

    let nome = cleanText(p.nome || p.title || p.name || "");
    let sku = cleanText(p.sku || p.slug || "");
    let idML = cleanText(p.idML || p.id_busca || p.id || "");

    // se veio lixo tipo "<img ...>", some com esse item
    if (!nome || /<\s*img/i.test(String(p.nome || p.title || ""))) return null;
    if (!sku || /<\s*img/i.test(String(p.sku || "")) || /</.test(sku) || />/.test(sku)) return null;

    // tenta montar desc a partir de badges/tags
    let desc = cleanText(p.desc || p.description || "");
    const tagsRaw = (p.tags || p.badges || []);
    const tags = Array.isArray(tagsRaw) ? tagsRaw.map(cleanText).filter(Boolean) : [];

    if (!desc && tags.length) desc = tags.join(" • ");

    const links = pickBestLink(p);
    const link = links.primary;

    // link obrigatório: tem que ser ML (mercadolivre/mercadolibre/meli.la/meli.xx)
    if (!isProbablyValidLink(link)) return null;

    let imagem = cleanUrl(p.imagem || p.image || "");

    return {
      sku,
      destaque: (p.destaque === true) || (p.featured === true) || (p.is_featured === true),
      ativo: (ativo !== false),
      nome,
      desc: desc || "",
      idML: idML || "",
      link,
      linkAlt: links.alt || "",
      open_url: links.open || "",
      check_url: links.check || "",
      canonical_url: links.canonical || "",
      short_url: links.shorty || "",
      resolved_url: links.resolved || "",
      imagem,
      tags
    };
  }

  // ✅ DEDUPE forte (idML > canonical_url > link > sku)
  function dedupeProducts(list) {
    const out = [];
    const seen = new Set();

    for (const p of (list || [])) {
      if (!p) continue;

      const kId = (p.idML ? `id:${String(p.idML).trim().toUpperCase()}` : "");
      const kCan = (p.canonical_url ? `c:${String(p.canonical_url).trim().toLowerCase()}` : "");
      const kUrl = (p.link ? `url:${String(p.link).trim().toLowerCase()}` : "");
      const kSku = (p.sku ? `sku:${String(p.sku).trim().toLowerCase()}` : "");

      const key = kId || kCan || kUrl || kSku;
      if (!key) continue;

      if (seen.has(key)) {
        // se duplicado e o novo é destaque, substitui
        const idx = out.findIndex(x => {
          const kk =
            (x.idML ? `id:${String(x.idML).trim().toUpperCase()}` : "") ||
            (x.canonical_url ? `c:${String(x.canonical_url).trim().toLowerCase()}` : "") ||
            (x.link ? `url:${String(x.link).trim().toLowerCase()}` : "") ||
            (x.sku ? `sku:${String(x.sku).trim().toLowerCase()}` : "");
          return kk === key;
        });
        if (idx >= 0 && p.destaque && !out[idx].destaque) out[idx] = p;
        continue;
      }

      seen.add(key);
      out.push(p);
    }

    return out;
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function tagsText(tags) {
    const arr = Array.isArray(tags) ? tags : [];
    const txt = arr
      .slice(0, 4)
      .map(t => `#${String(t).trim().replaceAll(" ", "_")}`)
      .join(" ");
    return txt;
  }
  function featuredHTML(p, isProdutoDoDia) {
    const imgSrc = resolveUrl(p.imagem);
    const img = imgSrc
      ? `<img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(p.nome)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:24px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const disabled = (p.ativo === false);
    const hasLink = String(p.link || "").trim().startsWith("http");
    const buyBtn = (disabled || !hasLink)
      ? `<button class="btn btn--gold" type="button" disabled style="opacity:.55; cursor:not-allowed;">INDISPONÍVEL</button>`
      : `<a class="btn btn--gold" href="${escapeHTML(p.link)}" target="_blank" rel="noopener">COMPRAR AGORA</a>`;

    const badge = isProdutoDoDia
      ? `<div class="badge">⭐ Produto do dia</div>`
      : `<div class="badge" style="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.88);">🛒 Destaque</div>`;

    const titleTop = isProdutoDoDia ? "⭐ Produto do Dia" : "🛒 Destaque da Vitrine";
    const subtitleNote = isProdutoDoDia
      ? "Esse é o produto escolhido como Produto do Dia."
      : "Nenhum Produto do Dia foi definido — esse é só um destaque automático.";

    const tags = tagsText(p.tags);

    const altLine = p.linkAlt
      ? `<p class="meta" style="margin-top:6px;">
           Link alternativo (se o principal falhar):<br/>
           <span style="color:rgba(224,195,107,.92); font-weight:950;">copie e cole no navegador</span>
         </p>`
      : "";

    const altBtn = p.linkAlt
      ? `<button class="btn btn--tiny btn--glass" type="button" data-copy="${escapeHTML(p.linkAlt)}">Copiar link alternativo</button>`
      : "";

    return `
      <div class="card">
        <div class="card__img">
          ${badge}
          ${img}
        </div>
        <div class="card__body">
          <h3 class="name">${escapeHTML(p.nome)}</h3>
          <p class="meta">${escapeHTML(p.desc || "")}</p>

          <div class="row">
            <div class="idbox">ID Mercado Livre: <b>${escapeHTML(p.idML || "")}</b></div>
          </div>

          ${tags ? `<p class="meta" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(tags)}</p>` : ``}

          <div class="actions">
            ${buyBtn}
            <button class="btn btn--tiny btn--glass" type="button" data-copy="${escapeHTML(p.link || "")}">Copiar link</button>
            ${altBtn}
            <button class="btn btn--tiny btn--glass" type="button" data-copy="${escapeHTML(p.idML || "")}">Copiar ID</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body">
          <h3 class="name" style="font-size:16px; letter-spacing:.12em; text-transform:uppercase; color:rgba(224,195,107,.95);">
            ${escapeHTML(titleTop)}
          </h3>

          <p class="meta" style="margin-top:6px;">
            ${escapeHTML(subtitleNote)}
          </p>

          <p class="meta">
            ✅ Como comprar (rápido)<br/>
            1) Abra o app/site do <b>Mercado Livre</b><br/>
            2) Cole o <b>ID</b> na busca: <b>${escapeHTML(p.idML || "")}</b><br/>
            3) Ou clique em <b>COMPRAR AGORA</b> (abre direto)
          </p>

          ${altLine}

          <div class="actions" style="margin-top:6px;">
            <button class="btn btn--tiny btn--glass" type="button" data-copy="${escapeHTML(p.idML || "")}">Copiar ID</button>
            <button class="btn btn--tiny btn--glass" type="button" data-copy="${escapeHTML(p.link || "")}">Copiar Link</button>
            ${p.linkAlt ? `<button class="btn btn--tiny btn--glass" type="button" data-copy="${escapeHTML(p.linkAlt)}">Copiar Link Alternativo</button>` : ``}
            <a class="btn btn--tiny btn--gold" href="./loja.html">Abrir Vitrine</a>
          </div>

          <p class="meta" style="margin-top:10px;">
            Melhor funil: <b>Story com sticker de LINK</b> + <b>Loja na Bio</b>.
          </p>
        </div>
      </div>
    `;
  }

  function productCardHTML(p) {
    const imgSrc = resolveUrl(p.imagem);
    const img = imgSrc
      ? `<img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(p.nome)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:18px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const disabled = (p.ativo === false);
    const hasLink = String(p.link || "").trim().startsWith("http");

    const buy = (disabled || !hasLink)
      ? `<button class="smallBtn smallBtnGold" type="button" disabled style="opacity:.55; cursor:not-allowed;">Indisponível</button>`
      : `<a class="smallBtn smallBtnGold" href="${escapeHTML(p.link)}" target="_blank" rel="noopener">Comprar</a>`;

    const tags = tagsText(p.tags);

    return `
      <div class="pCard">
        <div class="pImg">${img}</div>
        <div class="pBody">
          <p class="pName">${escapeHTML(p.nome)}</p>
          <p class="pSmall">${escapeHTML(p.desc || "")}</p>
          ${tags ? `<p class="pSmall" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(tags)}</p>` : ``}

          <div class="pActions">
            ${buy}
            <button class="smallBtn" type="button" data-copy="${escapeHTML(p.idML || "")}">Copiar ID</button>
            <button class="smallBtn" type="button" data-copy="${escapeHTML(p.link || "")}">Copiar Link</button>
          </div>
        </div>
      </div>
    `;
  }

  async function loadProducts() {
    try {
      const res = await fetch(`./produtos.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("produtos.json não encontrado");
      const data = await res.json();

      const raw = normalizeProducts(data);
      const mapped = raw.map(adaptProduct).filter(Boolean);

      // mantém apenas ativos
      const list = mapped.filter(p => p && (p.ativo !== false));

      return {
        products: dedupeProducts(list.length ? list : FALLBACK_PRODUCTS.map(adaptProduct).filter(Boolean)),
        updated_at: data.updated_at || ""
      };
    } catch (e) {
      const fb = FALLBACK_PRODUCTS.map(adaptProduct).filter(Boolean);
      return { products: dedupeProducts(fb), updated_at: "" };
    }
  }

  const STATE = {
    products: [],
    updated_at: "",
    query: ""
  };

  function getFeatured(list) {
    const escolhido = list.find(p => p.destaque);
    return escolhido || list[0] || null;
  }

  function renderHome() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    const upd = $("#lastUpdate");
    if (upd) {
      const pretty = STATE.updated_at ? formatUpdatedAt(STATE.updated_at) : "";
      if (pretty) {
        upd.textContent = pretty;
      } else {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        upd.textContent = `${hh}:${mm}`;
      }
    }

    const featuredEl = $("#featured");
    const featured = getFeatured(STATE.products);
    if (featuredEl && featured) {
      const isProdutoDoDia = !!STATE.products.find(p => p.destaque);
      featuredEl.innerHTML = featuredHTML(featured, isProdutoDoDia);
    }

    const quickGrid = $("#quickGrid");
    if (quickGrid) {
      const featuredSku = (featured && featured.sku) ? featured.sku : "";
      let list = STATE.products.slice();

      if (featuredSku) list = list.filter(p => p.sku !== featuredSku);
      else list = list.slice(1);

      const q = (STATE.query || "").trim().toLowerCase();
      if (q) {
        list = list.filter(p => {
          const hay = (
            (p.nome || "") + " " +
            (p.sku || "") + " " +
            (p.idML || "") + " " +
            (Array.isArray(p.tags) ? p.tags.join(" ") : "") + " " +
            (p.desc || "")
          ).toLowerCase();
          return hay.includes(q);
        });
      }

      const top = list.slice(0, 9);
      quickGrid.innerHTML = top.map(productCardHTML).join("");

      if (!top.length) {
        quickGrid.innerHTML = `
          <div style="grid-column:1/-1; padding:14px; color:rgba(255,255,255,.72); font-weight:900;">
            Nada encontrado. Tente outro termo. ✅
          </div>
        `;
      }
    }
  }

  function bindTopButtons() {
    const copyBtn = $("#copyLoja");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => copyText(lojaUrl()));
    }

    const refresh = $("#refresh");
    if (refresh) {
      refresh.addEventListener("click", async () => {
        showToast("Atualizando…");
        await boot();
        showToast("Atualizado ✅");
      });
    }

    const qHome = $("#qHome");
    if (qHome) {
      qHome.addEventListener("input", (e) => {
        STATE.query = e.target.value || "";
        renderHome();
      });
    }

    const qClear = $("#qClear");
    if (qClear && qHome) {
      qClear.addEventListener("click", () => {
        qHome.value = "";
        STATE.query = "";
        renderHome();
      });
    }
  }

  function bindCopyDelegation() {
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-copy]");
      if (!el) return;

      const v = (el.getAttribute("data-copy") || "").trim();
      if (!v) return showToast("Nada para copiar");

      if (v === "bio") return copyText(homeUrl());
      if (v === "loja") return copyText(lojaUrl());

      return copyText(v);
    });
  }

  async function boot() {
    const { products, updated_at } = await loadProducts();
    STATE.products = products || [];
    STATE.updated_at = updated_at || "";
    renderHome();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bindCopyDelegation();
    bindTopButtons();
    await boot();
  });
})();
