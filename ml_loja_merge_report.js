(() => {
  'use strict';

  const VERSION = '1.0.0';
  const APP_ID = 'cn-ml-loja-merge-report';
  const PANEL_ID = `${APP_ID}-panel`;
  const STYLE_ID = `${APP_ID}-style`;
  const FILE_INPUT_ID = `${APP_ID}-file`;

  const STATE = {
    mlJson: null,
    merged: null,
    running: false,
    logs: [],
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function timestampFile() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function normalizeSpaces(value) {
    return String(value || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanText(value) {
    return normalizeSpaces(String(value || '').replace(/<[^>]*>/g, ' '));
  }

  function normalizeKey(value) {
    return cleanText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function log(message, type = 'info') {
    const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${message}`;
    STATE.logs.push({ at: nowIso(), type, message: line });
    if (STATE.logs.length > 200) STATE.logs.shift();
    const logEl = qs(`#${APP_ID}-log`);
    if (logEl) {
      logEl.textContent = STATE.logs.map((entry) => entry.message).slice(-12).join('\n');
      logEl.scrollTop = logEl.scrollHeight;
    }
    console[type === 'error' ? 'error' : 'log'](`[CN Merge Report] ${message}`);
  }

  function ensureStyles() {
    if (qs(`#${STYLE_ID}`)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: 390px;
        max-width: calc(100vw - 24px);
        z-index: 2147483647;
        background: rgba(12, 12, 14, 0.97);
        color: #f4f4f5;
        border: 1px solid rgba(214, 173, 84, 0.35);
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.45);
        font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
        overflow: hidden;
        backdrop-filter: blur(10px);
      }
      #${PANEL_ID} * { box-sizing: border-box; }
      #${APP_ID}-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        background: linear-gradient(180deg, rgba(214,173,84,0.16), rgba(214,173,84,0.03));
        border-bottom: 1px solid rgba(214, 173, 84, 0.2);
      }
      #${APP_ID}-title {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      #${APP_ID}-title strong {
        font-size: 14px;
        letter-spacing: 0.02em;
      }
      #${APP_ID}-title span {
        font-size: 11px;
        color: rgba(244,244,245,0.72);
      }
      #${APP_ID}-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding: 12px 14px;
      }
      #${APP_ID}-actions button,
      #${APP_ID}-footer button,
      #${APP_ID}-openfile {
        appearance: none;
        border: 1px solid rgba(214, 173, 84, 0.28);
        background: rgba(255,255,255,0.03);
        color: #f4f4f5;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: transform .12s ease, background .12s ease, border-color .12s ease;
        text-align: center;
      }
      #${APP_ID}-actions button:hover,
      #${APP_ID}-footer button:hover,
      #${APP_ID}-openfile:hover {
        transform: translateY(-1px);
        background: rgba(214,173,84,0.10);
        border-color: rgba(214,173,84,0.50);
      }
      #${APP_ID}-actions button:disabled,
      #${APP_ID}-footer button:disabled {
        cursor: wait;
        opacity: 0.65;
        transform: none;
      }
      #${APP_ID}-meta {
        padding: 0 14px 12px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .${APP_ID}-chip {
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        border-radius: 10px;
        padding: 8px 10px;
      }
      .${APP_ID}-chip .label {
        display: block;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: rgba(244,244,245,0.60);
        margin-bottom: 5px;
      }
      .${APP_ID}-chip .value {
        display: block;
        font-size: 12px;
        color: #f4f4f5;
        word-break: break-word;
      }
      #${APP_ID}-log {
        margin: 0 14px 12px;
        min-height: 110px;
        max-height: 172px;
        overflow: auto;
        padding: 10px;
        border-radius: 10px;
        background: rgba(0,0,0,0.32);
        border: 1px solid rgba(255,255,255,0.06);
        color: #cfcfd6;
        font-size: 11px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      #${APP_ID}-footer {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        padding: 0 14px 14px;
      }
      #${APP_ID}-minimize,
      #${APP_ID}-close {
        width: 28px;
        height: 28px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        padding: 0;
      }
      #${APP_ID}-body.hidden {
        display: none;
      }
      #${FILE_INPUT_ID} {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    ensureStyles();
    if (qs(`#${PANEL_ID}`)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div id="${APP_ID}-header">
        <div id="${APP_ID}-title">
          <strong>CN Loja + ML Merge Report</strong>
          <span>Une relatório da loja com o JSON do Afiliados</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button id="${APP_ID}-minimize" title="Minimizar">—</button>
          <button id="${APP_ID}-close" title="Fechar">×</button>
        </div>
      </div>
      <div id="${APP_ID}-body">
        <div id="${APP_ID}-actions">
          <label id="${APP_ID}-openfile" for="${FILE_INPUT_ID}">Carregar JSON ML</label>
          <button id="${APP_ID}-capture-loja">Capturar loja agora</button>
          <button id="${APP_ID}-merge">Gerar relatório mesclado</button>
          <button id="${APP_ID}-reset">Limpar dados</button>
          <input id="${FILE_INPUT_ID}" type="file" accept="application/json,.json" />
        </div>
        <div id="${APP_ID}-meta">
          <div class="${APP_ID}-chip"><span class="label">JSON ML</span><span class="value" id="${APP_ID}-mlfile">—</span></div>
          <div class="${APP_ID}-chip"><span class="label">Último merge</span><span class="value" id="${APP_ID}-last">—</span></div>
          <div class="${APP_ID}-chip"><span class="label">Loja</span><span class="value" id="${APP_ID}-loja">—</span></div>
          <div class="${APP_ID}-chip"><span class="label">ML Direto</span><span class="value" id="${APP_ID}-mldirect">—</span></div>
        </div>
        <pre id="${APP_ID}-log">Merge report carregado. 1) carregue o JSON do ML 2) clique em “Gerar relatório mesclado”.</pre>
        <div id="${APP_ID}-footer">
          <button id="${APP_ID}-download-json" disabled>Baixar JSON</button>
          <button id="${APP_ID}-download-txt" disabled>Baixar TXT</button>
          <button id="${APP_ID}-copy" disabled>Copiar resumo</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    qs(`#${APP_ID}-minimize`).addEventListener('click', () => {
      qs(`#${APP_ID}-body`).classList.toggle('hidden');
    });

    qs(`#${APP_ID}-close`).addEventListener('click', () => panel.remove());

    qs(`#${FILE_INPUT_ID}`).addEventListener('change', onFileSelected);
    qs(`#${APP_ID}-capture-loja`).addEventListener('click', () => runSafe(captureLojaOnly));
    qs(`#${APP_ID}-merge`).addEventListener('click', () => runSafe(generateMergedReport));
    qs(`#${APP_ID}-reset`).addEventListener('click', resetState);
    qs(`#${APP_ID}-download-json`).addEventListener('click', () => {
      if (!STATE.merged) return;
      downloadJson(STATE.merged, buildFilename('merge', 'json'));
    });
    qs(`#${APP_ID}-download-txt`).addEventListener('click', () => {
      if (!STATE.merged) return;
      downloadText(STATE.merged.report_text || '', buildFilename('merge', 'txt'));
    });
    qs(`#${APP_ID}-copy`).addEventListener('click', async () => {
      if (!STATE.merged) return;
      const text = STATE.merged.report_text || JSON.stringify(STATE.merged, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        log('Resumo copiado para a área de transferência.');
      } catch (error) {
        log(`Falha ao copiar: ${error.message || error}`, 'error');
      }
    });
  }

  function buildFilename(prefix, ext) {
    return `${prefix}_${timestampFile()}.${ext}`;
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      STATE.mlJson = json;
      qs(`#${APP_ID}-mlfile`).textContent = file.name;
      log(`JSON do ML carregado: ${file.name}`);
      updateMetaCounters();
    } catch (error) {
      log(`Falha ao ler JSON do ML: ${error.message || error}`, 'error');
    }
  }

  async function runSafe(fn) {
    if (STATE.running) {
      log('Já existe uma operação em execução. Aguarde.');
      return;
    }
    try {
      STATE.running = true;
      toggleRunningButtons(true);
      await fn();
    } catch (error) {
      log(`Erro: ${error.message || error}`, 'error');
      console.error(error);
    } finally {
      STATE.running = false;
      toggleRunningButtons(false);
    }
  }

  function toggleRunningButtons(isRunning) {
    ['capture-loja', 'merge', 'reset'].forEach((suffix) => {
      const button = qs(`#${APP_ID}-${suffix}`);
      if (button) button.disabled = isRunning;
    });
    ['download-json', 'download-txt', 'copy'].forEach((suffix) => {
      const button = qs(`#${APP_ID}-${suffix}`);
      if (!button) return;
      button.disabled = isRunning || !STATE.merged;
    });
  }

  function resetState() {
    STATE.mlJson = null;
    STATE.merged = null;
    qs(`#${FILE_INPUT_ID}`).value = '';
    qs(`#${APP_ID}-mlfile`).textContent = '—';
    qs(`#${APP_ID}-last`).textContent = '—';
    qs(`#${APP_ID}-loja`).textContent = '—';
    qs(`#${APP_ID}-mldirect`).textContent = '—';
    toggleRunningButtons(false);
    log('Estado limpo.');
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log(`JSON baixado: ${filename}`);
  }

  function downloadText(text, filename) {
    const blob = new Blob([String(text || '')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log(`TXT baixado: ${filename}`);
  }

  function formatDateTimeBR(value) {
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return cleanText(value);
      return d.toLocaleString('pt-BR');
    } catch {
      return cleanText(value);
    }
  }

  function formatPercentBR(value) {
    const n = Number(value || 0) * 100;
    return `${n.toFixed(2).replace('.', ',')}%`;
  }

  function formatMoneyBR(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getTopItem(list) {
    return safeArray(list)[0] || null;
  }

  function metricDetailLine(prefix, item) {
    if (!item) return `- ${prefix}: sem dados suficientes`;
    const bits = [cleanText(item.label || item.key || 'sem dado') || 'sem dado'];
    if (item.sku) bits.push(`sku=${item.sku}`);
    if (item.network) bits.push(`rede=${item.network}`);
    if (item.profile_id) bits.push(`perfil=${item.profile_id}`);
    if (item.format) bits.push(`formato=${item.format}`);
    if (item.title_id) bits.push(`title=${item.title_id}`);
    if (item.creative_id) bits.push(`criativo=${item.creative_id}`);
    if (safeNumber(item.view_count) > 0) bits.push(`views=${safeNumber(item.view_count)}`);
    if (safeNumber(item.buy_count) > 0) bits.push(`comprar=${safeNumber(item.buy_count)}`);
    if (safeNumber(item.copy_link_count) > 0) bits.push(`copiar_link=${safeNumber(item.copy_link_count)}`);
    if (safeNumber(item.copy_id_count) > 0) bits.push(`copiar_id=${safeNumber(item.copy_id_count)}`);
    if (safeNumber(item.intention_score) > 0) bits.push(`intenção=${safeNumber(item.intention_score)}`);
    if (safeNumber(item.paid_score) > 0) bits.push(`paid_score=${safeNumber(item.paid_score).toFixed(2).replace('.', ',')}`);
    if (safeNumber(item.buy_ctr) > 0) bits.push(`buy_ctr=${formatPercentBR(item.buy_ctr)}`);
    if (safeNumber(item.intent_rate) > 0) bits.push(`intent_rate=${formatPercentBR(item.intent_rate)}`);
    return `- ${prefix}: ${bits.join(' | ')}`;
  }

  function buildStoreDecisionLines(summary) {
    const answers = summary?.answers_before_first_sale || {};
    const topProducts = safeArray(answers.top_products_by_paid_score).slice(0, 5);
    const topCreatives = safeArray(answers.top_creatives_by_intention).slice(0, 5);
    const topTitles = safeArray(answers.top_titles_by_intention).slice(0, 5);
    const topNetworks = safeArray(answers.top_networks_by_intention).slice(0, 5);
    const weakProducts = safeArray(answers.weak_products).slice(0, 5);
    const lines = [];

    lines.push('Produtos mais prontos para primeiro tráfego pago:');
    if (!topProducts.length) lines.push('- sem dados suficientes');
    else topProducts.forEach((item, idx) => lines.push(metricDetailLine(`Produto #${idx + 1}`, item)));
    lines.push('');

    lines.push('Criativos com mais intenção:');
    if (!topCreatives.length) lines.push('- sem dados suficientes');
    else topCreatives.forEach((item, idx) => lines.push(metricDetailLine(`Criativo #${idx + 1}`, item)));
    lines.push('');

    lines.push('Títulos com mais curiosidade útil:');
    if (!topTitles.length) lines.push('- sem dados suficientes');
    else topTitles.forEach((item, idx) => lines.push(metricDetailLine(`Título #${idx + 1}`, item)));
    lines.push('');

    lines.push('Redes com melhor sinal de intenção:');
    if (!topNetworks.length) lines.push('- sem dados suficientes');
    else topNetworks.forEach((item, idx) => lines.push(metricDetailLine(`Rede #${idx + 1}`, item)));
    lines.push('');

    lines.push('Produtos fracos / candidatos a pausar:');
    if (!weakProducts.length) lines.push('- sem dados suficientes');
    else weakProducts.forEach((item, idx) => lines.push(metricDetailLine(`Fraco #${idx + 1}`, item)));
    lines.push('');

    return lines;
  }

  function buildLocalRangeToday() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  function buildLocalRangeLastDays(days) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (Number(days || 7) - 1));
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  function getTracking() {
    return window.CNTracking || null;
  }

  async function fetchProdutosJson() {
    const res = await fetch(`./produtos.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('produtos.json não encontrado');
    return res.json();
  }

  function buildStoreSummary() {
    const tracking = getTracking();
    const todayRange = buildLocalRangeToday();
    const weekRange = buildLocalRangeLastDays(7);
    const hasGetSummary = !!(tracking && typeof tracking.getSummary === 'function');

    const summaryToday = hasGetSummary
      ? (tracking.getSummary({ start_at: todayRange.start.toISOString(), end_at: todayRange.end.toISOString() }) || {})
      : null;

    const summaryWeek = hasGetSummary
      ? (tracking.getSummary({ start_at: weekRange.start.toISOString(), end_at: weekRange.end.toISOString() }) || {})
      : null;

    return {
      available: hasGetSummary,
      source: hasGetSummary ? 'CNTracking.getSummary' : 'indisponível',
      today: summaryToday,
      last7d: summaryWeek,
      todayRange: {
        start_at: todayRange.start.toISOString(),
        end_at: todayRange.end.toISOString(),
      },
      weekRange: {
        start_at: weekRange.start.toISOString(),
        end_at: weekRange.end.toISOString(),
      },
    };
  }

  async function captureLojaOnly() {
    const productsData = await fetchProdutosJson();
    const products = safeArray(productsData.products);
    const activeCount = products.filter((p) => p && p.active !== false).length;
    const trackingSummary = buildStoreSummary();
    const snapshot = {
      captured_at: nowIso(),
      loja_url: location.href,
      produtos_json_updated_at: cleanText(productsData.updated_at || ''),
      total_produtos_catalogo: products.length,
      total_produtos_ativos: activeCount,
      tracking: trackingSummary,
    };
    log(`Loja capturada: catálogo=${products.length}, ativos=${activeCount}.`);
    STATE.storeSnapshot = snapshot;
    updateMetaCounters();
    return snapshot;
  }

  function parseMlMoney(raw) {
    if (typeof raw === 'number') return raw;
    const text = cleanText(raw || '');
    if (!text) return 0;
    const normalized = text.replace(/R\$/i, '').replace(/\./g, '').replace(',', '.').trim();
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  function parseMlNumber(raw) {
    if (typeof raw === 'number') return raw;
    const text = cleanText(raw || '');
    if (!text) return 0;
    const normalized = text.replace(/\./g, '').replace(',', '.').replace(/%/g, '').trim();
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  function findTab(data, label) {
    return safeArray(data?.tabs).find((tab) => normalizeKey(tab?.label) === normalizeKey(label)) || null;
  }

  function parseMlJson(raw) {
    const dataTab = findTab(raw, 'Data');
    const tagsTab = findTab(raw, 'Etiquetas de rastreamento');
    const productsTab = findTab(raw, 'Produtos');
    const categoriesTab = findTab(raw, 'Categorias');
    const audiencesTab = findTab(raw, 'Audiências');
    const nonEffectiveTab = findTab(raw, 'Vendas não efetivadas');

    const dailyRows = safeArray(dataTab?.table?.rows).map((row) => ({
      date: cleanText(row?.[0] || ''),
      clicks: parseMlNumber(row?.[1]),
      units_sold: parseMlNumber(row?.[2]),
      conversion_rate_raw: cleanText(row?.[3] || ''),
      estimated_gain_raw: cleanText(row?.[4] || ''),
      estimated_gain: parseMlMoney(row?.[4]),
    }));

    const tagRows = safeArray(tagsTab?.table?.rows).map((row) => ({
      tracking_label: cleanText(row?.[0] || ''),
      clicks: parseMlNumber(row?.[1]),
      units_sold: parseMlNumber(row?.[2]),
      conversion_rate_raw: cleanText(row?.[3] || ''),
      estimated_gain_raw: cleanText(row?.[4] || ''),
      estimated_gain: parseMlMoney(row?.[4]),
    }));

    const totalClicks = dailyRows.reduce((acc, row) => acc + safeNumber(row.clicks), 0) || tagRows.reduce((acc, row) => acc + safeNumber(row.clicks), 0);
    const totalUnitsSold = dailyRows.reduce((acc, row) => acc + safeNumber(row.units_sold), 0) || tagRows.reduce((acc, row) => acc + safeNumber(row.units_sold), 0);
    const totalEstimatedGain = dailyRows.reduce((acc, row) => acc + safeNumber(row.estimated_gain), 0) || tagRows.reduce((acc, row) => acc + safeNumber(row.estimated_gain), 0);

    const hasGranularProductData = safeArray(productsTab?.table?.rows).length > 0;
    const hasGranularCategoryData = safeArray(categoriesTab?.table?.rows).length > 0;
    const hasAudienceData = safeArray(audiencesTab?.table?.rows).length > 0;

    const diagnostics = {
      tag_count: tagRows.length,
      unique_tags: tagRows.map((row) => row.tracking_label).filter(Boolean),
      has_product_breakdown: hasGranularProductData,
      has_category_breakdown: hasGranularCategoryData,
      has_audience_breakdown: hasAudienceData,
      direct_ml_granularity_level: tagRows.length > 1 || hasGranularProductData ? 'granular' : 'aggregated_single_tag',
      direct_ml_limitation: tagRows.length <= 1 && !hasGranularProductData
        ? 'Hoje o Mercado Livre Direto está agregado em uma única etiqueta; ainda não dá para separar produto/rede/criativo só pelo lado do Afiliados.'
        : '',
    };

    return {
      meta: raw?.meta || {},
      totals: {
        clicks_total: totalClicks,
        units_sold_total: totalUnitsSold,
        estimated_gain_total: totalEstimatedGain,
        conversion_rate_global: totalClicks > 0 ? (totalUnitsSold / totalClicks) : 0,
      },
      daily: dailyRows,
      tracking_labels: tagRows,
      raw_tabs_presence: {
        produtos: !!productsTab,
        categorias: !!categoriesTab,
        etiquetas: !!tagsTab,
        data: !!dataTab,
        audiencias: !!audiencesTab,
        vendas_nao_efetivadas: !!nonEffectiveTab,
      },
      diagnostics,
    };
  }

  function buildTxtReport(merged) {
    const lines = [];
    const now = new Date();
    const loja = merged.loja || {};
    const ml = merged.ml_direto || {};
    const today = loja.summary?.today || {};
    const week = loja.summary?.last7d || {};
    const todayFunnel = today?.funnel || {};
    const weekFunnel = week?.funnel || {};
    const todayTotals = today?.totals || {};
    const weekTotals = week?.totals || {};

    lines.push('RELATÓRIO MESCLADO — LOJA + MERCADO LIVRE DIRETO');
    lines.push(`Gerado em: ${formatDateTimeBR(now)}`);
    lines.push(`Loja: ${cleanText(location.href)}`);
    lines.push(`Catálogo atual: ${safeNumber(loja.total_produtos_catalogo)} produto(s)`);
    lines.push(`Produtos ativos: ${safeNumber(loja.total_produtos_ativos)}`);
    lines.push(`Updated_at da vitrine: ${cleanText(loja.produtos_json_updated_at || '') || 'n/d'}`);
    lines.push('');

    lines.push('BLOCO 1 — INTELIGÊNCIA DA LOJA');
    lines.push(`Fonte: ${cleanText(loja.summary?.source || 'indisponível')}`);
    if (!loja.summary?.available) {
      lines.push('- CNTracking.getSummary não está disponível nesta página.');
      lines.push('');
    } else {
      lines.push('HOJE');
      lines.push(`- Eventos filtrados: ${safeNumber(todayTotals.filtered_events)}`);
      lines.push(`- Views de produto: ${safeNumber(todayFunnel.view_product_card)}`);
      lines.push(`- Cliques comprar: ${safeNumber(todayFunnel.click_buy)}`);
      lines.push(`- Cliques copiar ID: ${safeNumber(todayFunnel.click_copy_id)}`);
      lines.push(`- Cliques copiar link: ${safeNumber(todayFunnel.click_copy_link)}`);
      lines.push(`- Cliques abrir loja: ${safeNumber(todayFunnel.click_open_store)}`);
      lines.push('');
      lines.push('ÚLTIMOS 7 DIAS');
      lines.push(`- Eventos filtrados: ${safeNumber(weekTotals.filtered_events)}`);
      lines.push(`- Views de produto: ${safeNumber(weekFunnel.view_product_card)}`);
      lines.push(`- Cliques comprar: ${safeNumber(weekFunnel.click_buy)}`);
      lines.push(`- Cliques copiar ID: ${safeNumber(weekFunnel.click_copy_id)}`);
      lines.push(`- Cliques copiar link: ${safeNumber(weekFunnel.click_copy_link)}`);
      lines.push(`- Cliques abrir loja: ${safeNumber(weekFunnel.click_open_store)}`);
      lines.push('');
      lines.push(...buildStoreDecisionLines(week));
    }

    lines.push('BLOCO 2 — MERCADO LIVRE DIRETO');
    lines.push(`- Cliques diretos totais (7 dias): ${safeNumber(ml.totals?.clicks_total)}`);
    lines.push(`- Unidades vendidas diretas: ${safeNumber(ml.totals?.units_sold_total)}`);
    lines.push(`- Ganho estimado direto: ${formatMoneyBR(safeNumber(ml.totals?.estimated_gain_total))}`);
    lines.push(`- Conversão global direta: ${formatPercentBR(safeNumber(ml.totals?.conversion_rate_global))}`);
    lines.push(`- Etiquetas rastreadas: ${safeNumber(ml.diagnostics?.tag_count)}`);
    if (cleanText(ml.diagnostics?.direct_ml_limitation)) {
      lines.push(`- Limitação atual: ${cleanText(ml.diagnostics.direct_ml_limitation)}`);
    }
    lines.push('');
    lines.push('Etiquetas do ML Direto:');
    if (!safeArray(ml.tracking_labels).length) {
      lines.push('- sem dados');
    } else {
      ml.tracking_labels.forEach((row, idx) => {
        lines.push(`- Etiqueta #${idx + 1}: ${row.tracking_label || 'sem nome'} | cliques=${safeNumber(row.clicks)} | unidades=${safeNumber(row.units_sold)} | ganho=${row.estimated_gain_raw || formatMoneyBR(row.estimated_gain)}`);
      });
    }
    lines.push('');
    lines.push('Série diária do ML Direto:');
    if (!safeArray(ml.daily).length) {
      lines.push('- sem dados');
    } else {
      ml.daily.forEach((row) => {
        lines.push(`- ${row.date}: cliques=${safeNumber(row.clicks)} | unidades=${safeNumber(row.units_sold)} | ganho=${row.estimated_gain_raw || formatMoneyBR(row.estimated_gain)}`);
      });
    }
    lines.push('');

    lines.push('LEITURA EXECUTIVA');
    lines.push('- Hoje a loja mede produto, criativo, título, rede, formato e placement quando o usuário passa pela vitrine.');
    lines.push('- O Mercado Livre Direto já mede cliques reais, mas no seu caso ainda está agregado em uma única etiqueta.');
    lines.push('- Então, neste momento, o relatório mais confiável é: Loja detalhada + ML Direto agregado.');
    lines.push('- Antes do primeiro tráfego pago, use o campeão da loja para escolher produto/criativo/título; e use o ML Direto para validar se o volume geral de clique existe.');
    lines.push('');

    return lines.join('\n').trim() + '\n';
  }

  async function generateMergedReport() {
    if (!STATE.mlJson) {
      throw new Error('Carregue primeiro o JSON do Mercado Livre Afiliados.');
    }

    const lojaSnapshot = STATE.storeSnapshot || await captureLojaOnly();
    const parsedMl = parseMlJson(STATE.mlJson);

    const merged = {
      meta: {
        version: VERSION,
        app: 'CN Loja + ML Merge Report',
        generated_at: nowIso(),
        loja_url: location.href,
      },
      loja: {
        captured_at: lojaSnapshot.captured_at,
        produtos_json_updated_at: lojaSnapshot.produtos_json_updated_at,
        total_produtos_catalogo: lojaSnapshot.total_produtos_catalogo,
        total_produtos_ativos: lojaSnapshot.total_produtos_ativos,
        summary: lojaSnapshot.tracking,
      },
      ml_direto: parsedMl,
    };

    merged.report_text = buildTxtReport(merged);
    STATE.merged = merged;
    qs(`#${APP_ID}-last`).textContent = formatDateTimeBR(merged.meta.generated_at);
    updateMetaCounters();
    toggleRunningButtons(false);
    log('Relatório mesclado gerado com sucesso.');
    downloadText(merged.report_text, buildFilename('relatorio_loja_ml', 'txt'));
  }

  function updateMetaCounters() {
    if (STATE.storeSnapshot) {
      qs(`#${APP_ID}-loja`).textContent = `${safeNumber(STATE.storeSnapshot.total_produtos_ativos)}/${safeNumber(STATE.storeSnapshot.total_produtos_catalogo)} ativos`;
    }
    if (STATE.mlJson) {
      const parsed = parseMlJson(STATE.mlJson);
      qs(`#${APP_ID}-mldirect`).textContent = `${safeNumber(parsed.totals.clicks_total)} cliques / ${safeNumber(parsed.diagnostics.tag_count)} etiqueta(s)`;
    }
    ['download-json', 'download-txt', 'copy'].forEach((suffix) => {
      const button = qs(`#${APP_ID}-${suffix}`);
      if (button) button.disabled = !STATE.merged;
    });
  }

  function sanityCheckPage() {
    const host = location.host;
    if (/projetoscosanostra\.github\.io$/i.test(host)) return true;
    const body = cleanText(document.body?.innerText || '');
    return /produto do dia|inteligencia e relatorios|relatorio inteligente|navegacao comercial/i.test(body);
  }

  function bootstrap() {
    if (!sanityCheckPage()) {
      throw new Error('Abra a loja/vitrine antes de usar este merge report.');
    }
    ensurePanel();
    toggleRunningButtons(false);
    log('Merge report pronto. Carregue o JSON do ML e depois clique em “Gerar relatório mesclado”.');
    window.CNMLLojaMergeReport = {
      version: VERSION,
      state: STATE,
      captureLojaOnly,
      parseMlJson,
      generateMergedReport,
      getLastMerged: () => STATE.merged,
    };
  }

  bootstrap();
})();
