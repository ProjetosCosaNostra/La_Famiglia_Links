/* ==========================================================
   Arquivo: loja.js
   Página : Loja Completa (loja.html)
   Objetivo:
     - Renderizar produtos a partir de produtos.json
     - Produto do Dia (featured) sem “inventar featured”
     - Filtro por texto + filtro por categoria (tag) + ordenação + paginação
     - Admin mode (?admin=1): editar em memória + exportar produtos.json

   HOTFIX 2026-02-24 (ANTI-WIPE FRONT):
     - Se a contagem de ativos cair demais (ex: por falso-positivo / bloqueio do ML),
       a UI entra em FAILSAFE e resgata produtos com last_ok recente para não zerar a vitrine.

   PATCH 2026-02-24 (IMAGENS PREMIUM DINÂMICAS):
     - referrerpolicy=no-referrer (hotlink GitHub user-attachments)
     - fallback premium quando falhar
     - MODO PROFISSIONAL: imagem inteira (contain) + fundo blur automático
     - smart-fit: evita crop em poster vertical

   PATCH 2026-02-24 (EXPORT LISTA SEM PRINT):
     - Botões: Copiar lista / Baixar TXT / Baixar TXT (tudo) / CSV (tudo)
     - Snapshot em STATE._export (ativos / visível / tudo)

   FIX 2026-02-24 (COMPRAR NÃO REDIRECIONA):
     - Normaliza links sem https:// (mercadolivre.com/sec/... vira https://mercadolivre.com/sec/...)
     - buy_url sempre cai em fallback (open_url/check_url/canonical/short/resolved)
     - Em browsers in-app (IG/FB) força window.open e fallback para location.href

   FIX 2026-03-20 (BUY DESKTOP + LINKS SOCIAL/LISTS):
     - Desktop: mantém a loja na aba atual e usa o target=_blank nativo
     - In-app (IG/FB/Messenger): mantém window.open com fallback controlado
     - Links /social/ e /lists deixam de ser tratados como compra válida
     - Corrige bug JS em isNoisyTag (True -> true)

   PATCH 2026-03-21 (MANUTENÇÃO / REVIEW TXT):
     - Busca data/link_guardian_review.json e logs/link_guardian_review.txt
     - Botão novo: TXT manutenção
     - Fluxo seguro: Guardian identifica suspeitos sem derrubar automático

   PATCH 2026-03-02 (UI PREMIUM / CATEGORIAS INTELIGENTES):
     - Ferramentas (listas/export): recolhível no mobile (nada gigante).
     - Categorias: só “macro-categorias” úteis + pinned (mobile não fica incompleto).
     - “Ver todas” abre modal premium com busca.
     - Contador “Categorias” vira 14+ (premium), total aparece no “Ver todas (X)”.
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
  const FRONT_FAILSAFE_MIN_ACTIVE = 10;
  const FRONT_FAILSAFE_MIN_RATIO = 0.35;
  const FRONT_FAILSAFE_OK_DAYS = 7;

  // =========================
  // IMAGENS: PREMIUM DINÂMICO
  // =========================
  const CN_IMAGE_MODE = "smart";            // "smart" | "contain" | "cover"
  const CN_SMART_THRESHOLD = 0.12;
  const CN_BG_BLUR_PX = 18;
  const CN_BG_OPACITY = 0.35;

  // =========================
  // CATEGORIAS (INTELIGENTE + PREMIUM)
  // =========================
  // Pinned: sempre aparecem no topo (principalmente no mobile)
  const CN_CAT_PINNED = [
    "Achados do Dia",
    "Casa",
    "Cozinha",
    "Home Office",
    "Carro",
    "Moto",
    "Segurança",
    "Setup",
    "Wi-Fi",
    "Notebook",
    "PC",
    "Celular",
    "Bluetooth",
    "USB",
    "Sem Fio",
    "Portátil",
    "Organização",
    "Casa Inteligente",
    "Premium",
    "Praticidade",
  ];

  // regra base: categoria só se repetir e não for “ruído”
  const CN_CAT_MIN_COUNT = 3;               // mais agressivo: reduz poluição
  const CN_CAT_MAX_CHIPS_DESKTOP = 20;
  const CN_CAT_MAX_CHIPS_MOBILE = 14;       // mobile “completo” sem virar mural

  // allowlist para tags com dígito que ainda são úteis (se quiser manter)
  const CN_CAT_ALLOW_DIGITS = new Set([
    "4k",
    "wi fi 6",
    "wifi 6",
    "usb c",
    "1tb",
    "2tb",
    "65w",
    "22 5w",
    "15w",
  ]);

  const CN_SEARCH_STOPWORDS = new Set([
    "a","o","as","os","de","da","do","das","dos","e","em","no","na","nos","nas","um","uma","para","por","com","sem","ate","até","ao","aos","ou"
  ]);

  const CN_SHORT_TOKEN_ALLOWLIST = new Set([
    "pc", "tv", "vr", "rgb", "usb", "ssd", "ram", "cpu", "gpu", "tws", "wifi", "wi", "fi", "4k", "5g", "6e", "m2", "nv3", "nv2"
  ]);

  // stoplist de marcas comuns (não vira categoria)
  const CN_CAT_BRANDS = new Set([
    "xiaomi","samsung","logitech","philips","ugreen","seagate","arno","britania",
    "tapo","tp link","redragon","oneblade","sony","awei","nescafe","colgate",
    "sandisk","kingston","lenovo","acer","hp","dell","microsoft","apple","electrolux","emeet","casenn"
  ]);

  // stoplist de tags “plataforma”
  const CN_CAT_NOISE = new Set([
    "mercado livre","youtube","tiktok","threads","kwai","reels","instagram","facebook"
  ]);

  const CN_CATEGORY_ALIAS_PAIRS = [
    ["achados do dia", "Achados do Dia"],
    ["feminino", "Feminino"],
    ["beleza", "Feminino"],
    ["maquiagem", "Feminino"],
    ["casa", "Casa"],
    ["cozinha", "Cozinha"],
    ["home office", "Home Office"],
    ["escritorio", "Home Office"],
    ["carro", "Carro"],
    ["automotivo", "Carro"],
    ["moto", "Moto"],
    ["motocicleta", "Moto"],
    ["seguranca", "Segurança"],
    ["seguranca residencial", "Segurança"],
    ["setup", "Setup"],
    ["gamer", "Setup"],
    ["perifericos", "Setup"],
    ["wi fi", "Wi-Fi"],
    ["wifi", "Wi-Fi"],
    ["notebook", "Notebook"],
    ["laptop", "Notebook"],
    ["pc", "PC"],
    ["desktop", "PC"],
    ["computador", "PC"],
    ["celular", "Celular"],
    ["smartphone", "Celular"],
    ["iphone", "Celular"],
    ["android", "Celular"],
    ["bluetooth", "Bluetooth"],
    ["tws", "Bluetooth"],
    ["usb", "USB"],
    ["usb c", "USB"],
    ["type c", "USB"],
    ["tipo c", "USB"],
    ["lightning", "USB"],
    ["sem fio", "Sem Fio"],
    ["wireless", "Sem Fio"],
    ["inducao", "Sem Fio"],
    ["magnetico", "Sem Fio"],
    ["portatil", "Portátil"],
    ["compacto", "Portátil"],
    ["dobravel", "Portátil"],
    ["leve", "Portátil"],
    ["viagem", "Portátil"],
    ["organizacao", "Organização"],
    ["organizador", "Organização"],
    ["casa inteligente", "Casa Inteligente"],
    ["smart home", "Casa Inteligente"],
    ["premium", "Premium"],
    ["luxo", "Premium"],
    ["imperial", "Premium"],
    ["praticidade", "Praticidade"],
    ["util", "Praticidade"],
    ["dia a dia", "Praticidade"],
  ];

  const CN_CATEGORY_RULES = [
    {
      label: "Achados do Dia",
      minScore: 8,
      strongPhrases: ["achados do dia"],
      weakPhrases: [],
      strongTokens: ["achados"],
      weakTokens: [],
      negativeTokens: [],
      negativePhrases: [],
    },
    {
      label: "Feminino",
      minScore: 7,
      strongPhrases: ["body splash", "escova secadora", "acessorio feminino", "gloss labial", "necessaire feminina"],
      weakPhrases: ["maquiagem", "beleza", "skincare", "perfume", "hidratante", "chapinha", "secador", "gloss", "batom", "base", "corretivo", "paleta", "brinco", "colar", "pulseira", "anel", "bolsa", "vestido", "saia", "blusa feminina", "lingerie", "necessaire"],
      strongTokens: ["feminino", "gloss", "batom", "skincare", "lingerie"],
      weakTokens: ["beleza", "maquiagem", "perfume", "serum", "cabelo", "bolsa"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Moto",
      minScore: 7,
      strongPhrases: ["capacete moto", "luva moto", "jaqueta moto", "intercomunicador moto"],
      weakPhrases: ["capacete", "motocicleta", "motocross", "viseira"],
      strongTokens: ["moto", "motocicleta", "motocross"],
      weakTokens: ["capacete", "viseira", "piloto"],
      negativeTokens: ["carro", "cozinha", "pc"],
      negativePhrases: [],
    },
    {
      label: "Carro",
      minScore: 7,
      strongPhrases: ["camera veicular", "som automotivo", "multimidia automotiva"],
      weakPhrases: ["automotivo", "veicular", "pelicula automotiva", "retrovisor"],
      strongTokens: ["carro", "automotivo", "veicular"],
      weakTokens: ["retrovisor", "multimidia", "pelicula"],
      negativeTokens: ["moto", "cozinha", "pc"],
      negativePhrases: [],
    },
    {
      label: "Casa",
      minScore: 6,
      strongPhrases: ["utilidades domesticas", "casa e decoracao", "organizacao da casa"],
      weakPhrases: ["decoracao", "banheiro", "lavanderia", "almofada", "tapete", "cortina", "cabide", "luminaria", "abajur"],
      strongTokens: ["casa", "quarto", "sala"],
      weakTokens: ["banheiro", "lavanderia", "tapete", "cortina", "abajur", "luminaria"],
      negativeTokens: ["nvme", "ssd", "roteador", "capacete"],
      negativePhrases: [],
    },
    {
      label: "Cozinha",
      minScore: 7,
      strongPhrases: ["air fryer", "panela de pressao", "panela de pressao eletrica", "cafeteira", "garrafa termica", "escorredor de louca"],
      weakPhrases: ["panela", "fritadeira", "copo", "xicara", "talher", "fogao", "coador"],
      strongTokens: ["cozinha", "cafeteira", "airfryer"],
      weakTokens: ["panela", "fogao", "xicara", "talher", "copo"],
      negativeTokens: ["ssd", "nvme", "pcie", "usb", "wifi"],
      negativePhrases: [],
    },
    {
      label: "Home Office",
      minScore: 7,
      strongPhrases: ["home office", "cadeira ergonomica", "suporte notebook", "suporte monitor", "mesa de escritorio", "webcam 4k"],
      weakPhrases: ["escritorio", "ergonomico", "ergonomica", "webcam", "mesa", "cadeira"],
      strongTokens: ["escritorio", "ergonomico", "ergonomica", "webcam"],
      weakTokens: ["mesa", "cadeira", "suporte"],
      negativeTokens: ["cozinha", "moto", "carro"],
      negativePhrases: [],
    },
    {
      label: "Setup",
      minScore: 7,
      strongPhrases: ["mouse gamer", "teclado mecanico", "rgb lightsync", "headset gamer", "webcam gamer"],
      weakPhrases: ["mouse", "teclado", "headset", "webcam", "monitor", "mousepad", "gamer", "rgb"],
      strongTokens: ["gamer", "rgb", "mouse", "teclado", "headset", "mousepad"],
      weakTokens: ["webcam", "monitor"],
      negativeTokens: ["cozinha", "panela", "perfume", "capacete"],
      negativePhrases: [],
    },
    {
      label: "Notebook",
      minScore: 6,
      strongPhrases: ["para notebook", "mochila notebook", "suporte notebook", "capa notebook", "bolsa notebook"],
      weakPhrases: ["notebook", "laptop"],
      strongTokens: ["notebook", "laptop"],
      weakTokens: ["mochila", "capa"],
      negativeTokens: ["cozinha", "moto"],
      negativePhrases: [],
    },
    {
      label: "PC",
      minScore: 8,
      strongPhrases: ["placa de video", "placa mae", "fonte atx", "memoria ram", "ssd nvme", "ssd m 2", "m 2 2280", "pcie 4 0", "gabinete gamer", "processador"],
      weakPhrases: ["desktop", "computador", "pc gamer"],
      strongTokens: ["ssd", "nvme", "pcie", "m2", "ddr4", "ddr5", "gpu", "cpu", "atx", "gabinete", "placa", "processador", "ram"],
      weakTokens: ["desktop", "computador", "pc"],
      negativeTokens: ["panela", "cozinha", "fogao", "cafeteira", "capacete", "perfume", "bolsa"],
      negativePhrases: ["panela de pressao", "utilidades domesticas"],
    },
    {
      label: "Celular",
      minScore: 6,
      strongPhrases: ["para samsung", "para iphone", "para motorola", "carregador sem fio", "smart band", "smartwatch", "acessorios para celulares"],
      weakPhrases: ["celular", "smartphone", "iphone", "motorola", "samsung", "xiaomi", "magsafe"],
      strongTokens: ["celular", "smartphone", "iphone", "motorola", "samsung", "xiaomi"],
      weakTokens: ["smartwatch", "band", "magsafe", "magnetico"],
      negativeTokens: ["cozinha", "panela", "moto"],
      negativePhrases: [],
    },
    {
      label: "Bluetooth",
      minScore: 6,
      strongPhrases: ["fone bluetooth", "caixa bluetooth", "mouse bluetooth"],
      weakPhrases: ["bluetooth", "tws"],
      strongTokens: ["bluetooth", "tws"],
      weakTokens: [],
      negativeTokens: ["cozinha", "moto"],
      negativePhrases: [],
    },
    {
      label: "USB",
      minScore: 6,
      strongPhrases: ["usb c", "type c", "tipo c", "hub usb", "cabo usb", "lightning"],
      weakPhrases: ["usb"],
      strongTokens: ["usb", "usbc", "lightning"],
      weakTokens: ["cabo"],
      negativeTokens: ["cozinha", "panela"],
      negativePhrases: [],
    },
    {
      label: "Wi-Fi",
      minScore: 7,
      strongPhrases: ["wi fi", "wifi 6", "roteador mesh", "tomada inteligente wifi", "camera wifi"],
      weakPhrases: ["roteador", "router", "mesh", "repetidor"],
      strongTokens: ["wifi", "roteador", "router", "mesh", "repetidor"],
      weakTokens: [],
      negativeTokens: ["cozinha", "panela", "capacete"],
      negativePhrases: [],
    },
    {
      label: "Sem Fio",
      minScore: 6,
      strongPhrases: ["sem fio", "carregador sem fio", "mouse sem fio", "fone sem fio", "inducao magnetico"],
      weakPhrases: ["wireless", "inducao", "magnetico"],
      strongTokens: ["wireless", "inducao", "magnetico"],
      weakTokens: ["sem", "fio"],
      negativeTokens: ["cozinha", "panela"],
      negativePhrases: [],
    },
    {
      label: "Portátil",
      minScore: 6,
      strongPhrases: ["power bank", "carregador portatil", "mochila viagem", "para viagem", "dobravel", "recarregavel usb"],
      weakPhrases: ["portatil", "compacto", "leve", "viagem"],
      strongTokens: ["portatil", "compacto", "leve", "viagem"],
      weakTokens: ["dobravel", "recarregavel"],
      negativeTokens: [],
      negativePhrases: [],
    },
    {
      label: "Organização",
      minScore: 7,
      strongPhrases: ["caixa organizadora", "organizacao", "organizador de cabos", "organizador de mesa"],
      weakPhrases: ["organizador", "gaveta", "prateleira"],
      strongTokens: ["organizacao", "organizador"],
      weakTokens: ["gaveta", "prateleira"],
      negativeTokens: [],
      negativePhrases: [],
    },
    {
      label: "Casa Inteligente",
      minScore: 7,
      strongPhrases: ["casa inteligente", "smart home", "tomada inteligente", "lampada inteligente", "sensor inteligente", "camera wifi"],
      weakPhrases: ["inteligente"],
      strongTokens: ["smart", "inteligente"],
      weakTokens: ["sensor", "tomada", "lampada"],
      negativeTokens: ["band", "smartwatch"],
      negativePhrases: ["smart band", "relogio smart"],
    },
    {
      label: "Segurança",
      minScore: 7,
      strongPhrases: ["camera de seguranca", "fechadura eletrica", "sensor de movimento", "video porteiro"],
      weakPhrases: ["alarme", "camera", "fechadura"],
      strongTokens: ["alarme", "fechadura", "sensor"],
      weakTokens: ["camera"],
      negativeTokens: ["webcam", "iphone", "band"],
      negativePhrases: ["webcam 4k", "smart band"],
    },
    {
      label: "Premium",
      minScore: 6,
      strongPhrases: ["visual premium", "linha premium", "acabamento premium", "alto padrao"],
      weakPhrases: ["premium", "luxo", "imperial"],
      strongTokens: ["premium", "luxo", "imperial"],
      weakTokens: [],
      negativeTokens: [],
      negativePhrases: [],
    },
    {
      label: "Praticidade",
      minScore: 6,
      strongPhrases: ["dia a dia", "facil de usar", "facil no dia a dia", "muito pratico"],
      weakPhrases: ["praticidade", "util", "compacto", "portatil"],
      strongTokens: ["praticidade", "util"],
      weakTokens: ["compacto", "portatil"],
      negativeTokens: [],
      negativePhrases: [],
    },
  ];

  const CN_CATEGORY_ALIAS_MAP = new Map(
    CN_CATEGORY_ALIAS_PAIRS.map(([k, v]) => [normalizeSearchText(k), v])
  );

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

  // =========================
  // UI PATCH: CSS INJETADO (premium + mobile)
  // =========================
  function injectUiCss() {
    if (document.getElementById("cnLojaUiCss")) return;

    const css = `
/* ===== CN Loja UI Patch (premium / mobile) ===== */
.cnToolsRow{ width:100%; }
.cnTools{ width:100%; }
.cnTools > summary{ list-style:none; cursor:pointer; user-select:none; }
.cnTools > summary::-webkit-details-marker{ display:none; }

.cnToolsSummary{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px; width:100%;
}

.cnToolsGrid{
  display:grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap:10px;
  margin-top:10px;
}
@media (max-width: 720px){
  .cnToolsGrid{ grid-template-columns: repeat(2, minmax(0,1fr)); }
}
.cnToolsGrid .btn{
  width:100%;
  justify-content:center;
  padding:10px 12px;
  border-radius:14px;
}
@media (max-width: 520px){
  .cnToolsGrid .btn{
    padding:9px 10px;
    font-size:12px;
    border-radius:14px;
  }
}

/* Modal de categorias */
.cnModal{
  position:fixed; inset:0;
  display:none;
  align-items:flex-end;
  justify-content:center;
  background: rgba(0,0,0,.55);
  z-index: 999999;
}
.cnModal.show{ display:flex; }

.cnModal__panel{
  width: min(760px, 96vw);
  max-height: 82vh;
  margin: 0 0 14px 0;
  border-radius: 18px;
  overflow:hidden;
  border: 1px solid rgba(215,176,88,.22);
  background: rgba(8,8,10,.92);
  backdrop-filter: blur(14px);
  box-shadow: 0 20px 80px rgba(0,0,0,.65);
}
.cnModal__head{
  display:flex; align-items:center; justify-content:space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(215,176,88,.18);
}
.cnModal__title{
  font-family: Cinzel, serif;
  letter-spacing: .18em;
  text-transform: uppercase;
  font-weight: 900;
  color: rgba(224,195,107,.95);
  font-size: 12px;
}
.cnModal__close{
  border: 1px solid rgba(215,176,88,.22);
  background: rgba(0,0,0,.25);
  color: rgba(255,255,255,.92);
  padding: 8px 10px;
  border-radius: 12px;
  font-weight: 900;
  cursor:pointer;
}
.cnModal__search{
  padding: 10px 14px;
  border-bottom: 1px solid rgba(215,176,88,.12);
}
.cnModal__search input{
  width:100%;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(215,176,88,.18);
  background: rgba(0,0,0,.35);
  color: rgba(255,255,255,.92);
  outline:none;
}
.cnModal__list{
  padding: 12px 14px;
  overflow:auto;
  max-height: calc(82vh - 120px);
  display:flex;
  flex-wrap:wrap;
  gap: 8px;
}
.cnModal__list button{
  border:1px solid rgba(215,176,88,.22);
  background: rgba(0,0,0,.20);
  color: rgba(255,255,255,.90);
  padding: 8px 10px;
  border-radius: 999px;
  font-weight: 900;
  font-size: 12px;
  cursor:pointer;
}
.cnModal__list button.active{
  border-color: rgba(215,176,88,.60);
  background: rgba(215,176,88,.12);
  color: rgba(215,176,88, 1);
  box-shadow: 0 10px 40px rgba(0,0,0,.35);
}
    `.trim();

    const st = document.createElement("style");
    st.id = "cnLojaUiCss";
    st.textContent = css;
    document.head.appendChild(st);
  }
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
          if (bg) bg.style.display = (fit === "contain") ? "block" : "none";
          if (v) v.style.display = (fit === "contain") ? "block" : "none";
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

  function lojaUrl() {
    return new URL("./loja.html", window.location.href).href;
  }

  function stripTags(s) {
    return String(s ?? "").replace(/<[^>]*>/g, " ");
  }

  function cleanText(s) {
    return stripTags(s).replace(/\s+/g, " ").trim();
  }

  function normalizeSearchText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalPinnedLabel(label) {
    const key = normalizeTagKey(label);
    const found = CN_CAT_PINNED.find((x) => normalizeTagKey(x) === key);
    return found || cleanText(label);
  }

  function tokenizeForIndex(s, { dropStopwords = false } = {}) {
    const parts = normalizeSearchText(s).split(/\s+/g).filter(Boolean);
    return parts.filter((part) => {
      if (!part) return false;
      if (dropStopwords && CN_SEARCH_STOPWORDS.has(part)) return false;
      if (part.length <= 2 && !CN_SHORT_TOKEN_ALLOWLIST.has(part)) return false;
      return true;
    });
  }

  function hasNormalizedPhrase(paddedText, phrase) {
    const needle = normalizeSearchText(phrase);
    if (!needle) return false;
    return paddedText.includes(` ${needle} `);
  }

  function buildProductIndex(p) {
    if (p && p._searchIndex) return p._searchIndex;

    const titleNorm = normalizeTagKey(p?.title || "");
    const skuNorm = normalizeTagKey(p?.sku || "");
    const idNorm = normalizeTagKey(p?.id_busca || "");
    const priceNorm = normalizeTagKey(p?.price_text || "");
    const badgesArr = safeArray(p?.badges).map((b) => normalizeTagKey(b)).filter(Boolean);
    const badgesNorm = badgesArr.join(" ");
    const rawNorm = [titleNorm, badgesNorm, skuNorm, idNorm, priceNorm].filter(Boolean).join(" ");

    const idx = {
      titleNorm,
      skuNorm,
      idNorm,
      priceNorm,
      badgesArr,
      badgesNorm,
      rawNorm,
      titlePadded: ` ${titleNorm} `,
      badgesPadded: ` ${badgesNorm} `,
      skuPadded: ` ${skuNorm} `,
      rawPadded: ` ${rawNorm} `,
      titleTokens: new Set(tokenizeForIndex(titleNorm)),
      badgeTokens: new Set(tokenizeForIndex(badgesNorm)),
      skuTokens: new Set(tokenizeForIndex(skuNorm)),
      tokens: new Set(tokenizeForIndex(rawNorm)),
    };

    if (p) p._searchIndex = idx;
    return idx;
  }

  function matchPhraseScore(paddedText, phrases, weight) {
    let score = 0;
    for (const phrase of (phrases || [])) {
      if (hasNormalizedPhrase(paddedText, phrase)) score += weight;
    }
    return score;
  }

  function matchTokenScore(tokenSet, tokens, weight) {
    let score = 0;
    for (const token of (tokens || [])) {
      const key = normalizeTagKey(token);
      if (key && tokenSet.has(key)) score += weight;
    }
    return score;
  }

  function getExactMappedCategories(p) {
    const idx = buildProductIndex(p);
    const out = [];
    const seen = new Set();
    const add = (label) => {
      const clean = canonicalPinnedLabel(label);
      const key = normalizeTagKey(clean);
      if (!clean || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    };

    for (const badge of idx.badgesArr) {
      if (CN_CATEGORY_ALIAS_MAP.has(badge)) {
        add(CN_CATEGORY_ALIAS_MAP.get(badge));
        continue;
      }
      const pinned = canonicalPinnedLabel(badge);
      if (CN_CAT_PINNED.some((x) => normalizeTagKey(x) === normalizeTagKey(pinned))) {
        add(pinned);
      }
    }

    return out;
  }

  function scoreCategory(rule, idx) {
    let score = 0;

    score += matchPhraseScore(idx.titlePadded, rule.strongPhrases, 8);
    score += matchPhraseScore(idx.badgesPadded, rule.strongPhrases, 10);
    score += matchPhraseScore(idx.rawPadded, rule.strongPhrases, 4);

    score += matchPhraseScore(idx.titlePadded, rule.weakPhrases, 4);
    score += matchPhraseScore(idx.badgesPadded, rule.weakPhrases, 6);
    score += matchPhraseScore(idx.rawPadded, rule.weakPhrases, 2);

    score += matchTokenScore(idx.titleTokens, rule.strongTokens, 5);
    score += matchTokenScore(idx.badgeTokens, rule.strongTokens, 7);
    score += matchTokenScore(idx.tokens, rule.strongTokens, 2);

    score += matchTokenScore(idx.titleTokens, rule.weakTokens, 2);
    score += matchTokenScore(idx.badgeTokens, rule.weakTokens, 4);
    score += matchTokenScore(idx.tokens, rule.weakTokens, 1);

    score -= matchPhraseScore(idx.rawPadded, rule.negativePhrases, 8);
    score -= matchTokenScore(idx.tokens, rule.negativeTokens, 4);

    return score;
  }

  function getSmartCategories(p) {
    if (Array.isArray(p?._smart_categories) && p._smart_categories.length) return p._smart_categories.slice();

    const idx = buildProductIndex(p);
    const out = [];
    const seen = new Set();
    const add = (label) => {
      const finalLabel = canonicalPinnedLabel(label);
      if (!finalLabel) return;
      const key = normalizeTagKey(finalLabel);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(finalLabel);
    };

    for (const cat of getExactMappedCategories(p)) add(cat);

    for (const rule of CN_CATEGORY_RULES) {
      const score = scoreCategory(rule, idx);
      if (score >= (rule.minScore || 6)) add(rule.label);
    }

    p._smart_categories = out.slice();
    return out;
  }

  function getSearchScore(p, query) {
    const qNorm = normalizeTagKey(query || "");
    if (!qNorm) return 0;

    const idx = buildProductIndex(p);
    let score = 0;

    if (idx.idNorm && idx.idNorm === qNorm) score += 300;
    if (idx.skuNorm && idx.skuNorm === qNorm) score += 260;
    if (idx.titleNorm && idx.titleNorm === qNorm) score += 220;

    if (hasNormalizedPhrase(idx.titlePadded, qNorm)) score += 90;
    if (hasNormalizedPhrase(idx.rawPadded, qNorm)) score += 35;

    const qTokens = tokenizeForIndex(qNorm, { dropStopwords: true });
    if (!qTokens.length) return score;

    let missing = 0;
    let titleHits = 0;
    let badgeHits = 0;

    for (const token of qTokens) {
      if (idx.titleTokens.has(token)) {
        score += 15;
        titleHits += 1;
        continue;
      }
      if (idx.badgeTokens.has(token)) {
        score += 12;
        badgeHits += 1;
        continue;
      }
      if (idx.tokens.has(token)) {
        score += 8;
        continue;
      }
      missing += 1;
    }

    if (missing > 0) return -1;
    if (titleHits === qTokens.length) score += 20;
    if (titleHits >= Math.max(1, qTokens.length - 1)) score += 10;
    if (badgeHits && qTokens.length <= 3) score += 4;
    return score;
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

  function parseUrlSafe(url) {
    try {
      return new URL(String(ensureHttpUrl(url) || ""));
    } catch {
      return null;
    }
  }

  function pathOf(url) {
    const u = parseUrlSafe(url);
    return u ? String(u.pathname || "").toLowerCase().trim() : "";
  }

  function isBlockedStorefrontPath(u) {
    const path = pathOf(u);
    if (!path) return false;
    if (path.includes("/social/")) return true;
    if (/(^|\/)lists?(\/|$)/.test(path)) return true;
    return false;
  }

  function isUsableBuyLink(u) {
    return isProbablyValidLink(u) && !isBlockedStorefrontPath(u);
  }

  function isInAppBrowser() {
    const ua = String(navigator.userAgent || "").toLowerCase();
    return (
      ua.includes("instagram") ||
      ua.includes("fbav") ||
      ua.includes("fban") ||
      ua.includes("messenger") ||
      ua.includes("line/") ||
      ua.includes("; wv") ||
      ua.includes(" webview")
    );
  }

  function pickBestLink(raw) {
    const open = ensureHttpUrl(raw.open_url || raw.link || raw.url || "");
    const check = ensureHttpUrl(raw.check_url || "");
    const canonical = ensureHttpUrl(raw.canonical_url || "");
    const resolved = ensureHttpUrl(raw.resolved_url || "");
    const shorty = ensureHttpUrl(raw.short_url || "");

    const candidates = [open, check, canonical, resolved, shorty].filter(Boolean);
    const primary = candidates.find(isUsableBuyLink) || candidates.find(isProbablyValidLink) || "";
    const alt =
      candidates.find((c) => c && c !== primary && isUsableBuyLink(c)) ||
      candidates.find((c) => c && c !== primary && isProbablyValidLink(c)) ||
      "";

    return { primary, alt, open, check, canonical, resolved, shorty };
  }

  function bestBuyUrl(p) {
    const candidates = [
      p.buy_url,
      p.open_url,
      p.check_url,
      p.canonical_url,
      p.short_url,
      p.resolved_url,
    ].map(ensureHttpUrl).filter(Boolean);

    return candidates.find(isUsableBuyLink) || candidates.find(isProbablyValidLink) || "";
  }

  function openBuy(url) {
    const u = ensureHttpUrl(url);
    if (!u) return false;

    try {
      const w = window.open(u, "_blank", "noopener,noreferrer");
      if (w) {
        try { if (typeof w.focus === "function") w.focus(); } catch {}
        return true;
      }
    } catch {}

    if (isInAppBrowser()) {
      window.location.assign(u);
      return true;
    }

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
    const issue_number = Number(
      raw.issue_number ||
      raw.issue_id ||
      raw.issue ||
      raw.github_issue_number ||
      raw.source_issue_number ||
      0
    ) || 0;

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
      issue_number,

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

  function featuredHTML(p, isProdutoDoDia) {
    const img = p.image
      ? `<img data-cnimg="1" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:24px;">
           Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span>
         </div>`;

    const disabled = (p.active === false);
    const buyUrl = bestBuyUrl(p);
    const hasLink = isUsableBuyLink(buyUrl);

    const buyBtn = (disabled || !hasLink)
      ? `<button class="btn btn--gold" type="button" disabled style="opacity:.55; cursor:not-allowed;">INDISPONÍVEL</button>`
      : `<a class="btn btn--gold" data-role="buy-link" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">COMPRAR AGORA</a>`;

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
    const hasLink = isUsableBuyLink(buyUrl);

    const buy = (disabled || !hasLink)
      ? `<button class="smallBtn smallBtnGold" type="button" disabled style="opacity:.55; cursor:not-allowed;">Indisponível</button>`
      : `<a class="smallBtn smallBtnGold" data-role="buy-link" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">Comprar</a>`;

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
      for (const cat of getSmartCategories(p)) {
        const raw = String(cat || "").trim();
        if (!raw) continue;
        const k = normalizeTagKey(raw);
        const prev = counts.get(k);
        counts.set(k, { label: canonicalPinnedLabel(raw), n: ((prev && prev.n) ? prev.n : 0) + 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.n - a.n);
  }

  function normalizeTagKey(s) {
    return normalizeSearchText(s);
  }

  function isNoisyTag(label) {
    const s = String(label || "").trim();
    if (!s) return true;

    const t = normalizeTagKey(s);

    if (CN_CAT_NOISE.has(t)) return true;
    if (CN_CAT_BRANDS.has(t)) return true;

    if (t.length > 26) return true;

    // dígitos: só deixa se estiver na allowlist (ex: 4k, wi-fi 6, usb-c)
    if (/\d/.test(t) && !CN_CAT_ALLOW_DIGITS.has(t)) return true;

    // medidas/unidades/formatos
    if (/^[0-9]+([.,][0-9]+)?\s*(w|wh|mah|ah|v|a|hz|gb|tb|mbps|psi|cm|mm|kg|l|ml|m|s)?$/i.test(t)) return true;
    if (/^(abnt|ip\d{2}|ipx\d)$/i.test(t)) return true;
    if (/^\d+\s*(tomadas|portas|peças|unidades|baterias)$/i.test(t)) return true;

    // símbolos que viram “tag técnica”
    if (/[()\/+]/.test(t)) return true;

    return false;
  }

  function isCategoryTag(label, n) {
    if ((n || 0) < CN_CAT_MIN_COUNT) {
      // pinned entra mesmo se tiver pouco
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

    if ((STATE.query || "").trim()) {
      arr.sort((a, b) => {
        const sa = getSearchScore(a, STATE.query || "");
        const sb = getSearchScore(b, STATE.query || "");
        if (sa !== sb) return sb - sa;
        const fa = a.featured ? 0 : 1;
        const fb = b.featured ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return String(a.title).localeCompare(String(b.title), "pt-BR");
      });
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
    const q = STATE.query || "";
    const tag = normalizeTagKey(STATE.tag || "");

    if (tag) {
      const hasSmart = getSmartCategories(p).some((b) => normalizeTagKey(b) === tag);
      if (!hasSmart) return false;
    }

    if (!String(q || "").trim()) return true;
    return getSearchScore(p, q) >= 0;
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

    // se categoria selecionada não está em top, injeta no começo
    const activeKey = normalizeTagKey(STATE.tag || "");
    if (activeKey && !top.some((t) => normalizeTagKey(t.label) === activeKey)) {
      const sel = categories.find((t) => normalizeTagKey(t.label) === activeKey);
      if (sel) top = [sel, ...top].slice(0, maxChips);
    }

    // contador premium: "14+" quando tem mais
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

    featuredEl.innerHTML = featuredPass
      ? featuredHTML(featuredPass, true)
      : (destaque ? featuredHTML(destaque, false) : emptyFeaturedHTML());

    applyImageFixes(featuredEl);

    let list = filtered.slice();

    if (featuredPass && SHOW_FEATURED_IN_GRID) {
      list = [featuredPass, ...list.filter((p) => p.sku !== featuredPass.sku)];
    } else if (featuredPass && !SHOW_FEATURED_IN_GRID) {
      list = list.filter((p) => p.sku !== featuredPass.sku);
    }

    const shown = list.slice(0, STATE.limit);
    grid.innerHTML = shown.map(productCardHTML).join("");
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

  async function fetchReviewReport() {
    try {
      const res = await fetch(`./data/link_guardian_review.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return { updated_at: "", total_items: 0, summary: {}, items: [] };
      const data = await res.json();
      if (!data || typeof data !== "object") return { updated_at: "", total_items: 0, summary: {}, items: [] };
      if (!Array.isArray(data.items)) data.items = [];
      if (!data.summary || typeof data.summary !== "object") data.summary = {};
      data.total_items = Number(data.total_items || data.items.length || 0);
      return data;
    } catch {
      return { updated_at: "", total_items: 0, summary: {}, items: [] };
    }
  }

  function updateMaintenanceButton() {
    const btn = $("#btnDlReview");
    if (!btn) return;
    const total = Number((STATE.reviewReport && STATE.reviewReport.total_items) || 0);
    btn.textContent = total > 0 ? `🛠️ TXT manutenção (${total})` : "🛠️ TXT manutenção";
  }

  async function doExportReviewTxt() {
    try {
      const res = await fetch(`./logs/link_guardian_review.txt?ts=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const txt = await res.text();
        if (String(txt || "").trim()) {
          const fname = `manutencao_guardian_${dateStamp()}.txt`;
          downloadFile(fname, txt, "text/plain;charset=utf-8");
          showToast("TXT manutenção ⬇️");
          return;
        }
      }
    } catch {}

    const report = STATE.reviewReport || { items: [], total_items: 0 };
    const items = Array.isArray(report.items) ? report.items : [];
    if (!items.length) {
      showToast("Sem manutenção pendente ✅");
      return;
    }

    const lines = [];
    lines.push("LINK GUARDIAN — REVISÃO / MANUTENÇÃO");
    lines.push(`Atualizado em: ${report.updated_at || new Date().toISOString()}`);
    lines.push(`Total: ${items.length}`);
    lines.push("");

    for (const item of items) {
      lines.push("[MANUTENÇÃO] Produto suspeito");
      lines.push(`SKU: ${item.sku || ""}`);
      lines.push(`Título: ${item.title || ""}`);
      if (item.id_busca) lines.push(`ID ML: ${item.id_busca}`);
      if (item.open_url) lines.push(`Link atual: ${item.open_url}`);
      if (item.final_url) lines.push(`Destino detectado: ${item.final_url}`);
      lines.push(`Classificação: ${item.review_bucket || ""}`);
      lines.push(`Motivo: ${item.reason || ""}`);
      if (item.review_note) lines.push(`Nota: ${item.review_note}`);
      lines.push(`Ação sugerida: ${item.suggested_action || ""}`);
      lines.push("");
    }

    const fname = `manutencao_guardian_${dateStamp()}.txt`;
    downloadFile(fname, lines.join("\n") + "\n", "text/plain;charset=utf-8");
    showToast("TXT manutenção ⬇️");
  }

  function findBySku(sku) {
    return STATE.products.find((p) => p && p.sku === sku) || null;
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

    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "produtos.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("Exportado ⬇️");
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
      const issue = (p && Number(p.issue_number || 0)) ? `Issue: #${Number(p.issue_number)}` : "";
      const meta = [issue, id ? `ID: ${id}` : ""].filter(Boolean).join(" | ");
      if (meta) return `${i + 1}. ${name} (${meta})`;
      return `${i + 1}. ${name}`;
    });

    return header + "\n" + lines.join("\n") + "\n";
  }

  function exportListCsv(kind) {
    const list = exportListGet(kind);

    const rows = [];
    rows.push(["n", "issue_number", "title", "id_busca", "sku", "buy_url"].join(";"));

    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      const n = i + 1;
      const issue = String(Number(p.issue_number || 0) || "").replaceAll(";", ",");
      const title = String(p.title || "").replaceAll(";", ",");
      const id = String(p.id_busca || "").replaceAll(";", ",");
      const sku = String(p.sku || "").replaceAll(";", ",");
      const url = String(bestBuyUrl(p) || "").replaceAll(";", ",");
      rows.push([n, issue, title, id, sku, url].join(";"));
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

    if (copyPageBtn) {
      copyPageBtn.addEventListener("click", () => {
        copyText(location.href);
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

    // Ferramentas (recolhível no mobile)
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
            <button class="btn btn--tiny btn--glass" type="button" id="btnExportCatalogTxt">⬇️ TXT (produtos.json)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnCopyList">📋 Copiar (ativos)</button>
            <button class="btn btn--tiny btn--gold"  type="button" id="btnDlList">⬇️ TXT (ativos)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlListAll">⬇️ TXT (tudo)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlCsvAll">⬇️ CSV (tudo)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlReview">🛠️ TXT manutenção</button>
          </div>
        </details>
      `;
      tools.appendChild(row);
    })();

    const btnExportCatalogTxt = $("#btnExportCatalogTxt");
    const btnCopyList = $("#btnCopyList");
    const btnDlList = $("#btnDlList");
    const btnDlListAll = $("#btnDlListAll");
    const btnDlCsvAll = $("#btnDlCsvAll");
    const btnDlReview = $("#btnDlReview");

    if (btnExportCatalogTxt) btnExportCatalogTxt.addEventListener("click", () => doExportTxt("all"));
    if (btnCopyList) btnCopyList.addEventListener("click", () => doCopyTxt("active"));
    if (btnDlList) btnDlList.addEventListener("click", () => doExportTxt("active"));
    if (btnDlListAll) btnDlListAll.addEventListener("click", () => doExportTxt("all"));
    if (btnDlCsvAll) btnDlCsvAll.addEventListener("click", () => doExportCsv("all"));
    if (btnDlReview) btnDlReview.addEventListener("click", () => doExportReviewTxt());
    updateMaintenanceButton();

    document.addEventListener("click", (e) => {
      const openCats = e.target.closest('[data-action="openTags"]');
      if (openCats) {
        e.preventDefault();
        openTagModal();
        return;
      }

      const aBuy = e.target.closest('a[data-role="buy-link"][href]');
      if (aBuy) {
        const href = aBuy.getAttribute("href") || aBuy.href || "";

        if (!isProbablyValidLink(href)) {
          e.preventDefault();
          showToast("Link inválido ⚠️");
          return;
        }

        if (isBlockedStorefrontPath(href)) {
          e.preventDefault();
          showToast("Link do produto precisa ser atualizado ⚠️");
          return;
        }

        if (isInAppBrowser()) {
          e.preventDefault();
          openBuy(href);
          return;
        }

        return;
      }

      const chip = e.target.closest("[data-tag]");
      if (chip && chip.classList.contains("tagChip")) {
        const t = String(chip.getAttribute("data-tag") || "").trim();
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

      if (action === "copyLink" && p) return copyText(bestBuyUrl(p) || "");
      if (action === "copyAlt" && p) return copyText(p.alt_url || p.canonical_url || p.check_url || "");
      if (action === "copyId" && p) return copyText(p.id_busca || "");

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
    reviewReport: { updated_at: "", total_items: 0, summary: {}, items: [] },
  };

  async function boot() {
    injectUiCss();
    makeBgClickThrough();
    ensureTagModal();

    readUrlState();
    setText($("#year"), new Date().getFullYear());

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

    STATE.reviewReport = await fetchReviewReport();
    updateMaintenanceButton();

    const q = $("#qLoja");
    if (q) q.value = STATE.query || "";

    const sortSel = $("#sortSel");
    if (sortSel) sortSel.value = STATE.sort || "relev";

    STATE.tag = normalizeTagKey(STATE.tag || "");

    bind();
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
