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
    // garante /La_Familia_Links/ certinho
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
      link: "https://mercadolivre.com/sec/1waKGha",
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

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function featuredHTML(p) {
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

    return `
      <div class="card">
        <div class="card__img">
          <div class="badge">⭐ Produto do dia</div>
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
            ✅ Como comprar (rápido)
          </h3>

          <p class="meta">
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
    // tenta usar produtos.json se existir; se não, usa fallback
    try {
      const res = await fetch(`./produtos.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("produtos.json não encontrado");
      const data = await res.json();
      const list = normalizeProducts(data)
        .filter(p => p && (p.ativo !== false)); // só mostra os ativos
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
    const destaque = products.find(p => p.destaque) || products[0];

    const featured = $("#featured");
    if (featured) featured.innerHTML = featuredHTML(destaque);

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
