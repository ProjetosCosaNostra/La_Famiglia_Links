/* ==========================================================
   Arquivo: tracking.js
   Objetivo:
     - Camada base de medição para La_Famiglia_Links / Achados do Dia
     - Modo local-first: funciona sem backend obrigatório
     - Captura contexto UTM + session_id + visitor_id
     - Persiste eventos em localStorage
     - Já deixa pronto para coletor externo no futuro

   Fase atual:
     - Base compartilhada para home (index.html) e loja (loja.html)
     - Sem quebrar a vitrine atual
     - Preparado para export JSON / CSV
   ========================================================== */

(() => {
  "use strict";

  const STORAGE_EVENTS_KEY = "cn_tracking_events_v1";
  const STORAGE_VISITOR_KEY = "cn_tracking_visitor_id_v1";
  const STORAGE_CONTEXT_KEY = "cn_tracking_context_v1";
  const SESSION_ID_KEY = "cn_tracking_session_id_v1";

  const MAX_EVENTS = 5000;

  const DEFAULT_CONFIG = {
    pageType: "",
    autoPageView: false,
    endpoint: "",
    debug: false,
  };

  let CONFIG = { ...DEFAULT_CONFIG };

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function safeGetLocalStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return raw;
    } catch {
      return fallback;
    }
  }

  function safeSetLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeGetSessionStorage(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw == null) return fallback;
      return raw;
    } catch {
      return fallback;
    }
  }

  function safeSetSessionStorage(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeRemoveLocalStorage(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function safeRemoveSessionStorage(key) {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function uid(prefix) {
    const p = String(prefix || "cn");
    const rnd = Math.random().toString(36).slice(2, 10);
    const ts = Date.now().toString(36);
    return `${p}_${ts}_${rnd}`;
  }

  function normalizeText(v) {
    return String(v ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => normalizeText(x)).filter(Boolean);
  }

  function inferPageType() {
    const path = String(location.pathname || "").toLowerCase();

    if (path.includes("loja.html")) return "loja";
    if (path.endsWith("/la_famiglia_links/") || path.endsWith("/la_famiglia_links/index.html")) return "home";

    return "unknown";
  }

  function getDeviceType() {
    const ua = String(navigator.userAgent || "").toLowerCase();
    const w = Math.max(window.innerWidth || 0, screen.width || 0);

    if (/ipad|tablet/.test(ua)) return "tablet";
    if (/mobi|android|iphone|ipod/.test(ua)) return "mobile";
    if (w > 0 && w <= 720) return "mobile";
    if (w > 720 && w <= 1024) return "tablet";
    return "desktop";
  }

  function getVisitorId() {
    let id = safeGetLocalStorage(STORAGE_VISITOR_KEY, "");

    if (!id) {
      id = uid("visitor");
      safeSetLocalStorage(STORAGE_VISITOR_KEY, id);
    }

    return id;
  }

  function getSessionId() {
    let id = safeGetSessionStorage(SESSION_ID_KEY, "");

    if (!id) {
      id = uid("session");
      safeSetSessionStorage(SESSION_ID_KEY, id);
    }

    return id;
  }

  function createNewSessionId() {
    const id = uid("session");
    safeSetSessionStorage(SESSION_ID_KEY, id);
    return id;
  }

  function getStoredContext() {
    return safeJsonParse(safeGetLocalStorage(STORAGE_CONTEXT_KEY, "{}"), {});
  }

  function clearStoredContext() {
    safeRemoveLocalStorage(STORAGE_CONTEXT_KEY);
    return true;
  }

  function getReferrer() {
    return normalizeText(document.referrer || "");
  }

  function readUrlParams() {
    try {
      const url = new URL(location.href);

      return {
        utm_source: normalizeText(url.searchParams.get("utm_source") || ""),
        utm_medium: normalizeText(url.searchParams.get("utm_medium") || ""),
        utm_campaign: normalizeText(url.searchParams.get("utm_campaign") || ""),
        utm_content: normalizeText(url.searchParams.get("utm_content") || ""),
        utm_term: normalizeText(url.searchParams.get("utm_term") || ""),
        network: normalizeText(url.searchParams.get("network") || ""),
        format: normalizeText(url.searchParams.get("format") || ""),
        placement: normalizeText(url.searchParams.get("placement") || ""),
        creative_id: normalizeText(url.searchParams.get("creative_id") || ""),
        title_id: normalizeText(url.searchParams.get("title_id") || ""),
      };
    } catch {
      return {
        utm_source: "",
        utm_medium: "",
        utm_campaign: "",
        utm_content: "",
        utm_term: "",
        network: "",
        format: "",
        placement: "",
        creative_id: "",
        title_id: "",
      };
    }
  }

  function parseUtmContent(raw) {
    const text = normalizeText(raw || "");
    if (!text) {
      return {
        creative_id: "",
        title_id: "",
      };
    }

    let creativeId = "";
    let titleId = "";

    const creativeMatch = text.match(/creative[_\-:]([a-z0-9_\-]+)/i);
    const titleMatch = text.match(/title[_\-:]([a-z0-9_\-]+)/i);

    if (creativeMatch) creativeId = normalizeText(creativeMatch[1]);
    if (titleMatch) titleId = normalizeText(titleMatch[1]);

    return {
      creative_id: creativeId,
      title_id: titleId,
    };
  }

  function buildContext() {
    const stored = safeJsonParse(safeGetLocalStorage(STORAGE_CONTEXT_KEY, "{}"), {});
    const current = readUrlParams();
    const parsedContent = parseUtmContent(current.utm_content);

    const merged = {
      utm_source: current.utm_source || stored.utm_source || "",
      utm_medium: current.utm_medium || stored.utm_medium || "",
      utm_campaign: current.utm_campaign || stored.utm_campaign || "",
      utm_content: current.utm_content || stored.utm_content || "",
      utm_term: current.utm_term || stored.utm_term || "",
      network: current.network || current.utm_source || stored.network || stored.utm_source || "",
      format: current.format || current.utm_medium || stored.format || stored.utm_medium || "",
      placement: current.placement || stored.placement || "",
      creative_id: current.creative_id || parsedContent.creative_id || stored.creative_id || "",
      title_id: current.title_id || parsedContent.title_id || stored.title_id || "",
      first_seen_at: stored.first_seen_at || nowIso(),
      last_seen_at: nowIso(),
    };

    safeSetLocalStorage(STORAGE_CONTEXT_KEY, JSON.stringify(merged));
    return merged;
  }

  function sanitizeProductMeta(meta) {
    const input = meta || {};

    return {
      sku: normalizeText(input.sku || ""),
      product_title: normalizeText(input.product_title || input.title || ""),
      id_busca: normalizeText(input.id_busca || ""),
      badges: normalizeArray(input.badges || []),
      featured: input.featured === true,
      category: normalizeText(input.category || ""),
      network: normalizeText(input.network || ""),
      format: normalizeText(input.format || ""),
      placement: normalizeText(input.placement || ""),
      creative_id: normalizeText(input.creative_id || ""),
      title_id: normalizeText(input.title_id || ""),
      position_on_page: Number.isFinite(Number(input.position_on_page)) ? Number(input.position_on_page) : null,
    };
  }

  function getEvents() {
    return safeJsonParse(safeGetLocalStorage(STORAGE_EVENTS_KEY, "[]"), []);
  }

  function saveEvents(events) {
    safeSetLocalStorage(STORAGE_EVENTS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  }

  function logDebug(...args) {
    if (!CONFIG.debug) return;
    console.log("[CNTracking]", ...args);
  }

  function pushEvent(eventName, meta) {
    const context = buildContext();
    const product = sanitizeProductMeta(meta);

    const event = {
      id: uid("evt"),
      event_name: normalizeText(eventName || "unknown_event"),
      timestamp: nowIso(),

      page_type: normalizeText(meta?.page_type || CONFIG.pageType || inferPageType()),
      session_id: getSessionId(),
      visitor_id: getVisitorId(),

      url: String(location.href || ""),
      path: String(location.pathname || ""),
      referrer: getReferrer(),
      device_type: getDeviceType(),

      utm_source: context.utm_source || "",
      utm_medium: context.utm_medium || "",
      utm_campaign: context.utm_campaign || "",
      utm_content: context.utm_content || "",
      utm_term: context.utm_term || "",

      network: product.network || context.network || "",
      format: product.format || context.format || "",
      placement: product.placement || context.placement || "",
      creative_id: product.creative_id || context.creative_id || "",
      title_id: product.title_id || context.title_id || "",

      sku: product.sku || "",
      product_title: product.product_title || "",
      id_busca: product.id_busca || "",
      badges: product.badges || [],
      featured: product.featured === true,
      category: product.category || "",
      position_on_page: product.position_on_page,

      extra: (() => {
        const extra = { ...(meta || {}) };

        delete extra.page_type;
        delete extra.sku;
        delete extra.product_title;
        delete extra.title;
        delete extra.id_busca;
        delete extra.badges;
        delete extra.featured;
        delete extra.category;
        delete extra.network;
        delete extra.format;
        delete extra.placement;
        delete extra.creative_id;
        delete extra.title_id;
        delete extra.position_on_page;

        return extra;
      })(),
    };

    const events = getEvents();
    events.push(event);
    saveEvents(events);

    sendToEndpoint(event);
    logDebug("event", event);

    return event;
  }

  function sendToEndpoint(event) {
    const endpoint = normalizeText(CONFIG.endpoint || "");
    if (!endpoint) return false;

    const payload = JSON.stringify({
      sent_at: nowIso(),
      source: "La_Famiglia_Links",
      event,
    });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        return navigator.sendBeacon(endpoint, blob);
      }
    } catch {}

    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function jsonDownload(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = filename || "tracking_events.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }, 1500);
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }

  function textDownload(filename, content) {
    const blob = new Blob([String(content ?? "")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = filename || "tracking_summary.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }, 1500);
  }

  function safeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  }


  function pad2(value) {
    const n = Math.trunc(safeNumber(value, 0));
    return String(n).padStart(2, "0");
  }

  function formatDateHuman(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    if (Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  }

  function formatDateTimeHuman(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    if (Number.isNaN(d.getTime())) return "";
    return `${formatDateHuman(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function formatDateFile(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function startOfLocalDay(dateInput) {
    const d = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput || Date.now());
    if (Number.isNaN(d.getTime())) return new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(dateInput, days) {
    const d = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput || Date.now());
    if (Number.isNaN(d.getTime())) return new Date();
    d.setDate(d.getDate() + Math.trunc(safeNumber(days, 0)));
    return d;
  }

  function getIsoWeekInfo(dateInput) {
    const d = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput || Date.now());
    if (Number.isNaN(d.getTime())) {
      return { year: new Date().getFullYear(), week: 1, label: `${new Date().getFullYear()}-W01` };
    }

    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);

    return {
      year: utc.getUTCFullYear(),
      week,
      label: `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
    };
  }

  function resolvePresetRange(preset) {
    const now = new Date();
    if (preset === "today") {
      return {
        start_at: startOfLocalDay(now).toISOString(),
        end_at: now.toISOString(),
        label: `Hoje (${formatDateHuman(now)})`,
      };
    }

    if (preset === "last7days" || preset === "weekly") {
      const start = startOfLocalDay(addDays(now, -6));
      const weekInfo = getIsoWeekInfo(now);
      return {
        start_at: start.toISOString(),
        end_at: now.toISOString(),
        label: `Últimos 7 dias (${formatDateHuman(start)} até ${formatDateHuman(now)})`,
        week_label: weekInfo.label,
      };
    }

    return {
      start_at: "",
      end_at: "",
      label: "",
    };
  }

  const UNKNOWN_LIKE_VALUES = new Set([
    "", "unknown", "sem dados", "sem_dados", "n/a", "na", "null", "undefined", "none",
    "not set", "not_set", "sem categoria", "sem_categoria", "sem rede", "sem_rede",
    "sem formato", "sem_formato", "sem placement", "sem_placement", "sem criativo",
    "sem_criativo", "sem título", "sem_titulo", "sem_título", "sem produto", "sem_produto"
  ]);

  const GENERIC_RANKING_VALUES = new Set([
    "unknown", "sem dados", "sem_dados", "criativo_a", "creative_a", "titulo_a",
    "título_a", "title_a", "not_set", "not set", "placeholder", "default", "teste", "test"
  ]);

  const GENERIC_BADGE_VALUES = new Set([
    "achados do dia", "premium", "beleza", "maquiagem", "tecnologia", "casa", "praticidade",
    "setup", "organização", "organizacao", "rosto", "corpo"
  ]);

  const BRAND_LIKE_BADGES = new Set([
    "bruna tavares", "hello kitty", "coca-cola", "coca cola", "lily", "o boticário",
    "oboticario", "ruby rose", "belle angel", "cherry lash", "kingston", "xiaomi", "amazon"
  ]);

  const QUALIFIED_EXECUTIVE_EVENT_WEIGHTS = {
    click_buy: 6,
    click_open_store: 3,
    click_copy_link: 2,
    click_copy_store_link: 2,
    click_copy_id: 1,
    click_social: 1,
    click_outbound: 1,
  };

  function normalizeCompareValue(value) {
    return normalizeText(value || "").toLowerCase();
  }

  function isUnknownLikeValue(value) {
    return UNKNOWN_LIKE_VALUES.has(normalizeCompareValue(value));
  }

  function isGenericRankingValue(value) {
    return GENERIC_RANKING_VALUES.has(normalizeCompareValue(value));
  }

  function looksLikeCategoryBadge(value) {
    const text = normalizeText(value || "");
    if (!text) return false;
    if (GENERIC_BADGE_VALUES.has(normalizeCompareValue(text))) return false;
    if (BRAND_LIKE_BADGES.has(normalizeCompareValue(text))) return false;
    return /(iluminador|blush|gloss|corretivo|base|pó|po facial|hidratante|creme|perfume|skincare|body care|cilios|cílios|cola|mochila|ssd|webcam|fone|notebook|mouse|teclado|kit|paleta|escova|bluetooth|usb|home office|casa inteligente|segurança|seguranca|celular|carro|moto|portátil|portatil)/i.test(text);
  }

  function inferCategoryFromBadges(badges) {
    const list = normalizeArray(badges || []);
    if (!list.length) return "";
    const specific = list.filter((badge) => looksLikeCategoryBadge(badge));
    if (!specific.length) return "";
    return specific.sort((a, b) => String(b).length - String(a).length)[0] || "";
  }

  function rememberKnowledgeValue(map, key, value) {
    const k = normalizeCompareValue(key);
    const v = normalizeText(value || "");
    if (!k || !v || isUnknownLikeValue(v)) return;
    const current = map.get(k) || new Map();
    current.set(v, (current.get(v) || 0) + 1);
    map.set(k, current);
  }

  function pickMostFrequentKnowledgeValue(counterMap) {
    if (!(counterMap instanceof Map) || !counterMap.size) return "";
    return Array.from(counterMap.entries())
      .sort((a, b) => {
        if ((b[1] || 0) !== (a[1] || 0)) return (b[1] || 0) - (a[1] || 0);
        if (String(b[0] || "").length !== String(a[0] || "").length) {
          return String(b[0] || "").length - String(a[0] || "").length;
        }
        return String(a[0] || "").localeCompare(String(b[0] || ""));
      })[0]?.[0] || "";
  }

  function buildCategoryKnowledgeBase(events) {
    const bySku = new Map();
    const byIdBusca = new Map();
    const byTitle = new Map();

    for (const event of Array.isArray(events) ? events : []) {
      const directCategory = normalizeText(event?.category || event?.extra?.category || "");
      const inferredCategory = directCategory && !isUnknownLikeValue(directCategory)
        ? directCategory
        : inferCategoryFromBadges(event?.badges || []);

      if (!inferredCategory || isUnknownLikeValue(inferredCategory)) continue;

      rememberKnowledgeValue(bySku, event?.sku, inferredCategory);
      rememberKnowledgeValue(byIdBusca, event?.id_busca, inferredCategory);
      rememberKnowledgeValue(byTitle, event?.product_title, inferredCategory);
    }

    return { bySku, byIdBusca, byTitle };
  }

  function resolveCategoryValue(event, knowledgeBase) {
    const direct = normalizeText(event?.category || event?.extra?.category || "");
    if (direct && !isUnknownLikeValue(direct)) return direct;

    const kb = knowledgeBase || {};
    const candidates = [
      pickMostFrequentKnowledgeValue(kb.bySku?.get(normalizeCompareValue(event?.sku))),
      pickMostFrequentKnowledgeValue(kb.byIdBusca?.get(normalizeCompareValue(event?.id_busca))),
      pickMostFrequentKnowledgeValue(kb.byTitle?.get(normalizeCompareValue(event?.product_title))),
      inferCategoryFromBadges(event?.badges || []),
    ].map((value) => normalizeText(value || "")).filter(Boolean);

    for (const candidate of candidates) {
      if (!isUnknownLikeValue(candidate)) return candidate;
    }

    return "sem categoria";
  }

  function enrichEventForExecutive(event, knowledgeBase) {
    const base = event && typeof event === "object" ? event : {};
    return {
      ...base,
      sku: normalizeText(base.sku || ""),
      product_title: normalizeText(base.product_title || base.title || ""),
      id_busca: normalizeText(base.id_busca || ""),
      badges: normalizeArray(base.badges || []),
      network: normalizeText(base.network || base.utm_source || ""),
      format: normalizeText(base.format || base.utm_medium || ""),
      placement: normalizeText(base.placement || ""),
      creative_id: normalizeText(base.creative_id || ""),
      title_id: normalizeText(base.title_id || ""),
      category: resolveCategoryValue(base, knowledgeBase),
    };
  }

  function isQualifiedExecutiveEventName(name) {
    const key = normalizeText(name || "");
    return Object.prototype.hasOwnProperty.call(QUALIFIED_EXECUTIVE_EVENT_WEIGHTS, key);
  }

  function qualifiedExecutiveEventWeight(name) {
    const key = normalizeText(name || "");
    return safeNumber(QUALIFIED_EXECUTIVE_EVENT_WEIGHTS[key], 0);
  }

  function buildQualifiedExecutiveRanking(events, keyBuilder, valueBuilder, maxItems) {
    const map = new Map();

    for (const event of Array.isArray(events) ? events : []) {
      const key = normalizeText(keyBuilder ? keyBuilder(event) : "");
      if (!key) continue;

      const current = map.get(key) || {
        key,
        label: key,
        count: 0,
        view_count: 0,
        buy_count: 0,
        copy_id_count: 0,
        copy_link_count: 0,
        open_store_count: 0,
        social_click_count: 0,
        outbound_click_count: 0,
        intention_score: 0,
        qualified_score: 0,
      };

      current.count += 1;
      const name = normalizeText(event?.event_name || "");
      if (name === "click_buy") current.buy_count += 1;
      if (name === "click_copy_id") current.copy_id_count += 1;
      if (["click_copy_link", "click_copy_store_link"].includes(name)) current.copy_link_count += 1;
      if (name === "click_open_store") current.open_store_count += 1;
      if (name === "click_social") current.social_click_count += 1;
      if (name === "click_outbound") current.outbound_click_count += 1;

      current.intention_score =
        (current.buy_count * 4) +
        (current.copy_link_count * 2) +
        (current.copy_id_count * 1) +
        (current.open_store_count * 2) +
        (current.social_click_count * 1) +
        (current.outbound_click_count * 1);

      current.qualified_score += qualifiedExecutiveEventWeight(name);

      const extra = valueBuilder ? valueBuilder(event, current) : null;
      if (extra && typeof extra === "object") {
        Object.assign(current, extra);
      }

      map.set(key, current);
    }

    return Array.from(map.values())
      .filter((item) => {
        const label = normalizeText(item?.label || item?.key || "");
        if (!label) return false;
        if (isUnknownLikeValue(label)) return false;
        if (isGenericRankingValue(label)) return false;
        return true;
      })
      .sort((a, b) => {
        if ((b.qualified_score || 0) !== (a.qualified_score || 0)) return (b.qualified_score || 0) - (a.qualified_score || 0);
        if ((b.intention_score || 0) !== (a.intention_score || 0)) return (b.intention_score || 0) - (a.intention_score || 0);
        if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
        return String(a.label || a.key || "").localeCompare(String(b.label || b.key || ""));
      })
      .slice(0, Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Number(maxItems) : 10);
  }

  function cleanRankingItems(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      const label = normalizeText(item?.label || item?.key || "");
      if (!label) return false;
      if (isUnknownLikeValue(label)) return false;
      if (isGenericRankingValue(label)) return false;
      return true;
    });
  }

  function percentString(value) {
    return `${(safeNumber(value, 0) * 100).toFixed(2).replace(".", ",")}%`;
  }

  function topItem(items) {
    return Array.isArray(items) && items.length ? items[0] : null;
  }

  function itemLabel(item, fallback) {
    return normalizeText(item?.product_title || item?.label || item?.key || fallback || "") || (fallback || "sem dados");
  }

  function compactItemContext(item) {
    const parts = [];
    const network = normalizeText(item?.network || "");
    const fmt = normalizeText(item?.format || "");
    const placement = normalizeText(item?.placement || "");
    const category = normalizeText(item?.category || "");
    const sku = normalizeText(item?.sku || "");

    if (network && !isUnknownLikeValue(network)) parts.push(`rede=${network}`);
    if (fmt && !isUnknownLikeValue(fmt)) parts.push(`formato=${fmt}`);
    if (placement && !isUnknownLikeValue(placement)) parts.push(`placement=${placement}`);
    if (category && !isUnknownLikeValue(category)) parts.push(`categoria=${category}`);
    if (sku && !isUnknownLikeValue(sku)) parts.push(`sku=${sku}`);

    return parts.join(" | ");
  }

  function buildExecutiveRecommendations(summary) {
    const executive = summary?.executive_rankings || {};
    const funnel = summary?.funnel || {};
    const lines = [];

    const bestNetwork = topItem(executive.top_networks);
    const bestCreative = topItem(executive.top_creatives);
    const bestTitle = topItem(executive.top_titles);
    const bestProduct = topItem(executive.top_products);

    lines.push("RESPOSTAS EXECUTIVAS");
    lines.push(`- Rede com melhor tração: ${bestNetwork ? itemLabel(bestNetwork, "sem dados") : "sem dados"}.`);
    lines.push(`- Criativo com melhor resposta: ${bestCreative ? itemLabel(bestCreative, "sem dados") : "sem dados"}.`);
    lines.push(`- Título com mais curiosidade/clique: ${bestTitle ? itemLabel(bestTitle, "sem dados") : "sem dados"}.`);
    lines.push(`- Produto que mais empurra para a loja/compra: ${bestProduct ? itemLabel(bestProduct, "sem dados") : "sem dados"}.`);
    lines.push("");

    lines.push("LEITURA RÁPIDA DO FUNIL");
    lines.push(`- Eventos úteis para decisão: ${safeNumber(summary?.totals?.qualified_events, 0)}`);
    lines.push(`- Visualizações de card/produto: ${safeNumber(funnel.view_product_card, 0)}`);
    lines.push(`- Cliques em comprar: ${safeNumber(funnel.click_buy, 0)}`);
    lines.push(`- Cliques em copiar ID: ${safeNumber(funnel.click_copy_id, 0)}`);
    lines.push(`- Cliques em copiar link: ${safeNumber(funnel.click_copy_link, 0) + safeNumber(funnel.click_copy_store_link, 0)}`);
    lines.push(`- Cliques em abrir loja: ${safeNumber(funnel.click_open_store, 0)}`);
    lines.push("");

    lines.push("TAXAS PRINCIPAIS");
    lines.push(`- Compra por visualização de card: ${percentString(summary?.rates?.click_buy_per_view_product_card)}`);
    lines.push(`- Copiar ID por visualização de card: ${percentString(summary?.rates?.click_copy_id_per_view_product_card)}`);
    lines.push(`- Copiar link por visualização de card: ${percentString(summary?.rates?.click_copy_link_per_view_product_card)}`);
    lines.push(`- Abrir loja por visualização de card: ${percentString(summary?.rates?.click_open_store_per_view_product_card)}`);
    lines.push("");

    return lines;
  }

  function rankingBlock(title, items, maxItems) {
    const lines = [title];
    if (!Array.isArray(items) || !items.length) {
      lines.push("- sem dados");
      lines.push("");
      return lines;
    }

    items.slice(0, Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Number(maxItems) : 5).forEach((item, index) => {
      const base = `${index + 1}. ${itemLabel(item, "sem dados")}`;
      const metrics = [`eventos=${safeNumber(item?.count, 0)}`];
      if (safeNumber(item?.qualified_score, 0) > 0) metrics.push(`qualificado=${safeNumber(item?.qualified_score, 0)}`);
      if (safeNumber(item?.intention_score, 0) > 0) metrics.push(`intenção=${safeNumber(item?.intention_score, 0)}`);
      if (safeNumber(item?.buy_count, 0) > 0) metrics.push(`comprar=${safeNumber(item?.buy_count, 0)}`);
      if (safeNumber(item?.copy_link_count, 0) > 0) metrics.push(`copiar_link=${safeNumber(item?.copy_link_count, 0)}`);
      if (safeNumber(item?.copy_id_count, 0) > 0) metrics.push(`copiar_id=${safeNumber(item?.copy_id_count, 0)}`);
      if (safeNumber(item?.open_store_count, 0) > 0) metrics.push(`abrir_loja=${safeNumber(item?.open_store_count, 0)}`);
      const context = compactItemContext(item);
      lines.push(`- ${base} | ${metrics.join(" | ")}${context ? " | " + context : ""}`);
    });

    lines.push("");
    return lines;
  }

  function summaryHeaderLines(summary, periodTitle) {
    const s = summary || {};
    const generatedAt = normalizeText(s.generated_at || nowIso());
    const days = safeNumber(s?.period?.days, 0);
    const lines = [];

    lines.push("RELATÓRIO INTELIGENTE — LA FAMIGLIA LINKS / ACHADOS DO DIA");
    lines.push(`Gerado em: ${formatDateTimeHuman(generatedAt)}`);
    lines.push(`Período: ${normalizeText(periodTitle || "customizado")}`);
    if (days > 0) lines.push(`Janela em dias: ${days}`);
    if (normalizeText(s?.period?.start_at || "")) lines.push(`Início: ${formatDateTimeHuman(s.period.start_at)}`);
    if (normalizeText(s?.period?.end_at || "")) lines.push(`Fim: ${formatDateTimeHuman(s.period.end_at)}`);
    lines.push(`Eventos filtrados: ${safeNumber(s?.totals?.filtered_events, 0)}`);
    lines.push(`Eventos úteis para decisão: ${safeNumber(s?.totals?.qualified_events, 0)}`);
    lines.push(`Eventos armazenados no total: ${safeNumber(s?.totals?.all_events_stored, 0)}`);
    lines.push("");
    return lines;
  }

  function buildExecutiveSection(summary, periodTitle) {
    const executive = summary?.executive_rankings || {};
    let lines = [];
    lines = lines.concat(summaryHeaderLines(summary, periodTitle));
    lines = lines.concat(buildExecutiveRecommendations(summary));
    lines = lines.concat(rankingBlock("TOP REDES", cleanRankingItems(executive.top_networks), 5));
    lines = lines.concat(rankingBlock("TOP CRIATIVOS", cleanRankingItems(executive.top_creatives), 5));
    lines = lines.concat(rankingBlock("TOP TÍTULOS", cleanRankingItems(executive.top_titles), 5));
    lines = lines.concat(rankingBlock("TOP PRODUTOS", cleanRankingItems(executive.top_products), 5));
    lines = lines.concat(rankingBlock("TOP CATEGORIAS", cleanRankingItems(executive.top_categories), 5));
    return lines;
  }

  function buildIntelligentReport(options) {
    const opts = options || {};
    const todayRange = resolvePresetRange("today");
    const weeklyRange = resolvePresetRange("weekly");

    const todaySummary = buildSummary({
      ...(opts || {}),
      start_at: todayRange.start_at,
      end_at: todayRange.end_at,
      days: 1,
    });

    const weeklySummary = buildSummary({
      ...(opts || {}),
      start_at: weeklyRange.start_at,
      end_at: weeklyRange.end_at,
      days: 7,
    });

    const generatedAt = nowIso();
    const lines = [];
    lines.push("==============================================");
    lines.push("CENTRAL DE INTELIGÊNCIA — RASTRO MENSURÁVEL");
    lines.push("Objetivo: medir clique antes de medir venda.");
    lines.push("==============================================");
    lines.push(`Gerado em: ${formatDateTimeHuman(generatedAt)}`);
    lines.push(`Arquivo diário referência: relatorio_tracking_${formatDateFile(generatedAt)}.txt`);
    lines.push(`Arquivo semanal referência: relatorio_tracking_semana_${weeklyRange.week_label}.txt`);
    lines.push("");
    lines.push("ANTES DA PRIMEIRA VENDA, O FOCO É:");
    lines.push("- qual rede gera mais clique");
    lines.push("- qual criativo gera mais toque");
    lines.push("- qual título gera mais curiosidade");
    lines.push("- qual produto leva a pessoa do conteúdo para a loja");
    lines.push("");
    lines.push("--------------------------------------------------");
    lines.push("BLOCO 1 — HOJE");
    lines.push("--------------------------------------------------");
    lines.push(buildExecutiveSection(todaySummary, todayRange.label).join("\n"));
    lines.push("--------------------------------------------------");
    lines.push("BLOCO 2 — ÚLTIMOS 7 DIAS");
    lines.push("--------------------------------------------------");
    lines.push(buildExecutiveSection(weeklySummary, weeklyRange.label).join("\n"));
    lines.push("--------------------------------------------------");
    lines.push("LEITURA FINAL");
    lines.push("--------------------------------------------------");
    lines.push("Use este relatório para decidir o que repetir, o que parar e o que testar de novo.");
    lines.push("Sem clique qualificado, não existe venda.");
    lines.push("");

    return {
      generated_at: generatedAt,
      today_summary: todaySummary,
      weekly_summary: weeklySummary,
      text: lines.join("\n").trim() + "\n",
      filenames: {
        intelligent: `relatorio_inteligente_${formatDateFile(generatedAt)}.txt`,
        daily: `relatorio_tracking_${formatDateFile(generatedAt)}.txt`,
        weekly: `relatorio_tracking_semana_${weeklyRange.week_label}.txt`,
      },
    };
  }

  function buildTrackedUrl(rawUrl, overrides) {
    const base = normalizeText(rawUrl || "");
    if (!base) return "";

    try {
      const url = new URL(base, location.href);
      const context = buildContext();
      const extra = overrides && typeof overrides === "object" ? overrides : {};

      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "network",
        "format",
        "placement",
        "creative_id",
        "title_id",
      ].forEach((key) => {
        const value = normalizeText(extra[key] || context[key] || "");
        if (value) {
          url.searchParams.set(key, value);
        }
      });

      return url.toString();
    } catch {
      return base;
    }
  }

  function isIntentEventName(name) {
    return [
      "page_view",
      "view_featured",
      "view_product_card",
      "view_quick_product",
      "click_buy",
      "click_copy_id",
      "click_copy_link",
      "click_copy_store_link",
      "click_open_store",
      "click_social",
      "click_outbound",
    ].includes(normalizeText(name || ""));
  }

  function buildIntentionRanking(events, keyBuilder, valueBuilder, maxItems) {
    const map = new Map();

    for (const event of Array.isArray(events) ? events : []) {
      const rawKey = keyBuilder(event);
      const key = normalizeText(rawKey || "");
      if (!key) continue;

      const current = map.get(key) || {
        key,
        label: key,
        count: 0,
        view_count: 0,
        buy_count: 0,
        copy_id_count: 0,
        copy_link_count: 0,
        open_store_count: 0,
        social_click_count: 0,
        outbound_click_count: 0,
        intention_score: 0,
      };

      current.count += 1;

      const name = normalizeText(event?.event_name || "");
      if (["page_view", "view_featured", "view_product_card", "view_quick_product"].includes(name)) {
        current.view_count += 1;
      }
      if (name === "click_buy") current.buy_count += 1;
      if (name === "click_copy_id") current.copy_id_count += 1;
      if (["click_copy_link", "click_copy_store_link"].includes(name)) current.copy_link_count += 1;
      if (name === "click_open_store") current.open_store_count += 1;
      if (name === "click_social") current.social_click_count += 1;
      if (name === "click_outbound") current.outbound_click_count += 1;

      current.intention_score =
        (current.buy_count * 4) +
        (current.copy_link_count * 2) +
        (current.copy_id_count * 1) +
        (current.open_store_count * 2) +
        (current.social_click_count * 1) +
        (current.outbound_click_count * 1);

      const extra = valueBuilder ? valueBuilder(event, current) : null;
      if (extra && typeof extra === "object") {
        Object.assign(current, extra);
      }

      map.set(key, current);
    }

    return Array.from(map.values())
      .sort((a, b) => {
        if ((b.intention_score || 0) !== (a.intention_score || 0)) {
          return (b.intention_score || 0) - (a.intention_score || 0);
        }
        if ((b.count || 0) !== (a.count || 0)) {
          return (b.count || 0) - (a.count || 0);
        }
        return String(a.label || a.key || "").localeCompare(String(b.label || b.key || ""));
      })
      .slice(0, Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Number(maxItems) : 10);
  }

  function buildFunnel(events) {
    const counts = countByEventName(events);
    return {
      page_view: safeNumber(counts.page_view, 0),
      view_featured: safeNumber(counts.view_featured, 0),
      view_product_card: safeNumber(counts.view_product_card, 0),
      view_quick_product: safeNumber(counts.view_quick_product, 0),
      click_buy: safeNumber(counts.click_buy, 0),
      click_copy_id: safeNumber(counts.click_copy_id, 0),
      click_copy_link: safeNumber(counts.click_copy_link, 0),
      click_copy_store_link: safeNumber(counts.click_copy_store_link, 0),
      click_open_store: safeNumber(counts.click_open_store, 0),
      click_social: safeNumber(counts.click_social, 0),
      click_outbound: safeNumber(counts.click_outbound, 0),
    };
  }

  function toDateValue(value) {
    const t = Date.parse(String(value || ""));
    return Number.isFinite(t) ? t : null;
  }

  function filterEventsByOptions(events, options) {
    const list = Array.isArray(events) ? events.slice() : [];
    const opts = options || {};

    const now = Date.now();
    const days = Number(opts.days);

    let startTs = null;
    let endTs = null;

    if (Number.isFinite(days) && days > 0) {
      startTs = now - (days * 24 * 60 * 60 * 1000);
      endTs = now;
    }

    if (opts.start_at) {
      const ts = toDateValue(opts.start_at);
      if (ts != null) startTs = ts;
    }

    if (opts.end_at) {
      const ts = toDateValue(opts.end_at);
      if (ts != null) endTs = ts;
    }

    const activeSessionId = normalizeText(
      opts.session_id || (opts.session_only ? getSessionId() : "")
    );
    const activeVisitorId = normalizeText(
      opts.visitor_id || (opts.visitor_only ? getVisitorId() : "")
    );

    return list.filter((event) => {
      const ts = toDateValue(event?.timestamp);
      if (ts == null) return false;
      if (startTs != null && ts < startTs) return false;
      if (endTs != null && ts > endTs) return false;
      if (activeSessionId && normalizeText(event?.session_id) !== activeSessionId) return false;
      if (activeVisitorId && normalizeText(event?.visitor_id) !== activeVisitorId) return false;
      return true;
    });
  }

  function safeMetricValue(value, fallback) {
    const text = normalizeText(value || "");
    return text || normalizeText(fallback || "");
  }

  function buildGroupedRanking(events, keyBuilder, valueBuilder, maxItems) {
    const map = new Map();

    for (const event of Array.isArray(events) ? events : []) {
      const rawKey = keyBuilder(event);
      const key = normalizeText(rawKey || "");
      if (!key) continue;

      const current = map.get(key) || {
        key,
        label: key,
        count: 0,
      };

      current.count += 1;

      const extra = valueBuilder ? valueBuilder(event, current) : null;
      if (extra && typeof extra === "object") {
        Object.assign(current, extra);
      }

      map.set(key, current);
    }

    return Array.from(map.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.label || a.key || "").localeCompare(String(b.label || b.key || ""));
      })
      .slice(0, Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Number(maxItems) : 10);
  }

  function countByEventName(events) {
    const out = {};

    for (const event of Array.isArray(events) ? events : []) {
      const name = normalizeText(event?.event_name || "unknown");
      if (!name) continue;
      out[name] = (out[name] || 0) + 1;
    }

    return out;
  }

  function buildSummary(options) {
    const opts = options || {};
    const allEvents = getEvents();
    const knowledgeBase = buildCategoryKnowledgeBase(allEvents);
    const events = filterEventsByOptions(allEvents, opts).map((event) => enrichEventForExecutive(event, knowledgeBase));
    const counts = countByEventName(events);
    const funnel = buildFunnel(events);

    const views = safeNumber(funnel.view_product_card, 0);
    const buyClicks = safeNumber(funnel.click_buy, 0);
    const copyIdClicks = safeNumber(funnel.click_copy_id, 0);
    const copyLinkClicks = safeNumber(funnel.click_copy_link, 0) + safeNumber(funnel.click_copy_store_link, 0);
    const storeClicks = safeNumber(funnel.click_open_store, 0);

    const intentEvents = events.filter((e) => isIntentEventName(e?.event_name));
    const qualifiedEvents = events.filter((e) => isQualifiedExecutiveEventName(e?.event_name));

    const topNetworksByBuy = buildGroupedRanking(
      events.filter((e) => e?.event_name === "click_buy"),
      (e) => safeMetricValue(e?.network || e?.utm_source, "unknown"),
      (e) => ({ label: safeMetricValue(e?.network || e?.utm_source, "unknown") }),
      opts.max_items
    );

    const topNetworksByIntention = buildIntentionRanking(
      intentEvents,
      (e) => safeMetricValue(e?.network || e?.utm_source, "unknown"),
      (e) => ({ label: safeMetricValue(e?.network || e?.utm_source, "unknown") }),
      opts.max_items
    );

    const topFormatsByIntention = buildIntentionRanking(
      intentEvents,
      (e) => safeMetricValue(e?.format || e?.utm_medium, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.format || e?.utm_medium, "unknown"),
        network: safeMetricValue(e?.network || e?.utm_source, "unknown"),
      }),
      opts.max_items
    );

    const topPlacementsByIntention = buildIntentionRanking(
      intentEvents,
      (e) => safeMetricValue(e?.placement, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.placement, "unknown"),
        network: safeMetricValue(e?.network || e?.utm_source, "unknown"),
        format: safeMetricValue(e?.format || e?.utm_medium, "unknown"),
      }),
      opts.max_items
    );

    const topCreativesByBuy = buildGroupedRanking(
      events.filter((e) => e?.event_name === "click_buy"),
      (e) => safeMetricValue(e?.creative_id, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.creative_id, "unknown"),
        network: safeMetricValue(e?.network || e?.utm_source, "unknown"),
        format: safeMetricValue(e?.format || e?.utm_medium, "unknown"),
      }),
      opts.max_items
    );

    const topTitlesByBuy = buildGroupedRanking(
      events.filter((e) => e?.event_name === "click_buy"),
      (e) => safeMetricValue(e?.title_id, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.title_id, "unknown"),
        creative_id: safeMetricValue(e?.creative_id, "unknown"),
      }),
      opts.max_items
    );

    const topProductsByBuy = buildGroupedRanking(
      events.filter((e) => e?.event_name === "click_buy"),
      (e) => safeMetricValue(e?.sku, "unknown"),
      (e, current) => ({
        label: safeMetricValue(e?.product_title || e?.sku, current?.key || "unknown"),
        sku: safeMetricValue(e?.sku, "unknown"),
        product_title: safeMetricValue(e?.product_title || e?.sku, "unknown"),
        category: safeMetricValue(e?.category, "sem categoria"),
        placement: safeMetricValue(e?.placement, "unknown"),
      }),
      opts.max_items
    );

    const topProductsByIntention = buildIntentionRanking(
      intentEvents.filter((e) => safeMetricValue(e?.sku, "") || safeMetricValue(e?.product_title, "")),
      (e) => safeMetricValue(e?.sku || e?.product_title, "unknown"),
      (e, current) => ({
        label: safeMetricValue(e?.product_title || e?.sku, current?.key || "unknown"),
        sku: safeMetricValue(e?.sku, "unknown"),
        product_title: safeMetricValue(e?.product_title || e?.sku, "unknown"),
        category: safeMetricValue(e?.category, "sem categoria"),
        network: safeMetricValue(e?.network || e?.utm_source, "unknown"),
        format: safeMetricValue(e?.format || e?.utm_medium, "unknown"),
        placement: safeMetricValue(e?.placement, "unknown"),
      }),
      opts.max_items
    );

    const topCategoriesByBuy = buildGroupedRanking(
      events.filter((e) => e?.event_name === "click_buy"),
      (e) => safeMetricValue(e?.category, "sem categoria"),
      (e) => ({ label: safeMetricValue(e?.category, "sem categoria") }),
      opts.max_items
    );

    const topCategoriesByIntention = buildIntentionRanking(
      intentEvents,
      (e) => safeMetricValue(e?.category, "sem categoria"),
      (e) => ({ label: safeMetricValue(e?.category, "sem categoria") }),
      opts.max_items
    );

    const topPagesByEventVolume = buildGroupedRanking(
      events,
      (e) => safeMetricValue(e?.page_type, "unknown"),
      (e) => ({ label: safeMetricValue(e?.page_type, "unknown") }),
      opts.max_items
    );

    const executiveRankings = {
      top_networks: buildQualifiedExecutiveRanking(
        qualifiedEvents,
        (e) => safeMetricValue(e?.network || e?.utm_source, "sem rede"),
        (e) => ({ label: safeMetricValue(e?.network || e?.utm_source, "sem rede") }),
        opts.max_items
      ),
      top_creatives: buildQualifiedExecutiveRanking(
        qualifiedEvents,
        (e) => safeMetricValue(e?.creative_id, "sem criativo"),
        (e) => ({
          label: safeMetricValue(e?.creative_id, "sem criativo"),
          network: safeMetricValue(e?.network || e?.utm_source, "unknown"),
          format: safeMetricValue(e?.format || e?.utm_medium, "unknown"),
        }),
        opts.max_items
      ),
      top_titles: buildQualifiedExecutiveRanking(
        qualifiedEvents,
        (e) => safeMetricValue(e?.title_id, "sem título"),
        (e) => ({
          label: safeMetricValue(e?.title_id, "sem título"),
          creative_id: safeMetricValue(e?.creative_id, "unknown"),
        }),
        opts.max_items
      ),
      top_products: buildQualifiedExecutiveRanking(
        qualifiedEvents.filter((e) => safeMetricValue(e?.sku, "") || safeMetricValue(e?.product_title, "")),
        (e) => safeMetricValue(e?.sku || e?.product_title, "sem produto"),
        (e, current) => ({
          label: safeMetricValue(e?.product_title || e?.sku, current?.key || "sem produto"),
          sku: safeMetricValue(e?.sku, "unknown"),
          product_title: safeMetricValue(e?.product_title || e?.sku, "sem produto"),
          category: safeMetricValue(e?.category, "sem categoria"),
          network: safeMetricValue(e?.network || e?.utm_source, "unknown"),
          format: safeMetricValue(e?.format || e?.utm_medium, "unknown"),
          placement: safeMetricValue(e?.placement, "unknown"),
        }),
        opts.max_items
      ),
      top_categories: buildQualifiedExecutiveRanking(
        qualifiedEvents,
        (e) => safeMetricValue(e?.category, "sem categoria"),
        (e) => ({ label: safeMetricValue(e?.category, "sem categoria") }),
        opts.max_items
      ),
    };

    return {
      generated_at: nowIso(),
      source: "La_Famiglia_Links",
      mode: "local_first",
      filters: {
        session_only: opts.session_only === true,
        session_id: normalizeText(opts.session_id || (opts.session_only ? getSessionId() : "")),
        visitor_only: opts.visitor_only === true,
        visitor_id: normalizeText(opts.visitor_id || (opts.visitor_only ? getVisitorId() : "")),
      },
      period: {
        days: Number.isFinite(Number(opts.days)) && Number(opts.days) > 0 ? Number(opts.days) : null,
        start_at: normalizeText(opts.start_at || ""),
        end_at: normalizeText(opts.end_at || ""),
      },
      totals: {
        all_events_stored: allEvents.length,
        filtered_events: events.length,
        qualified_events: qualifiedEvents.length,
        by_event_name: counts,
      },
      funnel,
      executive_rankings: executiveRankings,
      answers_before_first_sale: {
        top_pages_by_event_volume: topPagesByEventVolume,
        top_networks_by_click_buy: topNetworksByBuy,
        top_networks_by_intention: topNetworksByIntention,
        top_formats_by_intention: topFormatsByIntention,
        top_placements_by_intention: topPlacementsByIntention,
        top_creatives_by_click_buy: topCreativesByBuy,
        top_titles_by_click_buy: topTitlesByBuy,
        top_products_by_click_buy: topProductsByBuy,
        top_products_by_intention: topProductsByIntention,
        top_categories_by_click_buy: topCategoriesByBuy,
        top_categories_by_intention: topCategoriesByIntention,
      },
      rates: {
        click_buy_per_view_product_card: views > 0 ? Number((buyClicks / views).toFixed(4)) : 0,
        click_copy_id_per_view_product_card: views > 0 ? Number((copyIdClicks / views).toFixed(4)) : 0,
        click_copy_link_per_view_product_card: views > 0 ? Number((copyLinkClicks / views).toFixed(4)) : 0,
        click_open_store_per_view_product_card: views > 0 ? Number((storeClicks / views).toFixed(4)) : 0,
      },
    };
  }

  function summaryToRows(summary) {
    const rows = [[
      "section",
      "rank",
      "key",
      "label",
      "count",
      "view_count",
      "buy_count",
      "copy_id_count",
      "copy_link_count",
      "open_store_count",
      "social_click_count",
      "outbound_click_count",
      "intention_score",
      "sku",
      "product_title",
      "category",
      "network",
      "format",
      "placement",
      "creative_id",
      "title_id",
    ]];

    const sections = summary?.answers_before_first_sale || {};

    Object.entries(sections).forEach(([sectionName, items]) => {
      if (!Array.isArray(items)) return;
      items.forEach((item, index) => {
        rows.push([
          sectionName,
          String(index + 1),
          item?.key || "",
          item?.label || "",
          String(item?.count || 0),
          String(item?.view_count || 0),
          String(item?.buy_count || 0),
          String(item?.copy_id_count || 0),
          String(item?.copy_link_count || 0),
          String(item?.open_store_count || 0),
          String(item?.social_click_count || 0),
          String(item?.outbound_click_count || 0),
          String(item?.intention_score || 0),
          item?.sku || "",
          item?.product_title || "",
          item?.category || "",
          item?.network || "",
          item?.format || "",
          item?.placement || "",
          item?.creative_id || "",
          item?.title_id || "",
        ]);
      });
    });

    return rows;
  }

  function summaryToText(summary) {
    const s = summary || {};
    const period = s?.period || {};
    let periodTitle = "Período customizado";

    if (safeNumber(period.days, 0) === 1) {
      periodTitle = `Hoje (${formatDateHuman(new Date())})`;
    } else if (safeNumber(period.days, 0) === 7) {
      const range = resolvePresetRange("weekly");
      periodTitle = range.label;
    } else if (normalizeText(period.start_at || "") || normalizeText(period.end_at || "")) {
      const startText = normalizeText(period.start_at || "") ? formatDateTimeHuman(period.start_at) : "sem início";
      const endText = normalizeText(period.end_at || "") ? formatDateTimeHuman(period.end_at) : "sem fim";
      periodTitle = `${startText} até ${endText}`;
    }

    return buildExecutiveSection(s, periodTitle).join("\n").trim() + "\n";
  }

  function csvDownload(filename, rows) {
    const content = rows.map((row) => row.map(csvEscape).join(";")).join("\n") + "\n";
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "tracking_events.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const API = {
    init(config) {
      CONFIG = { ...DEFAULT_CONFIG, ...(config || {}) };

      if (!CONFIG.pageType) {
        CONFIG.pageType = inferPageType();
      }

      buildContext();

      if (CONFIG.autoPageView) {
        API.trackPageView();
      }

      logDebug("init", CONFIG);

      return {
        pageType: CONFIG.pageType,
        session_id: getSessionId(),
        visitor_id: getVisitorId(),
        context: buildContext(),
      };
    },

    getContext() {
      return buildContext();
    },

    getSessionId() {
      return getSessionId();
    },

    getVisitorId() {
      return getVisitorId();
    },

    getEvents() {
      return getEvents();
    },

    getSessionEvents(options) {
      return filterEventsByOptions(getEvents(), {
        ...(options || {}),
        session_only: true,
      });
    },

    clearEvents() {
      saveEvents([]);
      return true;
    },

    clearSessionEvents(options) {
      const opts = options || {};
      const sessionId = normalizeText(opts.session_id || getSessionId());
      if (!sessionId) return false;
      const remaining = getEvents().filter((event) => normalizeText(event?.session_id) !== sessionId);
      saveEvents(remaining);
      return true;
    },

    clearContext() {
      clearStoredContext();
      return true;
    },

    resetSession(options) {
      const opts = options || {};
      const previous_session_id = getSessionId();
      if (opts.clear_session_events === true) {
        API.clearSessionEvents({ session_id: previous_session_id });
      }
      if (opts.clear_context === true) {
        clearStoredContext();
      }
      const session_id = createNewSessionId();
      const context = buildContext();
      return {
        previous_session_id,
        session_id,
        visitor_id: getVisitorId(),
        context,
      };
    },

    exportEventsJson(filename) {
      jsonDownload(filename || "cn_tracking_events.json", getEvents());
      return true;
    },

    exportEventsCsv(filename) {
      const events = getEvents();

      const rows = [[
        "id",
        "event_name",
        "timestamp",
        "page_type",
        "session_id",
        "visitor_id",
        "url",
        "path",
        "referrer",
        "device_type",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "network",
        "format",
        "placement",
        "creative_id",
        "title_id",
        "sku",
        "product_title",
        "id_busca",
        "badges",
        "featured",
        "category",
        "position_on_page",
        "extra_json",
      ]];

      for (const e of events) {
        rows.push([
          e.id,
          e.event_name,
          e.timestamp,
          e.page_type,
          e.session_id,
          e.visitor_id,
          e.url,
          e.path,
          e.referrer,
          e.device_type,
          e.utm_source,
          e.utm_medium,
          e.utm_campaign,
          e.utm_content,
          e.utm_term,
          e.network,
          e.format,
          e.placement,
          e.creative_id,
          e.title_id,
          e.sku,
          e.product_title,
          e.id_busca,
          Array.isArray(e.badges) ? e.badges.join(" | ") : "",
          e.featured ? "true" : "false",
          e.category,
          e.position_on_page == null ? "" : String(e.position_on_page),
          JSON.stringify(e.extra || {}),
        ]);
      }

      csvDownload(filename || "cn_tracking_events.csv", rows);
      return true;
    },

    exportSessionEventsJson(filename, options) {
      const events = API.getSessionEvents(options || {});
      jsonDownload(filename || "cn_tracking_events_session.json", events);
      return events;
    },

    exportSessionEventsCsv(filename, options) {
      const events = API.getSessionEvents(options || {});

      const rows = [[
        "id",
        "event_name",
        "timestamp",
        "page_type",
        "session_id",
        "visitor_id",
        "url",
        "path",
        "referrer",
        "device_type",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "network",
        "format",
        "placement",
        "creative_id",
        "title_id",
        "sku",
        "product_title",
        "id_busca",
        "badges",
        "featured",
        "category",
        "position_on_page",
        "extra_json",
      ]];

      for (const e of events) {
        rows.push([
          e.id,
          e.event_name,
          e.timestamp,
          e.page_type,
          e.session_id,
          e.visitor_id,
          e.url,
          e.path,
          e.referrer,
          e.device_type,
          e.utm_source,
          e.utm_medium,
          e.utm_campaign,
          e.utm_content,
          e.utm_term,
          e.network,
          e.format,
          e.placement,
          e.creative_id,
          e.title_id,
          e.sku,
          e.product_title,
          e.id_busca,
          Array.isArray(e.badges) ? e.badges.join(" | ") : "",
          e.featured ? "true" : "false",
          e.category,
          e.position_on_page == null ? "" : String(e.position_on_page),
          JSON.stringify(e.extra || {}),
        ]);
      }

      csvDownload(filename || "cn_tracking_events_session.csv", rows);
      return events;
    },

    getSummary(options) {
      return buildSummary(options || {});
    },

    getSessionSummary(options) {
      return buildSummary({
        ...(options || {}),
        session_only: true,
      });
    },

    exportSummaryJson(filename, options) {
      const summary = buildSummary(options || {});
      jsonDownload(filename || "cn_tracking_summary.json", summary);
      return summary;
    },

    exportSummaryCsv(filename, options) {
      const summary = buildSummary(options || {});
      csvDownload(filename || "cn_tracking_summary.csv", summaryToRows(summary));
      return summary;
    },

    exportSummaryTxt(filename, options) {
      const summary = buildSummary(options || {});
      textDownload(filename || "cn_tracking_summary.txt", summaryToText(summary));
      return summary;
    },

    getTodaySummary(options) {
      const range = resolvePresetRange("today");
      return buildSummary({
        ...(options || {}),
        start_at: range.start_at,
        end_at: range.end_at,
        days: 1,
      });
    },

    getWeeklySummary(options) {
      const range = resolvePresetRange("weekly");
      return buildSummary({
        ...(options || {}),
        start_at: range.start_at,
        end_at: range.end_at,
        days: 7,
      });
    },

    exportDailyExecutiveTxt(filename, options) {
      const summary = API.getTodaySummary(options || {});
      textDownload(filename || `relatorio_tracking_${formatDateFile(new Date())}.txt`, summaryToText(summary));
      return summary;
    },

    exportWeeklyExecutiveTxt(filename, options) {
      const range = resolvePresetRange("weekly");
      const summary = API.getWeeklySummary(options || {});
      textDownload(filename || `relatorio_tracking_semana_${range.week_label}.txt`, summaryToText(summary));
      return summary;
    },

    getIntelligentReport(options) {
      return buildIntelligentReport(options || {});
    },

    exportIntelligentReportTxt(filename, options) {
      const report = buildIntelligentReport(options || {});
      textDownload(filename || report.filenames.intelligent, report.text);
      return report;
    },

    exportSessionSummaryJson(filename, options) {
      const summary = API.getSessionSummary(options || {});
      jsonDownload(filename || "cn_tracking_summary_session.json", summary);
      return summary;
    },

    exportSessionSummaryCsv(filename, options) {
      const summary = API.getSessionSummary(options || {});
      csvDownload(filename || "cn_tracking_summary_session.csv", summaryToRows(summary));
      return summary;
    },

    exportSessionSummaryTxt(filename, options) {
      const summary = API.getSessionSummary(options || {});
      textDownload(filename || "cn_tracking_summary_session.txt", summaryToText(summary));
      return summary;
    },

    getTrackedUrl(rawUrl, overrides) {
      return buildTrackedUrl(rawUrl, overrides || {});
    },

    track(eventName, meta) {
      return pushEvent(eventName, meta || {});
    },

    trackPageView(meta) {
      return pushEvent("page_view", {
        page_type: CONFIG.pageType || inferPageType(),
        ...(meta || {}),
      });
    },

    trackProductView(product, extra) {
      return pushEvent("view_product_card", {
        ...(product || {}),
        ...(extra || {}),
      });
    },

    trackFeaturedView(product, extra) {
      return pushEvent("view_featured", {
        ...(product || {}),
        featured: true,
        ...(extra || {}),
      });
    },

    trackQuickProductView(product, extra) {
      return pushEvent("view_quick_product", {
        ...(product || {}),
        ...(extra || {}),
      });
    },

    trackBuyClick(product, extra) {
      return pushEvent("click_buy", {
        ...(product || {}),
        ...(extra || {}),
      });
    },

    trackCopyId(product, extra) {
      return pushEvent("click_copy_id", {
        ...(product || {}),
        ...(extra || {}),
      });
    },

    trackCopyLink(product, extra) {
      return pushEvent("click_copy_link", {
        ...(product || {}),
        ...(extra || {}),
      });
    },

    trackOpenStore(extra) {
      return pushEvent("click_open_store", {
        ...(extra || {}),
      });
    },

    trackSocialClick(network, extra) {
      return pushEvent("click_social", {
        network: normalizeText(network || extra?.network || ""),
        ...(extra || {}),
      });
    },

    trackOutboundClick(label, extra) {
      return pushEvent("click_outbound", {
        label: normalizeText(label || extra?.label || ""),
        ...(extra || {}),
      });
    },

    trackCopyStoreLink(extra) {
      return pushEvent("click_copy_store_link", {
        ...(extra || {}),
      });
    },

    trackSearch(query, extra) {
      return pushEvent("search", {
        query: normalizeText(query || ""),
        ...(extra || {}),
      });
    },

    trackFilter(tag, extra) {
      return pushEvent("filter_tag", {
        tag: normalizeText(tag || ""),
        ...(extra || {}),
      });
    },

    trackSortChange(sort, extra) {
      return pushEvent("sort_change", {
        sort: normalizeText(sort || ""),
        ...(extra || {}),
      });
    },

    trackLoadMore(extra) {
      return pushEvent("click_load_more", {
        ...(extra || {}),
      });
    },
  };

  window.CNTracking = API;
})();
