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

    return list.filter((event) => {
      const ts = toDateValue(event?.timestamp);
      if (ts == null) return false;
      if (startTs != null && ts < startTs) return false;
      if (endTs != null && ts > endTs) return false;
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
    const events = filterEventsByOptions(allEvents, opts);
    const counts = countByEventName(events);
    const funnel = buildFunnel(events);

    const views = safeNumber(funnel.view_product_card, 0);
    const buyClicks = safeNumber(funnel.click_buy, 0);
    const copyIdClicks = safeNumber(funnel.click_copy_id, 0);
    const copyLinkClicks = safeNumber(funnel.click_copy_link, 0) + safeNumber(funnel.click_copy_store_link, 0);
    const storeClicks = safeNumber(funnel.click_open_store, 0);

    const intentEvents = events.filter((e) => isIntentEventName(e?.event_name));

    const topNetworksByBuy = buildGroupedRanking(
      events.filter((e) => e?.event_name === "click_buy"),
      (e) => safeMetricValue(e?.network || e?.utm_source, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.network || e?.utm_source, "unknown"),
      }),
      opts.max_items
    );

    const topNetworksByIntention = buildIntentionRanking(
      intentEvents,
      (e) => safeMetricValue(e?.network || e?.utm_source, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.network || e?.utm_source, "unknown"),
      }),
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
        category: safeMetricValue(e?.category, "unknown"),
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
        category: safeMetricValue(e?.category, "unknown"),
        network: safeMetricValue(e?.network || e?.utm_source, "unknown"),
        format: safeMetricValue(e?.format || e?.utm_medium, "unknown"),
        placement: safeMetricValue(e?.placement, "unknown"),
      }),
      opts.max_items
    );

    const topCategoriesByBuy = buildGroupedRanking(
      events.filter((e) => e?.event_name === "click_buy"),
      (e) => safeMetricValue(e?.category, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.category, "unknown"),
      }),
      opts.max_items
    );

    const topCategoriesByIntention = buildIntentionRanking(
      intentEvents,
      (e) => safeMetricValue(e?.category, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.category, "unknown"),
      }),
      opts.max_items
    );

    const topPagesByEventVolume = buildGroupedRanking(
      events,
      (e) => safeMetricValue(e?.page_type, "unknown"),
      (e) => ({
        label: safeMetricValue(e?.page_type, "unknown"),
      }),
      opts.max_items
    );

    return {
      generated_at: nowIso(),
      source: "La_Famiglia_Links",
      mode: "local_first",
      period: {
        days: Number.isFinite(Number(opts.days)) && Number(opts.days) > 0 ? Number(opts.days) : null,
        start_at: normalizeText(opts.start_at || ""),
        end_at: normalizeText(opts.end_at || ""),
      },
      totals: {
        all_events_stored: allEvents.length,
        filtered_events: events.length,
        by_event_name: counts,
      },
      funnel,
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
    const answers = s.answers_before_first_sale || {};
    const funnel = s.funnel || {};
    const lines = [];

    function pushRanking(title, items) {
      lines.push(title);
      if (!Array.isArray(items) || !items.length) {
        lines.push("- sem dados");
        lines.push("");
        return;
      }

      items.forEach((item, index) => {
        const parts = [
          `${index + 1}. ${item?.label || item?.key || "unknown"}`,
          `count=${safeNumber(item?.count, 0)}`,
        ];

        if (safeNumber(item?.intention_score, 0) > 0) parts.push(`intention=${safeNumber(item?.intention_score, 0)}`);
        if (safeNumber(item?.buy_count, 0) > 0) parts.push(`buy=${safeNumber(item?.buy_count, 0)}`);
        if (safeNumber(item?.copy_link_count, 0) > 0) parts.push(`copy_link=${safeNumber(item?.copy_link_count, 0)}`);
        if (safeNumber(item?.copy_id_count, 0) > 0) parts.push(`copy_id=${safeNumber(item?.copy_id_count, 0)}`);
        if (safeNumber(item?.open_store_count, 0) > 0) parts.push(`open_store=${safeNumber(item?.open_store_count, 0)}`);
        if (item?.sku) parts.push(`sku=${item.sku}`);
        if (item?.category) parts.push(`category=${item.category}`);
        if (item?.network) parts.push(`network=${item.network}`);
        if (item?.format) parts.push(`format=${item.format}`);
        if (item?.placement) parts.push(`placement=${item.placement}`);

        lines.push(`- ${parts.join(" | ")}`);
      });

      lines.push("");
    }

    lines.push("RELATORIO LOCAL-FIRST - TRACKING LA_FAMIGLIA_LINKS");
    lines.push(`gerado_em: ${normalizeText(s.generated_at || nowIso())}`);
    lines.push(`eventos_filtrados: ${safeNumber(s?.totals?.filtered_events, 0)}`);
    lines.push(`eventos_armazenados: ${safeNumber(s?.totals?.all_events_stored, 0)}`);
    lines.push("");

    lines.push("FUNIL:");
    Object.entries(funnel).forEach(([key, value]) => {
      lines.push(`- ${key}: ${safeNumber(value, 0)}`);
    });
    lines.push("");

    lines.push("TAXAS:");
    Object.entries(s?.rates || {}).forEach(([key, value]) => {
      lines.push(`- ${key}: ${safeNumber(value, 0)}`);
    });
    lines.push("");

    pushRanking("TOP REDES POR INTENCAO", answers.top_networks_by_intention);
    pushRanking("TOP FORMATOS POR INTENCAO", answers.top_formats_by_intention);
    pushRanking("TOP PLACEMENTS POR INTENCAO", answers.top_placements_by_intention);
    pushRanking("TOP PRODUTOS POR INTENCAO", answers.top_products_by_intention);
    pushRanking("TOP CATEGORIAS POR INTENCAO", answers.top_categories_by_intention);
    pushRanking("TOP CRIATIVOS POR CLICK_BUY", answers.top_creatives_by_click_buy);
    pushRanking("TOP TITULOS POR CLICK_BUY", answers.top_titles_by_click_buy);

    return lines.join("\n").trim() + "\n";
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

    getSummary(options) {
      return buildSummary(options || {});
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
