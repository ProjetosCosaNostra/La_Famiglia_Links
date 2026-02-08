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
    try {
      await navigator.clipboard.writeText(txt);
      showToast("Copiado ✅");
    } catch (e) {
      const t = document.createElement("textarea");
      t.value = txt;
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

  const FALLBACK_PRODUCTS = [
    {
      destaque: true,
      ativo: true,
      nome: "Mochila impermeável • Notebook 15.6”",
      desc: "Trava com senha • bolso oculto • saída USB • conforto com malha respirável • alça de bagagem (carry-on).",
      idML: "5J5PKG-JBQE",
      link: "https://mercadolivre.com/sec/14jFsrH",
      imagem: "assets/assets/produtos/Mochila_Masculina_Notebook_15.6.png",
      tags: ["mochila", "notebook", "viagem"]
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

    let desc = p.desc || p.description || "";
    if (!desc && Array.isArray(p.badges) && p.badges.length) {
      desc = p.badges.join(" • ");
    }

    return {
      destaque: (p.destaque === true) || (p.featured === true) || (p.is_featured === true),
      ativo: (ativo !== false),
      nome: p.nome || p.title || p.name || "",
      desc: desc,
      idML: p.idML || p.id_busca || p.id || "",
      link: p.link || p.open_url || p.url || "",
      imagem: p.imagem || p.image || "",
      tags: p.tags || p.badges || []
    };
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function featuredHTML(p, isProdutoDoDia) {
    const img = p.imagem
      ? `<img src="${escapeHTML(p.imagem)}" alt="${escapeHTML(p.nome)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:24px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const tags = (p.tags || []).slice(0, 4).map(t => `#${t}`).join(" ");

    const disabled = (p.ativo === false);
    const buyBtn = disabled
      ? `<button class="btn btn--gold" type="button" disabled style="opacity:.55; cursor:not-allowed;">INDISPONÍVEL</button>`
      : `<a class="btn btn--gold" href="${escapeHTML(p.link)}" target="_blank" rel="noopener">COMPRAR AGORA</a>`;

    const badge = isProdutoDoDia
      ? `<div class="badge">⭐ Produto do dia</div>`
      : `<div class="badge" style="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.88);">🛒 Vitrine</div>`;

    const titleTop = isProdutoDoDia
      ? "⭐ Produto do Dia"
      : "🛒 Destaque da Vitrine";

    const subtitleNote = isProdutoDoDia
      ? "Esse é o produto escolhido por você como Produto do Dia."
      : "Nenhum Produto do Dia foi definido — esse é só um destaque da vitrine.";

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

          <p class="meta" style="color:rgba(224,195,107,.92); font-weight:950;">${escapeHTML(tags)}</p>

          <div class="actions">
            ${buyBtn}
            <button class="btn btn--glass" type="button" data-copy="${escapeHTML(p.link || "")}">Copiar link</button>
            <button class="btn btn--glass" type="button" data-copy="${escapeHTML(p.idML || "")}">Copiar ID</button>
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

          <div class="actions" style="margin-top:6px;">
            <button class="btn btn--glass" type="button" data-copy="${escapeHTML(p.idML || "")}">Copiar ID</button>
            <button class="btn btn--glass" type="button" data-copy="${escapeHTML(p.link || "")}">Copiar Link</button>
            <a class="btn btn--gold" href="./loja.html">Abrir Vitrine</a>
          </div>

          <p class="meta" style="margin-top:10px;">
            Melhor funil: <b>Story com sticker de LINK</b> + <b>Loja na Bio</b>.
          </p>
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
      const list = mapped.filter(p => p && (p.ativo !== false));

      return list.length ? list : FALLBACK_PRODUCTS;
    } catch (e) {
      return FALLBACK_PRODUCTS;
    }
  }

  async function render() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    const upd = $("#lastUpdate");
    if (upd) {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      upd.textContent = `${hh}:${mm}`;
    }

    const products = await loadProducts();

    // ✅ Escolha manual:
    // - Se existir algum com destaque/featured: usa esse como Produto do Dia.
    // - Se NÃO existir: mostra o primeiro, mas sem selo de Produto do Dia (é só destaque de vitrine).
    const escolhido = products.find(p => p.destaque);
    const isProdutoDoDia = !!escolhido;
    const destaque = escolhido || products[0];

    const featured = $("#featured");
    if (featured) featured.innerHTML = featuredHTML(destaque, isProdutoDoDia);

    document.querySelectorAll("[data-copy]").forEach((el) => {
      el.addEventListener("click", () => {
        const txt = el.getAttribute("data-copy") || "";
        if (!txt.trim()) return showToast("Nada para copiar");
        copyText(txt.trim());
      });
    });
  }

  function bindTopButtons() {
    const copyBtn = $("#copyLoja");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => copyText(lojaUrl()));
    }

    document.querySelectorAll("[data-copy='bio']").forEach((el) => {
      el.addEventListener("click", () => copyText(homeUrl()));
    });

    const refresh = $("#refresh");
    if (refresh) {
      refresh.addEventListener("click", async () => {
        showToast("Atualizando…");
        await render();
        showToast("Atualizado ✅");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bindTopButtons();
    await render();
  });
})();
