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

   PATCH 2026-03-26 (INTELIGÊNCIA / LIMPEZA FERRAMENTAS):
     - Remove redundância pública na faixa de exportação
     - Troca TXT (produtos.json) / TXT (tudo) por Relatório inteligente
     - Mantém CSV bruto / Copiar ativos / TXT manutenção
     - Oculta botão duplicado do rodapé quando já existe “Copiar link da loja” no topo

   PATCH 2026-03-02 (UI PREMIUM / CATEGORIAS INTELIGENTES):
     - Ferramentas (listas/export): recolhível no mobile (nada gigante).
     - Categorias: só “macro-categorias” úteis + pinned (mobile não fica incompleto).
     - “Ver todas” abre modal premium com busca.
     - Contador “Categorias” vira 14+ (premium), total aparece no “Ver todas (X)”.

   PATCH 2026-03-29 (ESTRUTURA COMERCIAL DAS CATEGORIAS):
     - Loja Completa passa a separar: categorias principais / subcategorias / atributos rápidos
     - Categoria principal canônica ganha prioridade real sobre macro-inferência
     - Subcategorias passam a responder ao contexto da categoria selecionada
     - Atributos editoriais/técnicos ficam em faixa separada para não poluir a navegação
     - Botões de compra ganham padrão visual mais próximo da home

   PATCH 2026-03-29 (LAPIDAÇÃO FINAL — HIERARQUIA + MOBILE):
     - Categorias principais passam a trabalhar em famílias comerciais reais
     - Beleza / Casa / Tecnologia deixam de competir com microcategoria no topo
     - Subcategorias herdam contexto da família escolhida e ganham ordem mais comercial
     - Atributos rápidos ficam mais editoriais/táticos, sem duplicar a navegação
     - Mobile ganha seletor de ordenação e bloco de filtros com leitura mais forte
   ========================================================== */

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const ADMIN = new URLSearchParams(location.search).get("admin") === "1";
  const SHOW_FEATURED_IN_GRID = false;

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
    "Beleza",
    "Maquiagem",
    "Olhos",
    "Paleta de Sombras",
    "Rosto",
    "Gloss Labial",
    "Corretivo",
    "Cílios",
    "Skincare",
    "Perfume",
    "Organização",
    "Casa",
    "Cozinha",
    "Home Office",
    "Carro",
    "Moto",
    "Segurança",
    "Notebook",
    "PC",
    "Celular",
    "Wi-Fi",
    "Bluetooth",
    "USB",
    "Sem Fio",
    "Portátil",
    "Casa Inteligente",
    "Premium",
    "Praticidade",
  ];

  // regra base: categoria só se repetir e não for “ruído”
  const CN_CAT_MIN_COUNT = 3;               // mais agressivo: reduz poluição
  const CN_CAT_MAX_CHIPS_DESKTOP = 20;
  const CN_CAT_MAX_CHIPS_MOBILE = 14;       // mobile “completo” sem virar mural

  const CN_PRIMARY_CATEGORY_ORDER = [
    "Beleza",
    "Casa",
    "Tecnologia",
    "Segurança",
    "Carro",
    "Moto",
  ];

  const CN_UTILITY_CATEGORY_ORDER = [
    "Achados do Dia",
    "Premium",
    "Praticidade",
    "Feminino",
    "Portátil",
    "Sem Fio",
  ];

  const CN_SECONDARY_CATEGORY_ORDER = {
    "Beleza": [
      "Maquiagem",
      "Olhos",
      "Paleta de Sombras",
      "Rosto",
      "Lábios",
      "Gloss Labial",
      "Corretivo",
      "Blushes e Iluminadores",
      "Cílios",
      "Skincare",
      "Perfume",
      "Organização",
    ],
    "Casa": [
      "Cozinha",
      "Organização",
      "Casa Inteligente",
      "Praticidade",
    ],
    "Tecnologia": [
      "Home Office",
      "Notebook",
      "PC",
      "Celular",
      "Setup",
      "Wi-Fi",
      "Bluetooth",
      "USB",
      "Sem Fio",
      "Portátil",
      "Casa Inteligente",
    ],
    "Segurança": [
      "Segurança",
      "Casa Inteligente",
      "Wi-Fi",
      "Sem Fio",
    ],
    "Carro": [
      "Carro",
      "Bluetooth",
      "USB",
      "Portátil",
      "Praticidade",
    ],
    "Moto": [
      "Moto",
      "Segurança",
      "Portátil",
      "Praticidade",
    ],
  };

  const CN_SUBCATEGORY_MAX_DESKTOP = 12;
  const CN_SUBCATEGORY_MAX_MOBILE = 8;
  const CN_UTILITY_MAX_DESKTOP = 8;
  const CN_UTILITY_MAX_MOBILE = 5;

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

    ["beleza e cuidado pessoal", "Beleza"],
    ["cuidado pessoal", "Beleza"],
    ["beleza", "Beleza"],
    ["maquiagem", "Maquiagem"],
    ["make", "Maquiagem"],
    ["olhos", "Olhos"],
    ["rosto", "Rosto"],
    ["paleta de sombras", "Paleta de Sombras"],
    ["paleta de sombra", "Paleta de Sombras"],
    ["sombras", "Paleta de Sombras"],
    ["gloss labial", "Gloss Labial"],
    ["gloss", "Gloss Labial"],
    ["labios", "Lábios"],
    ["labial", "Lábios"],
    ["blushes e iluminadores", "Blushes e Iluminadores"],
    ["blush e iluminador", "Blushes e Iluminadores"],
    ["corretivo", "Corretivo"],
    ["cilios", "Cílios"],
    ["extensao de cilios", "Cílios"],
    ["cola para cilios", "Cílios"],
    ["cola para extensao de cilios", "Cílios"],
    ["skincare", "Skincare"],
    ["cuidados com a pele", "Skincare"],
    ["hidratante", "Skincare"],
    ["serum", "Skincare"],
    ["perfume", "Perfume"],
    ["body splash", "Perfume"],
    ["fragrancia", "Perfume"],
    ["fragrancias", "Perfume"],

    ["feminino", "Feminino"],
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
    ["organizador de maquiagem", "Organização"],
    ["porta maquiagem", "Organização"],
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
      label: "Beleza",
      minScore: 7,
      strongPhrases: ["beleza e cuidado pessoal", "cuidado pessoal", "body splash", "perfume", "skincare", "hidratante"],
      weakPhrases: ["beleza", "cuidados com a pele", "serum", "hidratante", "fragrancia", "fragrancias"],
      strongTokens: ["beleza", "skincare", "serum", "hidratante", "perfume"],
      weakTokens: ["pele", "fragrancia", "fragrancias"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Maquiagem",
      minScore: 7,
      strongPhrases: ["paleta de sombras", "gloss labial", "blush stick", "corretivo liquido", "lapis labial", "batom liquido", "pincel de maquiagem", "kit de pinceis", "iluminador liquido"],
      weakPhrases: ["maquiagem", "gloss", "batom", "blush", "corretivo", "paleta", "sombras", "pincel", "iluminador", "bronzer", "rimel", "mascara de cilios", "delineador"],
      strongTokens: ["maquiagem", "gloss", "batom", "blush", "corretivo", "paleta", "sombras", "pincel", "iluminador", "bronzer"],
      weakTokens: ["rimel", "delineador", "make"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Olhos",
      minScore: 8,
      strongPhrases: ["paleta de sombras", "mascara de cilios", "cola para cilios", "extensao de cilios", "delineador", "lapis de olho"],
      weakPhrases: ["olhos", "sombras", "cilios", "delineador", "rimel"],
      strongTokens: ["olhos", "cilios", "sombras", "delineador", "rimel"],
      weakTokens: ["lapis", "mascara"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Paleta de Sombras",
      minScore: 9,
      strongPhrases: ["paleta de sombras", "paleta de sombra", "sombra compacta"],
      weakPhrases: ["sombras", "paleta"],
      strongTokens: ["paleta", "sombras"],
      weakTokens: ["olhos"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Rosto",
      minScore: 8,
      strongPhrases: ["corretivo liquido", "base liquida", "blush stick", "bronzer", "iluminador liquido"],
      weakPhrases: ["rosto", "corretivo", "base", "blush", "bronzer", "iluminador"],
      strongTokens: ["rosto", "corretivo", "base", "blush", "bronzer", "iluminador"],
      weakTokens: [],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Gloss Labial",
      minScore: 9,
      strongPhrases: ["gloss labial", "lip gloss"],
      weakPhrases: ["gloss"],
      strongTokens: ["gloss"],
      weakTokens: ["labial"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Corretivo",
      minScore: 9,
      strongPhrases: ["corretivo liquido", "corretivo alta cobertura"],
      weakPhrases: ["corretivo"],
      strongTokens: ["corretivo"],
      weakTokens: ["cobertura"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Cílios",
      minScore: 9,
      strongPhrases: ["cola para cilios", "extensao de cilios", "cola para extensao de cilios", "mascara de cilios"],
      weakPhrases: ["cilios", "extensao"],
      strongTokens: ["cilios"],
      weakTokens: ["extensao", "cola"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Skincare",
      minScore: 8,
      strongPhrases: ["cuidados com a pele", "skincare", "hidratante facial", "serum facial"],
      weakPhrases: ["hidratante", "serum", "pele"],
      strongTokens: ["skincare", "hidratante", "serum"],
      weakTokens: ["pele"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Perfume",
      minScore: 8,
      strongPhrases: ["body splash", "perfume feminino", "perfume importado"],
      weakPhrases: ["perfume", "fragrancia", "fragrancias"],
      strongTokens: ["perfume", "fragrancia", "fragrancias"],
      weakTokens: ["body", "splash"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela"],
      negativePhrases: [],
    },
    {
      label: "Feminino",
      minScore: 8,
      strongPhrases: ["acessorio feminino", "bolsa feminina", "vestido feminino", "lingerie feminina", "necessaire feminina", "brinco feminino", "colar feminino"],
      weakPhrases: ["feminino", "bolsa", "brinco", "colar", "pulseira", "anel", "vestido", "saia", "blusa feminina", "lingerie", "necessaire"],
      strongTokens: ["feminino", "lingerie"],
      weakTokens: ["bolsa", "brinco", "colar", "pulseira", "anel", "vestido", "saia", "necessaire"],
      negativeTokens: ["ssd", "nvme", "roteador", "capacete", "panela", "maquiagem", "paleta", "gloss", "corretivo", "cilios"],
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

  const CN_EDITORIAL_CATEGORIES = new Set([
    "feminino",
    "premium",
    "praticidade",
    "achados do dia",
  ]);

  const CN_CATEGORY_FAMILY_MAP = new Map([
    ["beleza", "Beleza"],
    ["maquiagem", "Beleza"],
    ["olhos", "Beleza"],
    ["paleta de sombras", "Beleza"],
    ["rosto", "Beleza"],
    ["labios", "Beleza"],
    ["lábios", "Beleza"],
    ["gloss labial", "Beleza"],
    ["corretivo", "Beleza"],
    ["blushes e iluminadores", "Beleza"],
    ["cilios", "Beleza"],
    ["cílios", "Beleza"],
    ["skincare", "Beleza"],
    ["perfume", "Beleza"],

    ["casa", "Casa"],
    ["cozinha", "Casa"],
    ["organizacao", "Casa"],
    ["organização", "Casa"],
    ["casa inteligente", "Casa"],

    ["tecnologia", "Tecnologia"],
    ["home office", "Tecnologia"],
    ["setup", "Tecnologia"],
    ["notebook", "Tecnologia"],
    ["pc", "Tecnologia"],
    ["celular", "Tecnologia"],
    ["wi fi", "Tecnologia"],
    ["bluetooth", "Tecnologia"],
    ["usb", "Tecnologia"],
    ["sem fio", "Tecnologia"],
    ["portatil", "Tecnologia"],
    ["portátil", "Tecnologia"],

    ["seguranca", "Segurança"],
    ["segurança", "Segurança"],

    ["carro", "Carro"],
    ["moto", "Moto"],
  ]);

  const CN_CATEGORY_PRIORITY_MAP = new Map([
    ["achados do dia", 300],
    ["beleza", 260],
    ["casa", 240],
    ["tecnologia", 230],
    ["seguranca", 220],
    ["carro", 210],
    ["moto", 205],

    ["maquiagem", 200],
    ["olhos", 196],
    ["paleta de sombras", 194],
    ["rosto", 192],
    ["labios", 191],
    ["lábios", 191],
    ["gloss labial", 190],
    ["corretivo", 188],
    ["blushes e iluminadores", 186],
    ["cilios", 184],
    ["cílios", 184],
    ["skincare", 182],
    ["perfume", 180],

    ["organizacao", 176],
    ["organização", 176],
    ["cozinha", 172],
    ["home office", 168],
    ["notebook", 164],
    ["pc", 162],
    ["celular", 160],
    ["setup", 158],
    ["wi fi", 156],
    ["bluetooth", 154],
    ["usb", 152],
    ["sem fio", 150],
    ["portatil", 148],
    ["portátil", 148],
    ["casa inteligente", 146],

    ["premium", 40],
    ["praticidade", 30],
    ["feminino", 20],
  ]);

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
    const mapped = CN_CATEGORY_ALIAS_MAP.get(key);
    if (mapped) return mapped;
    const found = CN_CAT_PINNED.find((x) => normalizeTagKey(x) === key);
    return found || cleanText(label);
  }

  function isEditorialCategory(label) {
    return CN_EDITORIAL_CATEGORIES.has(normalizeTagKey(label));
  }

  function getCategoryPriorityBoost(label) {
    return Number(CN_CATEGORY_PRIORITY_MAP.get(normalizeTagKey(label)) || 0);
  }

  function getCommercialFamily(label) {
    const key = normalizeTagKey(label || "");
    if (!key) return "";
    return String(CN_CATEGORY_FAMILY_MAP.get(key) || "");
  }

  function getSecondaryOrderForFamily(label) {
    const family = String(label || "");
    return Array.isArray(CN_SECONDARY_CATEGORY_ORDER[family])
      ? CN_SECONDARY_CATEGORY_ORDER[family]
      : [];
  }

  function orderSecondaryCategories(items, familyLabel) {
    const explicit = getSecondaryOrderForFamily(familyLabel);
    if (explicit.length) return orderByExplicitList(items, explicit);
    return orderCategories(items);
  }

  function isPrimaryCommercialCategory(label) {
    const key = normalizeTagKey(label);
    return CN_PRIMARY_CATEGORY_ORDER.some((x) => normalizeTagKey(x) === key);
  }

  function isUtilityCategory(label) {
    const key = normalizeTagKey(label);
    return CN_UTILITY_CATEGORY_ORDER.some((x) => normalizeTagKey(x) === key) || isEditorialCategory(label);
  }

  function orderByExplicitList(items, explicitOrder) {
    const orderMap = new Map(explicitOrder.map((label, idx) => [normalizeTagKey(label), idx]));
    return (items || []).slice().sort((a, b) => {
      const ai = orderMap.has(normalizeTagKey(a.label)) ? orderMap.get(normalizeTagKey(a.label)) : 9999;
      const bi = orderMap.has(normalizeTagKey(b.label)) ? orderMap.get(normalizeTagKey(b.label)) : 9999;
      if (ai !== bi) return ai - bi;

      const boostDiff = getCategoryPriorityBoost(b.label) - getCategoryPriorityBoost(a.label);
      if (boostDiff !== 0) return boostDiff;

      if (b.n !== a.n) return b.n - a.n;
      return String(a.label).localeCompare(String(b.label), "pt-BR");
    });
  }

  function countLabelMap(list, extractor, options = {}) {
    const counts = new Map();
    const min = Number(options.min || 1);

    for (const p of (list || [])) {
      const rawValues = safeArray(extractor(p));
      const unique = uniqLabels(rawValues);
      for (const label of unique) {
        const clean = canonicalPinnedLabel(label);
        const key = normalizeTagKey(clean);
        if (!clean || !key) continue;
        const prev = counts.get(key);
        counts.set(key, { label: clean, n: ((prev && prev.n) ? prev.n : 0) + 1 });
      }
    }

    return Array.from(counts.values()).filter((item) => item.n >= min);
  }

  function productMatchesTag(p, tag) {
    const key = normalizeTagKey(tag || "");
    if (!key) return true;

    const labels = uniqLabels([
      getStructuredPrimaryCategory(p),
      ...getStructuredSecondaryCategories(p),
      ...getStructuredUtilityCategories(p),
      ...getDisplayCategories(p),
      ...getCanonicalCategories(p),
      ...safeArray(p.badges),
    ]);

    return labels.some((x) => normalizeTagKey(x) === key);
  }

  function getStructuredPrimaryCategory(p) {
    const candidates = uniqLabels([
      getCanonicalPrimaryCategory(p),
      ...getCanonicalCategories(p),
      ...getSmartCategories(p),
    ]);

    for (const label of candidates) {
      const family = getCommercialFamily(label);
      if (family) return family;
    }

    const primary = canonicalPinnedLabel(getCanonicalPrimaryCategory(p));
    if (primary && isPrimaryCommercialCategory(primary)) return primary;

    const canonical = getCanonicalCategories(p);
    const canonicalPrimaryLike = canonical.find((label) => isPrimaryCommercialCategory(label));
    if (canonicalPrimaryLike) return canonicalPrimaryLike;

    const smart = getSmartCategories(p);
    const smartPrimaryLike = smart.find((label) => isPrimaryCommercialCategory(label));
    if (smartPrimaryLike) return smartPrimaryLike;

    return primary || canonical[0] || smart[0] || "";
  }

  function getStructuredSecondaryCategories(p) {
    const familyKey = normalizeTagKey(getStructuredPrimaryCategory(p));
    const canonicalPrimary = canonicalPinnedLabel(getCanonicalPrimaryCategory(p));

    let source = uniqLabels([
      canonicalPrimary,
      ...getCanonicalSecondaryCategories(p).map(canonicalPinnedLabel),
      ...getSmartCategories(p).map(canonicalPinnedLabel),
    ]);

    source = source.filter((label) => {
      const key = normalizeTagKey(label);
      if (!key) return false;
      if (key === familyKey) return false;
      if (isUtilityCategory(label)) return false;
      return true;
    });

    return source;
  }

  function getStructuredUtilityCategories(p) {
    const out = [];
    const seen = new Set();
    const add = (label) => {
      const clean = canonicalPinnedLabel(label);
      const key = normalizeTagKey(clean);
      if (!clean || seen.has(key)) return;
      if (!isUtilityCategory(clean)) return;
      seen.add(key);
      out.push(clean);
    };

    const all = uniqLabels([
      ...getCanonicalCategories(p),
      ...getSmartCategories(p),
      ...safeArray(p.badges),
    ]);

    for (const label of all) add(label);

    return out;
  }

  function buildStructuredCategoryModel(list, queryFilteredList) {
    const baseList = Array.isArray(queryFilteredList) ? queryFilteredList.slice() : (list || []).slice();
    const selectedKey = normalizeTagKey(STATE.tag || "");

    const primaryCounts = orderByExplicitList(
      countLabelMap(baseList, (p) => [getStructuredPrimaryCategory(p)], { min: 1 }).filter((item) => isPrimaryCommercialCategory(item.label)),
      CN_PRIMARY_CATEGORY_ORDER
    );

    const selectedPrimary = primaryCounts.find((item) => normalizeTagKey(item.label) === selectedKey);
    const secondaryBase = selectedPrimary
      ? baseList.filter((p) => productMatchesTag(p, selectedPrimary.label))
      : baseList;

    const secondaryMin = selectedPrimary ? 1 : 2;
    const secondaryCounts = orderSecondaryCategories(
      countLabelMap(secondaryBase, getStructuredSecondaryCategories, { min: secondaryMin }).filter((item) => !isPrimaryCommercialCategory(item.label) && !isUtilityCategory(item.label)),
      selectedPrimary ? selectedPrimary.label : ""
    );

    const utilityCounts = orderByExplicitList(
      countLabelMap(secondaryBase, getStructuredUtilityCategories, { min: selectedPrimary ? 1 : 2 }).filter((item) => isUtilityCategory(item.label)),
      CN_UTILITY_CATEGORY_ORDER
    );

    const uniqueTotal = new Set([
      ...primaryCounts.map((item) => normalizeTagKey(item.label)),
      ...secondaryCounts.map((item) => normalizeTagKey(item.label)),
      ...utilityCounts.map((item) => normalizeTagKey(item.label)),
    ]);

    return {
      primaryCounts,
      secondaryCounts,
      utilityCounts,
      selectedPrimary: selectedPrimary ? selectedPrimary.label : "",
      totalCount: uniqueTotal.size,
      baseList: secondaryBase,
    };
  }

  function splitLooseList(value) {
    if (Array.isArray(value)) {
      return value.map(cleanText).filter(Boolean);
    }
    const raw = cleanText(value || "");
    if (!raw) return [];
    return raw
      .split(/\s*[|;,\n]\s*/g)
      .map(cleanText)
      .filter(Boolean);
  }

  function uniqLabels(list) {
    const out = [];
    const seen = new Set();
    for (const item of (list || [])) {
      const clean = cleanText(item);
      const key = normalizeSearchText(clean);
      if (!clean || !key || seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  }

  function getCanonicalPrimaryCategory(p) {
    const raw = p?._raw || {};
    return cleanText(
      p?.categoria_principal ||
      p?.category_primary ||
      p?.primary_category ||
      raw.categoria_principal ||
      raw.category_primary ||
      raw.primary_category ||
      raw.categoria ||
      raw.category ||
      ""
    );
  }

  function getCanonicalSecondaryCategories(p) {
    const raw = p?._raw || {};
    return uniqLabels([
      ...splitLooseList(p?.categorias_secundarias),
      ...splitLooseList(p?.categories_secondary),
      ...splitLooseList(p?.secondary_categories),
      ...splitLooseList(raw.categorias_secundarias),
      ...splitLooseList(raw.categories_secondary),
      ...splitLooseList(raw.secondary_categories),
      ...splitLooseList(raw.categorias),
      ...splitLooseList(raw.categories),
    ]);
  }

  function getSearchAliases(p) {
    const raw = p?._raw || {};
    return uniqLabels([
      ...splitLooseList(p?.aliases_busca),
      ...splitLooseList(p?.search_aliases),
      ...splitLooseList(p?.aliases),
      ...splitLooseList(raw.aliases_busca),
      ...splitLooseList(raw.search_aliases),
      ...splitLooseList(raw.aliases),
    ]);
  }

  function getCanonicalCategories(p) {
    const out = [];
    const seen = new Set();

    const add = (label) => {
      const clean = canonicalPinnedLabel(label);
      const key = normalizeTagKey(clean);
      if (!clean || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    };

    const primary = getCanonicalPrimaryCategory(p);
    if (primary) add(primary);

    for (const cat of getCanonicalSecondaryCategories(p)) add(cat);

    return out;
  }

  function getDisplayCategories(p) {
    return getSmartCategories(p);
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

    const primaryCategory = getCanonicalPrimaryCategory(p);
    const secondaryCategories = getCanonicalSecondaryCategories(p);
    const aliases = getSearchAliases(p);

    const titleNorm = normalizeTagKey(p?.title || "");
    const skuNorm = normalizeTagKey(p?.sku || "");
    const idNorm = normalizeTagKey(p?.id_busca || "");
    const priceNorm = normalizeTagKey(p?.price_text || "");
    const badgesArr = uniqLabels(safeArray(p?.badges).map(cleanText).filter(Boolean)).map((b) => normalizeTagKey(b)).filter(Boolean);
    const aliasesArr = aliases.map((a) => normalizeTagKey(a)).filter(Boolean);
    const canonicalArr = [primaryCategory, ...secondaryCategories]
      .map((c) => canonicalPinnedLabel(c))
      .map((c) => normalizeTagKey(c))
      .filter(Boolean);

    const badgesNorm = badgesArr.join(" ");
    const aliasesNorm = aliasesArr.join(" ");
    const canonicalNorm = canonicalArr.join(" ");
    const rawNorm = [titleNorm, badgesNorm, skuNorm, idNorm, priceNorm, aliasesNorm, canonicalNorm].filter(Boolean).join(" ");

    const idx = {
      titleNorm,
      skuNorm,
      idNorm,
      priceNorm,
      badgesArr,
      aliasesArr,
      canonicalArr,
      badgesNorm,
      aliasesNorm,
      canonicalNorm,
      rawNorm,
      titlePadded: ` ${titleNorm} `,
      badgesPadded: ` ${badgesNorm} `,
      aliasesPadded: ` ${aliasesNorm} `,
      canonicalPadded: ` ${canonicalNorm} `,
      skuPadded: ` ${skuNorm} `,
      rawPadded: ` ${rawNorm} `,
      titleTokens: new Set(tokenizeForIndex(titleNorm)),
      badgeTokens: new Set(tokenizeForIndex(badgesNorm)),
      aliasTokens: new Set(tokenizeForIndex(aliasesNorm)),
      canonicalTokens: new Set(tokenizeForIndex(canonicalNorm)),
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

    for (const cat of getCanonicalCategories(p)) add(cat);

    for (const badge of idx.badgesArr) {
      if (CN_CATEGORY_ALIAS_MAP.has(badge)) add(CN_CATEGORY_ALIAS_MAP.get(badge));
    }

    return out;
  }



  function scoreCategory(rule, idx) {
    let score = 0;

    score += matchPhraseScore(idx.titlePadded, rule.strongPhrases, 10);
    score += matchPhraseScore(idx.badgesPadded, rule.strongPhrases, 12);
    score += matchPhraseScore(idx.aliasesPadded, rule.strongPhrases, 10);
    score += matchPhraseScore(idx.canonicalPadded, rule.strongPhrases, 14);
    score += matchPhraseScore(idx.rawPadded, rule.strongPhrases, 4);

    score += matchPhraseScore(idx.titlePadded, rule.weakPhrases, 5);
    score += matchPhraseScore(idx.badgesPadded, rule.weakPhrases, 7);
    score += matchPhraseScore(idx.aliasesPadded, rule.weakPhrases, 6);
    score += matchPhraseScore(idx.canonicalPadded, rule.weakPhrases, 10);
    score += matchPhraseScore(idx.rawPadded, rule.weakPhrases, 2);

    score += matchTokenScore(idx.titleTokens, rule.strongTokens, 6);
    score += matchTokenScore(idx.badgeTokens, rule.strongTokens, 8);
    score += matchTokenScore(idx.aliasTokens, rule.strongTokens, 7);
    score += matchTokenScore(idx.canonicalTokens, rule.strongTokens, 10);
    score += matchTokenScore(idx.tokens, rule.strongTokens, 2);

    score += matchTokenScore(idx.titleTokens, rule.weakTokens, 2);
    score += matchTokenScore(idx.badgeTokens, rule.weakTokens, 4);
    score += matchTokenScore(idx.aliasTokens, rule.weakTokens, 3);
    score += matchTokenScore(idx.canonicalTokens, rule.weakTokens, 5);
    score += matchTokenScore(idx.tokens, rule.weakTokens, 1);

    score -= matchPhraseScore(idx.rawPadded, rule.negativePhrases, 10);
    score -= matchTokenScore(idx.tokens, rule.negativeTokens, 5);

    return score;
  }



  function getSmartCategories(p) {
    if (Array.isArray(p?._smart_categories) && p._smart_categories.length) return p._smart_categories.slice();

    const idx = buildProductIndex(p);
    const out = [];
    const seen = new Set();
    const debug = [];
    const add = (label, source = "") => {
      const finalLabel = canonicalPinnedLabel(label);
      if (!finalLabel) return;
      const key = normalizeTagKey(finalLabel);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(finalLabel);
      if (source) debug.push({ label: finalLabel, source });
    };

    const canonicalCategories = getCanonicalCategories(p);
    const hasCanonical = canonicalCategories.length > 0;

    for (const cat of canonicalCategories) add(cat, "canonica");

    for (const badgeCat of getExactMappedCategories(p)) {
      if (!canonicalCategories.some((x) => normalizeTagKey(x) === normalizeTagKey(badgeCat))) {
        add(badgeCat, "badge-map");
      }
    }

    if (!hasCanonical) {
      for (const rule of CN_CATEGORY_RULES) {
        const score = scoreCategory(rule, idx);
        if (score >= (rule.minScore || 6)) add(rule.label, `regra:${score}`);
      }
    }

    const aliases = getSearchAliases(p);
    if (!out.length && aliases.length) {
      for (const alias of aliases) {
        const aliasKey = normalizeTagKey(alias);
        if (CN_CATEGORY_ALIAS_MAP.has(aliasKey)) add(CN_CATEGORY_ALIAS_MAP.get(aliasKey), "alias");
      }
    }

    p._smart_categories = out.slice();
    p._smart_categories_debug = debug.slice();
    return out;
  }



  function getSearchScore(p, query) {
    const qNorm = normalizeTagKey(query || "");
    if (!qNorm) return 0;

    const idx = buildProductIndex(p);
    let score = 0;

    if (idx.idNorm && idx.idNorm === qNorm) score += 320;
    if (idx.skuNorm && idx.skuNorm === qNorm) score += 280;
    if (idx.titleNorm && idx.titleNorm === qNorm) score += 240;

    if (hasNormalizedPhrase(idx.titlePadded, qNorm)) score += 110;
    if (hasNormalizedPhrase(idx.aliasesPadded, qNorm)) score += 105;
    if (hasNormalizedPhrase(idx.canonicalPadded, qNorm)) score += 95;
    if (hasNormalizedPhrase(idx.badgesPadded, qNorm)) score += 70;
    if (hasNormalizedPhrase(idx.rawPadded, qNorm)) score += 25;

    const basePhraseScore = score;
    const qTokens = tokenizeForIndex(qNorm, { dropStopwords: true });
    if (!qTokens.length) return score;

    let missing = 0;
    let titleHits = 0;
    let aliasHits = 0;
    let categoryHits = 0;
    let anyHits = 0;

    for (const token of qTokens) {
      let hit = false;
      if (idx.titleTokens.has(token)) {
        score += 18;
        titleHits += 1;
        hit = true;
      }
      if (idx.aliasTokens.has(token)) {
        score += 17;
        aliasHits += 1;
        hit = true;
      }
      if (idx.canonicalTokens.has(token)) {
        score += 16;
        categoryHits += 1;
        hit = true;
      }
      if (idx.badgeTokens.has(token)) {
        score += 12;
        hit = true;
      }
      if (idx.skuTokens.has(token)) {
        score += 18;
        hit = true;
      }
      if (idx.tokens.has(token)) {
        score += 6;
        hit = true;
      }

      if (hit) anyHits += 1;
      else missing += 1;
    }

    if (!anyHits && basePhraseScore <= 0) return -1;

    if (missing === 0) score += 24;
    else score -= (missing * 4);

    if (titleHits === qTokens.length) score += 26;
    if (titleHits >= Math.max(1, qTokens.length - 1)) score += 12;
    if (aliasHits && qTokens.length <= 4) score += 10;
    if (categoryHits && !titleHits) score += 6;

    return score >= 6 ? score : -1;
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


  function firstFilled(values) {
    for (const value of (values || [])) {
      const cleaned = cleanText(value || "");
      if (cleaned) return cleaned;
    }
    return "";
  }

  function looksLikeImageUrl(url) {
    const u = cleanUrl(url);
    if (!u) return false;
    const low = u.toLowerCase();
    if (low.startsWith("data:image/")) return true;
    if (low.includes("github.com/user-attachments/assets/")) return true;
    if (low.includes("raw.githubusercontent.com/")) return true;
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(u);
  }

  function pushProductImage(out, value) {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach((item) => pushProductImage(out, item));
      return;
    }

    if (typeof value === "object") {
      pushProductImage(out, value.url || value.src || value.image || value.image_url || value.href || "");
      return;
    }

    String(value || "")
      .split(/[\n,;|]+/)
      .map((item) => ensureHttpUrl(cleanUrl(item)))
      .filter((item) => item && looksLikeImageUrl(item))
      .forEach((item) => {
        const key = item.toLowerCase();
        if (!out.some((existing) => String(existing || "").toLowerCase() === key)) out.push(item);
      });
  }

  function getProductImagesFromRaw(raw, primaryImage) {
    const out = [];
    pushProductImage(out, primaryImage);
    pushProductImage(out, raw.images);
    pushProductImage(out, raw.imagens);
    pushProductImage(out, raw.gallery);
    pushProductImage(out, raw.galeria);
    pushProductImage(out, raw.gallery_images);
    pushProductImage(out, raw.image_gallery);
    pushProductImage(out, raw.extra_images);
    pushProductImage(out, raw.images_extra);
    pushProductImage(out, raw.additional_images);
    pushProductImage(out, raw.product_images);

    for (let i = 2; i <= 12; i++) {
      pushProductImage(out, raw[`image_${i}`]);
      pushProductImage(out, raw[`imagem_${i}`]);
      pushProductImage(out, raw[`image${i}`]);
      pushProductImage(out, raw[`imagem${i}`]);
    }

    return out;
  }

  function getPromoInfo(p) {
    p = p || {};
    return {
      current: firstFilled([p.price_text, p.current_price_text, p.sale_price_text, p.preco_atual, p.preco, p.price]),
      old: firstFilled([p.old_price_text, p.previous_price_text, p.price_before_text, p.preco_de, p.preco_anterior, p.old_price]),
      discount: firstFilled([p.discount_text, p.desconto_texto, p.desconto, p.sale_badge, p.offer_badge]),
      checked: firstFilled([p.price_checked_at, p.price_checked, p.preco_conferido_em, p.last_price_checked]),
      note: firstFilled([p.promo_text, p.offer_text, p.price_note, p.preco_observacao]),
      buy_cta: firstFilled([p.buy_cta, p.cta_buy_text, p.cta_text]),
    };
  }

  function promoHasContent(p) {
    const promo = getPromoInfo(p);
    return !!(promo.current || promo.old || promo.discount || promo.checked || promo.note);
  }

  function promoHTML(p, compact) {
    const promo = getPromoInfo(p);
    if (!promoHasContent(p)) return "";

    const checked = promo.checked ? `<div class="cnPromoChecked">Preço conferido em ${escapeHTML(promo.checked)}. Pode mudar no Mercado Livre.</div>` : "";
    const note = promo.note ? `<div class="cnPromoText">${escapeHTML(promo.note)}</div>` : "";
    const discount = promo.discount ? `<span class="cnPromoDiscount">${escapeHTML(promo.discount)}</span>` : "";
    const old = promo.old ? `<span class="cnOldPrice">${escapeHTML(promo.old)}</span>` : "";
    const current = promo.current ? `<strong class="cnCurrentPrice">${escapeHTML(promo.current)}</strong>` : "";
    const prices = (current || old) ? `<div class="cnPromoPrices">${current}${old}</div>` : "";

    return `
      <div class="cnPromoBox ${compact ? "cnPromoBox--compact" : ""}">
        <div class="cnPromoLabel"><span>${promo.current ? "Preço em destaque" : "Oferta em destaque"}</span>${discount}</div>
        ${prices}
        ${note}
        ${checked}
      </div>
    `;
  }

  function buyText(p, compact) {
    const promo = getPromoInfo(p);
    // Cards pequenos precisam de CTA curto para não quebrar o layout.
    if (compact) return "Comprar";
    if (promo.buy_cta) return promo.buy_cta;
    if (promo.current || promo.discount) return "Comprar com desconto";
    return "Comprar";
  }

  function preloadProductImages(images) {
    if (!Array.isArray(images) || images.length < 2) return;
    images.forEach((u) => {
      if (!u) return;
      try {
        const im = new Image();
        im.src = u;
      } catch {}
    });
  }

  function ensureProductLightbox() {
    let modal = document.getElementById("cnProductLightbox");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "cnProductLightbox";
    modal.className = "cnProductLightbox";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="cnProductLightbox__backdrop" data-lightbox-close="1"></div>
      <div class="cnProductLightbox__dialog" role="dialog" aria-modal="true" aria-label="Galeria do produto">
        <button class="cnProductLightbox__close" type="button" data-lightbox-close="1" aria-label="Fechar imagem ampliada">×</button>
        <button class="cnProductLightbox__nav cnProductLightbox__nav--prev" type="button" data-lightbox-prev="1" aria-label="Imagem anterior">‹</button>
        <img class="cnProductLightbox__img" alt="Imagem do produto ampliada" />
        <button class="cnProductLightbox__nav cnProductLightbox__nav--next" type="button" data-lightbox-next="1" aria-label="Próxima imagem">›</button>
        <div class="cnProductLightbox__footer">
          <div class="cnProductLightbox__title"></div>
          <div class="cnProductLightbox__counter"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!target) return;
      if (target.getAttribute("data-lightbox-close") === "1") closeProductLightbox();
      if (target.getAttribute("data-lightbox-prev") === "1") moveProductLightbox(-1);
      if (target.getAttribute("data-lightbox-next") === "1") moveProductLightbox(1);
    });

    document.addEventListener("keydown", (ev) => {
      const m = document.getElementById("cnProductLightbox");
      if (!m || !m.classList.contains("is-open")) return;
      if (ev.key === "Escape") closeProductLightbox();
      if (ev.key === "ArrowLeft") moveProductLightbox(-1);
      if (ev.key === "ArrowRight") moveProductLightbox(1);
    });

    return modal;
  }

  function closeProductLightbox() {
    const modal = document.getElementById("cnProductLightbox");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("cnLightboxOpen");
  }

  function updateProductLightboxView() {
    const modal = document.getElementById("cnProductLightbox");
    if (!modal || !Array.isArray(modal._cnImages) || !modal._cnImages.length) return;

    let idx = Number(modal._cnIndex || 0);
    if (!isFinite(idx)) idx = 0;
    idx = Math.max(0, Math.min(idx, modal._cnImages.length - 1));
    modal._cnIndex = idx;

    const img = modal.querySelector(".cnProductLightbox__img");
    const title = modal.querySelector(".cnProductLightbox__title");
    const counter = modal.querySelector(".cnProductLightbox__counter");
    const prev = modal.querySelector(".cnProductLightbox__nav--prev");
    const next = modal.querySelector(".cnProductLightbox__nav--next");

    if (img) img.src = modal._cnImages[idx];
    if (title) title.textContent = modal._cnTitle || "Produto";
    if (counter) counter.textContent = `${idx + 1}/${modal._cnImages.length}`;
    if (prev) prev.classList.toggle("is-hidden", idx <= 0);
    if (next) next.classList.toggle("is-hidden", idx >= modal._cnImages.length - 1);
  }

  function openProductLightbox(images, index, title) {
    if (!Array.isArray(images) || !images.length) return;
    const modal = ensureProductLightbox();
    modal._cnImages = images.slice();
    modal._cnIndex = Math.max(0, Math.min(Number(index) || 0, images.length - 1));
    modal._cnTitle = title || "Produto";
    updateProductLightboxView();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("cnLightboxOpen");
  }

  function moveProductLightbox(delta) {
    const modal = document.getElementById("cnProductLightbox");
    if (!modal || !Array.isArray(modal._cnImages) || !modal._cnImages.length) return;
    const next = Number(modal._cnIndex || 0) + delta;
    if (next < 0 || next >= modal._cnImages.length) return;
    modal._cnIndex = next;
    updateProductLightboxView();
  }

  function productMediaHTML(p, className, extraInner) {
    const images = safeArray(p.images).filter(Boolean);
    const first = images[0] || p.image || "";
    const img = first
      ? `<img data-cnimg="1" src="${escapeHTML(first)}" alt="${escapeHTML(p.title)}" loading="lazy" />`
      : `<div style="color:rgba(255,255,255,.55); font-weight:950; text-align:center; padding:18px;">Sem imagem<br/><span style="color:rgba(224,195,107,.9)">adicione no produto</span></div>`;

    const gallery = images.length > 1;
    const isFeaturedMedia = String(className || "").indexOf("featuredClean") >= 0;
    const mediaVariant = isFeaturedMedia ? " cnProductMedia--featured" : (String(className || "").indexOf("pImg") >= 0 ? " cnProductMedia--quick" : "");
    const encoded = gallery ? escapeHTML(JSON.stringify(images)) : "";
    const zoomUi = (first && isFeaturedMedia) ? `<button class="cnGalleryZoom" type="button" data-action="galleryZoom" aria-label="Ampliar imagem do produto">Ampliar</button>` : "";
    const galleryUi = gallery ? `
      <button class="cnGalleryNav cnGalleryNav--prev is-hidden" type="button" data-action="galleryPrev" aria-label="Imagem anterior">‹</button>
      <button class="cnGalleryNav cnGalleryNav--next" type="button" data-action="galleryNext" aria-label="Próxima imagem">›</button>
      <div class="cnGalleryCounter">1/${images.length}</div>
      <div class="cnGalleryDots">
        ${images.map((_, idx) => `<button class="cnGalleryDot ${idx === 0 ? "is-active" : ""}" type="button" data-action="gallerySet" data-index="${idx}" aria-label="Imagem ${idx + 1} de ${images.length}"></button>`).join("")}
      </div>
    ` : "";

    return `
      <div class="${className} cnProductMedia${mediaVariant} ${gallery ? "cnProductMedia--gallery" : ""}" data-gallery-index="0" data-gallery-title="${escapeHTML(p.title || "Produto")}" data-gallery-images="${encoded}">
        ${extraInner || ""}
        ${img}
        ${galleryUi}
        ${zoomUi}
      </div>
    `;
  }

  function updateGallery(el, mode) {
    const media = el && el.closest ? el.closest(".cnProductMedia") : null;
    if (!media) return false;

    let images = [];
    try { images = JSON.parse(media.getAttribute("data-gallery-images") || "[]"); } catch { images = []; }
    if (!Array.isArray(images) || images.length <= 1) return false;

    preloadProductImages(images);

    let index = Number(media.getAttribute("data-gallery-index") || 0);
    if (!isFinite(index)) index = 0;

    if (mode === "prev") index -= 1;
    else if (mode === "next") index += 1;
    else {
      const direct = Number(el.getAttribute("data-index"));
      if (isFinite(direct)) index = direct;
    }

    if (index < 0 || index >= images.length) return false;
    media.setAttribute("data-gallery-index", String(index));

    const img = media.querySelector("img[data-cnimg]");
    if (img) img.src = images[index];

    const counter = media.querySelector(".cnGalleryCounter");
    if (counter) counter.textContent = `${index + 1}/${images.length}`;

    const prev = media.querySelector(".cnGalleryNav--prev");
    const next = media.querySelector(".cnGalleryNav--next");
    if (prev) prev.classList.toggle("is-hidden", index <= 0);
    if (next) next.classList.toggle("is-hidden", index >= images.length - 1);

    media.querySelectorAll(".cnGalleryDot").forEach((dot, idx) => {
      dot.classList.toggle("is-active", idx === index);
    });

    return true;
  }

  function openGalleryFromMedia(el) {
    const media = el && el.closest ? el.closest(".cnProductMedia") : null;
    if (!media) return false;
    const img = media.querySelector("img[data-cnimg]");
    let images = [];
    try { images = JSON.parse(media.getAttribute("data-gallery-images") || "[]"); } catch { images = []; }
    if (!Array.isArray(images) || !images.length) {
      if (img && img.getAttribute("src")) images = [img.getAttribute("src")];
    }
    if (!images.length) return false;
    const idx = Number(media.getAttribute("data-gallery-index") || 0) || 0;
    openProductLightbox(images, idx, media.getAttribute("data-gallery-title") || "Produto");
    return true;
  }
  function featuredHTML(p, isProdutoDoDia) {
    const disabled = (p.active === false);
    const buyUrl = bestBuyUrl(p);
    const hasLink = isUsableBuyLink(buyUrl);
    const idBusca = String(p.id_busca || "").trim();
    const badges = safeArray(p.badges).slice(0, 7);
    const tags = tagsText(badges);
    const buyBtn = (disabled || !hasLink)
      ? `<button class="btn btn--gold btn--buy-primary" type="button" disabled style="opacity:.55; cursor:not-allowed;">Indisponível</button>`
      : `<a class="btn btn--gold btn--buy-primary" data-role="buy-link" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(buyText(p, false))}</a>`;

    return `
      <article class="cnFeaturedProduct" data-sku="${escapeHTML(p.sku)}">
        <div class="cnFeaturedProduct__media">
          ${productMediaHTML(p, "cnFeaturedProduct__image", isProdutoDoDia ? `<div class="cnFeaturedProduct__badge">⭐ Produto do dia</div>` : ``)}
        </div>
        <div class="cnFeaturedProduct__info">
          <div class="cnFeaturedProduct__kicker">Produto impulsionado de hoje</div>
          <h3 class="cnFeaturedProduct__title">${escapeHTML(p.title)}</h3>
          ${promoHTML(p, false)}
          ${badges.length ? `<p class="cnFeaturedProduct__badges">${escapeHTML(badges.join(" • "))}</p>` : ``}
          ${tags ? `<p class="cnFeaturedProduct__tags">${escapeHTML(tags)}</p>` : ``}
          ${idBusca ? `<div class="cnFeaturedProduct__id">Código de busca: <b>${escapeHTML(idBusca)}</b></div>` : ``}
          <div class="cnFeaturedProduct__actions">
            ${buyBtn}
            ${idBusca ? `<button class="btn btn--tiny btn--glass btn--secondary-soft" type="button" data-action="copyId" data-sku="${escapeHTML(p.sku)}">Copiar ID</button>` : ``}
            <button class="btn btn--tiny btn--glass btn--secondary-soft" type="button" data-action="copyLink" data-sku="${escapeHTML(p.sku)}">Copiar Link</button>
          </div>
        </div>
      </article>
    `;
  }

  function productCardHTML(p) {
    const disabled = (p.active === false);
    const buyUrl = bestBuyUrl(p);
    const hasLink = isUsableBuyLink(buyUrl);
    const idBusca = String(p.id_busca || "").trim();
    const buy = (disabled || !hasLink)
      ? `<button class="smallBtn smallBtnGold btn--buy-primary" type="button" disabled style="opacity:.55; cursor:not-allowed;">Indisponível</button>`
      : `<a class="smallBtn smallBtnGold btn--buy-primary" data-role="buy-link" href="${escapeHTML(buyUrl)}" target="_blank" rel="noopener noreferrer">Comprar</a>`;
    const badges = safeArray(p.badges).slice(0, 2);
    return `
      <article class="cnQuickListCard" data-sku="${escapeHTML(p.sku)}">
        <div class="cnQuickListCard__media">
          ${productMediaHTML(p, "cnQuickListCard__img", p.featured ? `<div class="pFeatured">⭐ do dia</div>` : ``)}
        </div>
        <div class="cnQuickListCard__body">
          <h3 class="cnQuickListCard__title">${escapeHTML(p.title)}</h3>
          ${badges.length ? `<div class="cnQuickListCard__badges">${badges.map((b) => `<span>${escapeHTML(b)}</span>`).join("")}</div>` : ``}
          ${idBusca ? `<div class="cnQuickListCard__code">Código <b>${escapeHTML(idBusca)}</b></div>` : ``}
          <div class="cnQuickListCard__actions">
            ${buy}
            ${idBusca ? `<button class="smallBtn btn--secondary-soft" type="button" data-action="copyId" data-sku="${escapeHTML(p.sku)}">Copiar ID</button>` : ``}
          </div>
        </div>
      </article>
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
      for (const cat of getDisplayCategories(p)) {
        const raw = String(cat || "").trim();
        if (!raw) continue;
        const k = normalizeTagKey(raw);
        const prev = counts.get(k);
        counts.set(k, { label: canonicalPinnedLabel(raw), n: ((prev && prev.n) ? prev.n : 0) + 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => {
      if (b.n !== a.n) return b.n - a.n;
      return String(a.label).localeCompare(String(b.label), "pt-BR");
    });
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
        out.push({ label: canonicalPinnedLabel(pin), n: it.n });
        map.delete(k);
      }
    }

    const rest = Array.from(map.values()).sort((a, b) => {
      const aEditorial = isEditorialCategory(a.label) ? 1 : 0;
      const bEditorial = isEditorialCategory(b.label) ? 1 : 0;
      if (aEditorial !== bEditorial) return aEditorial - bEditorial;

      const boostDiff = getCategoryPriorityBoost(b.label) - getCategoryPriorityBoost(a.label);
      if (boostDiff !== 0) return boostDiff;

      if (b.n !== a.n) return b.n - a.n;
      return String(a.label).localeCompare(String(b.label), "pt-BR");
    });
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

        const pa = getCanonicalPrimaryCategory(a);
        const pb = getCanonicalPrimaryCategory(b);
        if (!!pa !== !!pb) return pa ? -1 : 1;

        const fa = a.featured ? 0 : 1;
        const fb = b.featured ? 0 : 1;
        if (fa !== fb) return fa - fb;

        return String(a.title).localeCompare(String(b.title), "pt-BR");
      });
      return arr;
    }

    arr.sort((a, b) => {
      const pa = getCanonicalPrimaryCategory(a);
      const pb = getCanonicalPrimaryCategory(b);
      if (!!pa !== !!pb) return pa ? -1 : 1;

      const fa = a.featured ? 0 : 1;
      const fb = b.featured ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return String(a.title).localeCompare(String(b.title), "pt-BR");
    });
    return arr;
  }



  function matchesFilter(p) {
    const q = cleanText(STATE.query || "");
    const tag = normalizeTagKey(STATE.tag || "");

    const labels = uniqLabels([
      getStructuredPrimaryCategory(p),
      ...getStructuredSecondaryCategories(p),
      ...getStructuredUtilityCategories(p),
      ...getDisplayCategories(p),
      ...safeArray(p.badges),
    ]);

    const hasTag = !tag || labels.some((b) => normalizeTagKey(b) === tag);

    if (!q) return hasTag;

    const score = getSearchScore(p, q);
    if (score < 0) return false;

    if (tag && !hasTag) return false;
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

    const data = STATE._structuredCategories || { primaryCounts: [], secondaryCounts: [], utilityCounts: [] };
    const q = normalizeTagKey((document.getElementById("cnTagSearch") || {}).value || "");
    const activeKey = normalizeTagKey(STATE.tag || "");

    const groups = [
      { title: "Categorias principais", items: data.primaryCounts || [] },
      { title: "Refinar categoria", items: data.secondaryCounts || [] },
      { title: "Atributos rápidos", items: data.utilityCounts || [] },
    ];

    const html = [];
    html.push(`
      <div class="cnModal__group">
        <div class="cnModal__groupTitle">Tudo</div>
        <button type="button" class="${!activeKey ? "active" : ""}" data-tag="">
          👑 Tudo <span style="opacity:.75;">(${STATE._activeCount || 0})</span>
        </button>
      </div>
    `);

    for (const group of groups) {
      const items = (group.items || []).filter((item) => !q || normalizeTagKey(item.label).includes(q));
      if (!items.length) continue;
      html.push(`<div class="cnModal__group"><div class="cnModal__groupTitle">${escapeHTML(group.title)}</div>`);
      for (const item of items) {
        const key = normalizeTagKey(item.label);
        const isActive = (activeKey === key);
        html.push(`
          <button type="button" class="${isActive ? "active" : ""}" data-tag="${escapeHTML(key)}">
            ${escapeHTML(item.label)} <span style="opacity:.75;">(${item.n})</span>
          </button>
        `);
      }
      html.push(`</div>`);
    }

    listEl.innerHTML = html.join("");

    listEl.onclick = (ev) => {
      const btn = ev.target.closest("button[data-tag]");
      if (!btn) return;

      const tag = String(btn.getAttribute("data-tag") || "").trim();
      STATE.tag = (normalizeTagKey(STATE.tag || "") === tag) ? "" : tag;
      STATE.limit = PAGE_SIZE;
      closeTagModal();
      render();
    };
  }

  function renderStructuredChipGroup(targetEl, items, options = {}) {
    if (!targetEl) return;
    const list = Array.isArray(items) ? items.slice() : [];
    const activeKey = normalizeTagKey(STATE.tag || "");
    const withAll = !!options.withAll;
    const allLabel = cleanText(options.allLabel || "Tudo") || "Tudo";
    const allCount = Number(options.allCount || STATE._activeCount || 0);
    const allowOpenModal = !!options.allowOpenModal;

    const html = [];
    if (withAll) {
      html.push(`
        <button class="tagChip ${!activeKey ? "tagChip--active" : ""}" type="button" data-tag="">
          👑 ${escapeHTML(allLabel)}${allCount ? ` <span style="opacity:.75;">(${allCount})</span>` : ""}
        </button>
      `);
    }

    for (const item of list) {
      const key = normalizeTagKey(item.label);
      const isActive = activeKey === key;
      html.push(`
        <button class="tagChip ${isActive ? "tagChip--active" : ""}" type="button" data-tag="${escapeHTML(key)}">
          ${escapeHTML(item.label)}${item.n ? ` <span style="opacity:.75;">(${item.n})</span>` : ""}
        </button>
      `);
    }

    if (allowOpenModal && Number(STATE._structuredTotalCount || 0) > list.length) {
      html.push(`
        <button class="tagChip" type="button" data-action="openTags">
          🔎 Ver todas (${Number(STATE._structuredTotalCount || 0)})
        </button>
      `);
    }

    targetEl.innerHTML = html.join("");
  }

  function renderTagChips(activeList) {
    const primaryBox = document.getElementById("tagPrimaryChips");
    const secondaryBox = document.getElementById("tagSecondaryChips");
    const utilityBox = document.getElementById("tagUtilityChips");
    const totalTagsEl = document.getElementById("tagsCount");
    const primarySection = document.getElementById("chipSectionPrimary");
    const secondarySection = document.getElementById("chipSectionSecondary");
    const utilitySection = document.getElementById("chipSectionUtility");
    const secondaryLabel = document.getElementById("chipSectionSecondaryLabel");

    const queryOnlyList = (activeList || []).filter((p) => {
      const q = cleanText(STATE.query || "");
      if (!q) return true;
      return getSearchScore(p, q) >= 0;
    });

    const structured = buildStructuredCategoryModel(activeList || [], queryOnlyList);
    STATE._structuredCategories = structured;
    STATE._structuredTotalCount = Number(structured.totalCount || 0);
    STATE._categoryCounts = [
      ...(structured.primaryCounts || []),
      ...(structured.secondaryCounts || []),
      ...(structured.utilityCounts || []),
    ];
    STATE._activeCount = (activeList || []).length;

    if (totalTagsEl) {
      const total = Number(structured.totalCount || 0);
      totalTagsEl.textContent = total > 0 ? String(total) : "0";
    }

    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const primaryMax = isMobile ? 8 : 12;
    const secondaryMax = isMobile ? CN_SUBCATEGORY_MAX_MOBILE : CN_SUBCATEGORY_MAX_DESKTOP;
    const utilityMax = isMobile ? CN_UTILITY_MAX_MOBILE : CN_UTILITY_MAX_DESKTOP;

    const primaryItems = (structured.primaryCounts || []).slice(0, primaryMax);
    const secondaryItems = (structured.secondaryCounts || []).slice(0, secondaryMax);
    const utilityItems = (structured.utilityCounts || []).slice(0, utilityMax);

    renderStructuredChipGroup(primaryBox, primaryItems, {
      withAll: true,
      allLabel: "Tudo",
      allCount: STATE._activeCount,
      allowOpenModal: Number(structured.totalCount || 0) > (primaryItems.length + secondaryItems.length + utilityItems.length),
    });
    renderStructuredChipGroup(secondaryBox, secondaryItems, { withAll: false });
    renderStructuredChipGroup(utilityBox, utilityItems, { withAll: false });

    if (primarySection) primarySection.style.display = (primaryItems.length || !normalizeTagKey(STATE.tag || "")) ? "block" : "none";
    if (secondarySection) secondarySection.style.display = secondaryItems.length ? "block" : "none";
    if (utilitySection) utilitySection.style.display = utilityItems.length ? "block" : "none";

    if (secondaryLabel) {
      secondaryLabel.textContent = structured.selectedPrimary
        ? `Refinar ${structured.selectedPrimary}`
        : "Refinar por subcategoria";
    }
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

    if (destaque && destaque.sku) {
      list = list.filter((p) => p.sku !== destaque.sku);
    }

    if (featuredPass && SHOW_FEATURED_IN_GRID) {
      list = [featuredPass, ...list.filter((p) => p.sku !== featuredPass.sku)];
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


  function normalizeProducts(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.products)) return data.products;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  function adaptForUI(raw) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw;
    const links = pickBestLink(r);
    const sku = cleanText(r.sku || r.id || r.slug || r.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const title = cleanText(r.title || r.name || r.issue_title || sku || "Produto");
    const image = ensureHttpUrl(cleanText(r.image || r.image_url || r.img || r.cover || ""));
    const badges = [];
    [r.badges, r.tags, r.categorias_secundarias, r.categoria_principal].forEach((v) => {
      if (Array.isArray(v)) v.forEach((x) => { x = cleanText(x); if (x && !badges.some((b) => normalizeTagKey(b) === normalizeTagKey(x))) badges.push(x); });
      else if (v) String(v).split(/[,;|]+/).forEach((x) => { x = cleanText(x); if (x && !badges.some((b) => normalizeTagKey(b) === normalizeTagKey(x))) badges.push(x); });
    });
    const out = {
      _raw: r,
      sku,
      title,
      badges,
      id_busca: cleanText(r.id_busca || r.ml_id || r.id_ml || r.mercadolivre_id || ""),
      image,
      images: getProductImagesFromRaw(r, image),
      open_url: ensureHttpUrl(r.open_url || links.open || links.primary || ""),
      check_url: ensureHttpUrl(r.check_url || links.check || ""),
      canonical_url: ensureHttpUrl(r.canonical_url || links.canonical || ""),
      short_url: ensureHttpUrl(r.short_url || links.shorty || ""),
      resolved_url: ensureHttpUrl(r.resolved_url || links.resolved || ""),
      alt_url: ensureHttpUrl(r.alt_url || links.alt || ""),
      buy_url: ensureHttpUrl(r.buy_url || links.primary || ""),
      active: r.active !== false,
      featured: r.featured === true || r.is_featured === true,
      quick_home: r.quick_home === true,
      last_checked: r.last_checked || "",
      last_ok: r.last_ok || "",
      price_text: r.price_text || r.current_price_text || r.preco_atual || r.preco || r.price || "",
      old_price_text: r.old_price_text || r.previous_price_text || r.preco_de || r.preco_anterior || r.old_price || "",
      discount_text: r.discount_text || r.desconto || r.sale_badge || r.offer_badge || "",
      price_checked_at: r.price_checked_at || r.price_checked || r.preco_conferido_em || "",
      promo_text: r.promo_text || r.offer_text || r.price_note || r.preco_observacao || "",
      buy_cta: r.buy_cta || r.cta_buy_text || r.cta_text || "",
    };
    if (!out.images.length && out.image) out.images = [out.image];
    return out.sku && out.title ? out : null;
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

  function safeMetricNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatDateTimeFullBR(value) {
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
    } catch {
      return "";
    }
  }

  function reportFileStampBR(value) {
    const d = value instanceof Date ? value : new Date(value || Date.now());
    return `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()}_${two(d.getHours())}${two(d.getMinutes())}`;
  }

  function buildLocalRangeToday() {
    const end = new Date();
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  function buildLocalRangeLastDays(days) {
    const total = Math.max(1, Number(days) || 1);
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (total - 1));
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  function pickTopMetric() {
    for (const list of arguments) {
      if (Array.isArray(list) && list.length) return list[0];
    }
    return null;
  }

  function smartMetricLine(label, item, extras) {
    if (!item) return `- ${label}: sem dados suficientes`;

    const bits = [];
    const metricLabel = cleanText(item.label || item.key || "sem dados") || "sem dados";
    bits.push(metricLabel);

    const buy = safeMetricNumber(item.buy_count);
    const intention = safeMetricNumber(item.intention_score);
    const count = safeMetricNumber(item.count);
    const copyLink = safeMetricNumber(item.copy_link_count);
    const copyId = safeMetricNumber(item.copy_id_count);
    const openStore = safeMetricNumber(item.open_store_count);

    if (buy > 0) bits.push(`comprar=${buy}`);
    if (intention > 0) bits.push(`intenção=${intention}`);
    if (count > 0) bits.push(`eventos=${count}`);
    if (copyLink > 0) bits.push(`copiar_link=${copyLink}`);
    if (copyId > 0) bits.push(`copiar_id=${copyId}`);
    if (openStore > 0) bits.push(`abrir_loja=${openStore}`);

    const extraArr = Array.isArray(extras) ? extras : [];
    extraArr.forEach((part) => {
      const txt = cleanText(part || "");
      if (txt) bits.push(txt);
    });

    return `- ${label}: ${bits.join(" | ")}`;
  }

  function buildExecutiveReportSection(sectionTitle, summary, range) {
    const s = summary || {};
    const answers = s.answers_before_first_sale || {};
    const funnel = s.funnel || {};
    const totals = s.totals || {};
    const lines = [];

    const topNetwork = pickTopMetric(
      answers.top_networks_by_click_buy,
      answers.top_networks_by_intention
    );
    const topCreative = pickTopMetric(answers.top_creatives_by_click_buy);
    const topTitle = pickTopMetric(answers.top_titles_by_click_buy);
    const topProduct = pickTopMetric(
      answers.top_products_by_click_buy,
      answers.top_products_by_intention
    );
    const topCategory = pickTopMetric(
      answers.top_categories_by_click_buy,
      answers.top_categories_by_intention
    );
    const topFormat = pickTopMetric(answers.top_formats_by_intention);
    const topPlacement = pickTopMetric(answers.top_placements_by_intention);

    lines.push(sectionTitle);
    lines.push(`Período: ${formatDateTimeFullBR(range.start)} até ${formatDateTimeFullBR(range.end)}`);
    lines.push(`Eventos filtrados: ${safeMetricNumber(totals.filtered_events)}`);
    lines.push(`Views de produto: ${safeMetricNumber(funnel.view_product_card)}`);
    lines.push(`Cliques comprar: ${safeMetricNumber(funnel.click_buy)}`);
    lines.push(`Cliques copiar ID: ${safeMetricNumber(funnel.click_copy_id)}`);
    lines.push(`Cliques copiar link: ${safeMetricNumber(funnel.click_copy_link)}`);
    lines.push(`Cliques abrir loja: ${safeMetricNumber(funnel.click_open_store)}`);
    lines.push("");

    lines.push("Leituras executivas:");
    lines.push(smartMetricLine("Rede que mais gera clique/intenção", topNetwork));
    lines.push(smartMetricLine("Criativo que mais puxa ação", topCreative, [
      topCreative?.network ? `rede=${topCreative.network}` : "",
      topCreative?.format ? `formato=${topCreative.format}` : "",
    ]));
    lines.push(smartMetricLine("Título que mais desperta curiosidade", topTitle, [
      topTitle?.creative_id ? `criativo=${topTitle.creative_id}` : "",
    ]));
    lines.push(smartMetricLine("Produto que mais leva à ação", topProduct, [
      topProduct?.sku ? `sku=${topProduct.sku}` : "",
      topProduct?.category ? `categoria=${topProduct.category}` : "",
    ]));
    lines.push(smartMetricLine("Categoria com mais resposta", topCategory));
    lines.push(smartMetricLine("Formato com mais intenção", topFormat, [
      topFormat?.network ? `rede=${topFormat.network}` : "",
    ]));
    lines.push(smartMetricLine("Placement com mais intenção", topPlacement, [
      topPlacement?.network ? `rede=${topPlacement.network}` : "",
      topPlacement?.format ? `formato=${topPlacement.format}` : "",
    ]));
    lines.push("");

    return lines;
  }

  function doExportSmartReport() {
    try {
      const tracking = window.CNTracking;
      if (!tracking || typeof tracking.getSummary !== "function") {
        showToast("Tracking indisponível nesta página");
        return;
      }

      const now = new Date();
      const todayRange = buildLocalRangeToday();
      const weekRange = buildLocalRangeLastDays(7);

      const todaySummary = tracking.getSummary({
        start_at: todayRange.start.toISOString(),
        end_at: todayRange.end.toISOString(),
      });

      const weekSummary = tracking.getSummary({
        start_at: weekRange.start.toISOString(),
        end_at: weekRange.end.toISOString(),
      });

      const lines = [];
      lines.push("RELATÓRIO INTELIGENTE — CLIQUES ANTES DA VENDA");
      lines.push("Loja: La_Famiglia_Links / Achados do Dia");
      lines.push(`Gerado em: ${formatDateTimeFullBR(now)}`);
      lines.push(`Updated_at da vitrine: ${cleanText(STATE.updated_at || "") || "n/d"}`);
      lines.push(`Ativos atuais na loja: ${safeMetricNumber(STATE._activeCount)}`);
      lines.push(`Categorias rastreadas: ${safeArray(STATE._categoryCounts).length}`);
      lines.push("");
      lines.push("Objetivo:");
      lines.push("- medir clique antes de medir venda");
      lines.push("- descobrir qual rede gera mais clique");
      lines.push("- descobrir qual criativo gera mais toque");
      lines.push("- descobrir qual título puxa mais curiosidade");
      lines.push("- descobrir qual produto leva a pessoa do conteúdo para a loja");
      lines.push("");

      lines.push(...buildExecutiveReportSection("HOJE", todaySummary, todayRange));
      lines.push(...buildExecutiveReportSection("ÚLTIMOS 7 DIAS", weekSummary, weekRange));

      const fname = `relatorio_inteligente_${reportFileStampBR(now)}.txt`;
      downloadFile(fname, lines.join("\n").trim() + "\n", "text/plain;charset=utf-8");
      showToast("Relatório inteligente ⬇️");
    } catch (err) {
      console.error(err);
      showToast("Erro ao gerar relatório");
    }
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
        if (safeArray(p.images).length > 1) r.images = safeArray(p.images).slice(1);
        r.price_text = p.price_text || "";
        r.old_price_text = p.old_price_text || "";
        r.discount_text = p.discount_text || "";
        r.price_checked_at = p.price_checked_at || "";
        r.promo_text = p.promo_text || "";
        r.buy_cta = p.buy_cta || "";

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



  function scrollToTarget(target, focusEl) {
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      target.scrollIntoView(true);
    }

    if (focusEl) {
      setTimeout(() => {
        try { focusEl.focus({ preventScroll: true }); } catch { try { focusEl.focus(); } catch {} }
      }, 260);
    }
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

    const dockTop = $("#dockTop");
    const dockSearch = $("#dockSearch");
    const dockCategories = $("#dockCategories");
    const dockFeatured = $("#dockFeatured");

    const secTop = $("#sec-topo");
    const secNav = $("#sec-navegacao-comercial");
    const secFeatured = $("#sec-produto-do-dia");
    const categoriesAnchor = $("#chipSectionPrimary");

    if (q) {
      q.value = STATE.query || "";
      q.addEventListener("input", (e) => {
        STATE.query = String(e.target.value || "");
        STATE.limit = PAGE_SIZE;
        render();
      });
    }

    if (dockTop) {
      dockTop.addEventListener("click", () => {
        scrollToTarget(secTop || document.body);
      });
    }

    if (dockSearch) {
      dockSearch.addEventListener("click", () => {
        scrollToTarget(secNav || q || document.body, q || null);
      });
    }

    if (dockCategories) {
      dockCategories.addEventListener("click", () => {
        scrollToTarget(categoriesAnchor || secNav || document.body);
      });
    }

    if (dockFeatured) {
      dockFeatured.addEventListener("click", () => {
        scrollToTarget(secFeatured || document.body);
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

    if (copyBtn && copyPageBtn) {
      copyPageBtn.style.display = "none";
      copyPageBtn.setAttribute("aria-hidden", "true");
      copyPageBtn.setAttribute("tabindex", "-1");
    } else if (copyPageBtn) {
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
              <span>🧠 Inteligência & relatórios</span>
              <span style="opacity:.75;">${isMobile ? "abrir" : "ok"}</span>
            </span>
          </summary>

          <div class="cnToolsGrid">
            <button class="btn btn--tiny btn--gold"  type="button" id="btnSmartReport">📄 Relatório inteligente</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnCopyList">📋 Copiar (ativos)</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlCsvAll">📊 CSV bruto</button>
            <button class="btn btn--tiny btn--glass" type="button" id="btnDlReview">🛠️ TXT manutenção</button>
          </div>
        </details>
      `;
      tools.appendChild(row);
    })();

    const btnSmartReport = $("#btnSmartReport");
    const btnCopyList = $("#btnCopyList");
    const btnDlCsvAll = $("#btnDlCsvAll");
    const btnDlReview = $("#btnDlReview");

    if (btnSmartReport) btnSmartReport.addEventListener("click", () => doExportSmartReport());
    if (btnCopyList) btnCopyList.addEventListener("click", () => doCopyTxt("active"));
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
        STATE.tag = (normalizeTagKey(STATE.tag || "") === t) ? "" : t;
        STATE.limit = PAGE_SIZE;
        render();
        return;
      }

      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.getAttribute("data-action");

      if (action === "galleryPrev" || action === "galleryNext" || action === "gallerySet" || action === "galleryZoom") {
        e.preventDefault();
        e.stopPropagation();
        if (action === "galleryPrev") updateGallery(el, "prev");
        else if (action === "galleryNext") updateGallery(el, "next");
        else if (action === "gallerySet") updateGallery(el, "set");
        else openGalleryFromMedia(el);
        return;
      }

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
