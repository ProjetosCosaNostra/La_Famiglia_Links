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
    a.href = URL.createObjectURL(blob);
    a.download = filename || "tracking_events.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
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

    clearEvents() {
      saveEvents([]);
      return true;
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
