(() => {
  'use strict';

  const VERSION = '1.0.0';
  const APP_ID = 'cn-ml-affiliados-bridge';
  const PANEL_ID = `${APP_ID}-panel`;
  const STYLE_ID = `${APP_ID}-style`;
  const STATE = {
    lastCapture: null,
    running: false,
    logs: [],
  };

  const TAB_LABELS = [
    'Produtos',
    'Categorias',
    'Etiquetas de rastreamento',
    'Data',
    'Audiências',
    'Vendas não efetivadas',
  ];

  const SUMMARY_LABELS = [
    'Cliques',
    'Compradores totais',
    'Pedidos estimados',
    'Produtos estimados',
    'Vendas totais',
    'Vendas não efetivadas',
    'Vendas estimadas',
    'Ganho estimado',
  ];

  const SELECTORS = {
    buttons: 'button, [role="button"], a',
    tables: 'table',
    cells: 'th, td',
    textInputs: 'input, textarea, select',
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

  function normalizeKey(value) {
    return normalizeSpaces(value)
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

  function safeText(el) {
    return normalizeSpaces(el?.innerText || el?.textContent || '');
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
    console[type === 'error' ? 'error' : 'log'](`[CN ML Bridge] ${message}`);
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
        width: 360px;
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
      #${APP_ID}-footer button {
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
      }
      #${APP_ID}-actions button:hover,
      #${APP_ID}-footer button:hover {
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
        min-height: 92px;
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
        display: flex;
        gap: 8px;
        padding: 0 14px 14px;
      }
      #${APP_ID}-footer button {
        flex: 1;
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
          <strong>CN ML Afiliados Bridge</strong>
          <span>Captura Produtos • Categorias • Etiquetas • Data • Audiências</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button id="${APP_ID}-minimize" title="Minimizar">—</button>
          <button id="${APP_ID}-close" title="Fechar">×</button>
        </div>
      </div>
      <div id="${APP_ID}-body">
        <div id="${APP_ID}-actions">
          <button id="${APP_ID}-capture-current">Capturar aba atual</button>
          <button id="${APP_ID}-capture-all">Capturar tudo</button>
        </div>
        <div id="${APP_ID}-meta">
          <div class="${APP_ID}-chip"><span class="label">Período</span><span class="value" id="${APP_ID}-period">—</span></div>
          <div class="${APP_ID}-chip"><span class="label">Última captura</span><span class="value" id="${APP_ID}-last">—</span></div>
        </div>
        <pre id="${APP_ID}-log">Bridge carregado. Use “Capturar tudo”.</pre>
        <div id="${APP_ID}-footer">
          <button id="${APP_ID}-download" disabled>Baixar último JSON</button>
          <button id="${APP_ID}-copy" disabled>Copiar JSON</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    qs(`#${APP_ID}-minimize`).addEventListener('click', () => {
      qs(`#${APP_ID}-body`).classList.toggle('hidden');
    });

    qs(`#${APP_ID}-close`).addEventListener('click', () => {
      panel.remove();
    });

    qs(`#${APP_ID}-capture-current`).addEventListener('click', async () => {
      await runSafe(async () => {
        const result = await captureCurrentTabOnly();
        STATE.lastCapture = result;
        syncPanelMeta();
        enableExports(true);
        downloadJson(result, buildFilename('current'));
      });
    });

    qs(`#${APP_ID}-capture-all`).addEventListener('click', async () => {
      await runSafe(async () => {
        const result = await captureAllTabs();
        STATE.lastCapture = result;
        syncPanelMeta();
        enableExports(true);
        downloadJson(result, buildFilename('full'));
      });
    });

    qs(`#${APP_ID}-download`).addEventListener('click', () => {
      if (!STATE.lastCapture) return;
      downloadJson(STATE.lastCapture, buildFilename('full'));
    });

    qs(`#${APP_ID}-copy`).addEventListener('click', async () => {
      if (!STATE.lastCapture) return;
      const text = JSON.stringify(STATE.lastCapture, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        log('JSON copiado para a área de transferência.');
      } catch (error) {
        log(`Falha ao copiar JSON: ${error.message || error}`, 'error');
      }
    });
  }

  function enableExports(enabled) {
    const downloadBtn = qs(`#${APP_ID}-download`);
    const copyBtn = qs(`#${APP_ID}-copy`);
    if (downloadBtn) downloadBtn.disabled = !enabled;
    if (copyBtn) copyBtn.disabled = !enabled;
  }

  function syncPanelMeta() {
    const periodEl = qs(`#${APP_ID}-period`);
    const lastEl = qs(`#${APP_ID}-last`);
    if (periodEl) periodEl.textContent = detectSelectedPeriod() || '—';
    if (lastEl) lastEl.textContent = STATE.lastCapture ? new Date().toLocaleString('pt-BR') : '—';
  }

  async function runSafe(fn) {
    if (STATE.running) {
      log('Já existe uma captura em execução. Aguarde terminar.');
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
    ['capture-current', 'capture-all', 'download', 'copy'].forEach((suffix) => {
      const button = qs(`#${APP_ID}-${suffix}`);
      if (!button) return;
      if (suffix === 'download' || suffix === 'copy') {
        if (!STATE.lastCapture) {
          button.disabled = true;
          return;
        }
      }
      button.disabled = isRunning;
    });
  }

  function buildFilename(kind) {
    return `ml_afiliados_${kind}_${timestampFile()}.json`;
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

  function extractPageMeta() {
    return {
      version: VERSION,
      app: 'CN ML Afiliados Bridge',
      captured_at: nowIso(),
      url: location.href,
      title: document.title,
      host: location.host,
      path: location.pathname,
      period: detectSelectedPeriod(),
      updated_text: detectUpdatedText(),
      user_context: detectUserContext(),
    };
  }

  function detectUserContext() {
    const candidates = qsa('*')
      .filter(visible)
      .map((el) => safeText(el))
      .filter(Boolean);

    const match = candidates.find((text) => /enviar para /i.test(text));
    return match || '';
  }

  function detectSelectedPeriod() {
    const selects = qsa('select').filter(visible);
    for (const select of selects) {
      const text = safeText(select);
      if (/últimos|dias|hoje|ontem|semana|mês/i.test(text)) return text;
      const option = select.selectedOptions?.[0];
      const optionText = normalizeSpaces(option?.textContent || '');
      if (/últimos|dias|hoje|ontem|semana|mês/i.test(optionText)) return optionText;
    }

    const candidates = qsa('*')
      .filter(visible)
      .map((el) => safeText(el))
      .filter((text) => /últimos|dias|hoje|ontem|semana|mês/i.test(text));

    return candidates[0] || '';
  }

  function detectUpdatedText() {
    const candidates = qsa('*')
      .filter(visible)
      .map((el) => safeText(el))
      .filter((text) => /^Dados atualizados em /i.test(text));

    return candidates[0] || '';
  }

  function parseNumeric(text) {
    const raw = normalizeSpaces(text);
    if (!raw) return null;

    if (/^R\$/i.test(raw)) {
      const normalized = raw
        .replace(/R\$/i, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
      const value = Number(normalized);
      return Number.isFinite(value) ? value : null;
    }

    if (/^-?\d+[\d\.]*,\d+%?$/.test(raw) || /^-?\d+[\d\.]*%$/.test(raw)) {
      const normalized = raw.replace(/%/g, '').replace(/\./g, '').replace(',', '.');
      const value = Number(normalized);
      return Number.isFinite(value) ? value : null;
    }

    const clean = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const value = Number(clean);
    return Number.isFinite(value) ? value : null;
  }

  function findMetricValueByLabel(label) {
    const labelNorm = normalizeKey(label);
    const texts = qsa('*')
      .filter(visible)
      .filter((el) => normalizeKey(safeText(el)) === labelNorm);

    for (const el of texts) {
      const card = closestUsefulCard(el);
      if (!card) continue;
      const textsInCard = qsa('*', card)
        .filter(visible)
        .map((node) => safeText(node))
        .filter(Boolean);

      const candidate = textsInCard.find((text) => {
        if (normalizeKey(text) === labelNorm) return false;
        return /^R\$/.test(text) || /^\d+[\d.,%]*$/.test(text) || /^\d+\s*%/.test(text);
      });

      if (candidate) {
        return {
          label,
          raw: candidate,
          parsed: parseNumeric(candidate),
          card_text: safeText(card).slice(0, 500),
        };
      }
    }

    return {
      label,
      raw: '',
      parsed: null,
      card_text: '',
    };
  }

  function closestUsefulCard(el) {
    let current = el;
    for (let i = 0; i < 6 && current; i += 1) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 180 && rect.height > 60) return current;
      current = current.parentElement;
    }
    return el.parentElement || el;
  }

  function extractSummary() {
    const metrics = {};
    for (const label of SUMMARY_LABELS) {
      metrics[label] = findMetricValueByLabel(label);
    }

    const gains = extractGainBreakdown();

    return {
      metrics,
      gains,
    };
  }

  function extractGainBreakdown() {
    const section = qsa('*')
      .filter(visible)
      .find((el) => normalizeKey(safeText(el)) === normalizeKey('Detalhe dos ganhos'));

    if (!section) return [];
    const container = closestUsefulCard(section);
    const chunks = qsa('*', container)
      .filter(visible)
      .map((el) => safeText(el))
      .filter(Boolean);

    const result = [];
    for (let i = 0; i < chunks.length; i += 1) {
      if (/parceria/i.test(chunks[i])) {
        const next = chunks[i + 1] || '';
        result.push({
          label: chunks[i],
          raw: next,
          parsed: parseNumeric(next),
        });
      }
    }
    return result;
  }

  function findTabs() {
    const buttons = qsa(SELECTORS.buttons)
      .filter(visible)
      .map((el) => ({
        el,
        text: safeText(el),
        key: normalizeKey(safeText(el)),
      }));

    const tabs = [];
    for (const label of TAB_LABELS) {
      const key = normalizeKey(label);
      const match = buttons.find((item) => item.key === key);
      if (match) tabs.push({ label, el: match.el });
    }
    return tabs;
  }

  function getActiveTabLabel() {
    const tabs = findTabs();
    for (const tab of tabs) {
      const el = tab.el;
      const ariaSelected = el.getAttribute('aria-selected');
      const classText = `${el.className || ''} ${el.parentElement?.className || ''}`;
      if (ariaSelected === 'true' || /active|selected|current/i.test(classText)) return tab.label;
    }
    return tabs[0]?.label || 'Produtos';
  }

  async function activateTab(label) {
    const target = findTabs().find((tab) => normalizeKey(tab.label) === normalizeKey(label));
    if (!target) throw new Error(`Aba não encontrada: ${label}`);

    log(`Abrindo aba: ${label}`);
    target.el.click();
    await waitForTabSettle(label);
    return target.el;
  }

  async function waitForTabSettle(label) {
    const start = Date.now();
    let lastSignature = '';
    let stableTicks = 0;

    while (Date.now() - start < 12000) {
      const signature = buildPageSignature(label);
      if (signature === lastSignature && signature) {
        stableTicks += 1;
      } else {
        stableTicks = 0;
        lastSignature = signature;
      }

      if (stableTicks >= 3) {
        await sleep(250);
        return true;
      }
      await sleep(350);
    }

    return false;
  }

  function buildPageSignature(label) {
    const table = findVisibleTable();
    const bodyText = table ? safeText(table) : '';
    return `${label}::${bodyText.slice(0, 1200)}::${detectSelectedPeriod()}`;
  }

  function findVisibleTable() {
    const tables = qsa(SELECTORS.tables).filter(visible);
    if (!tables.length) return null;

    const scored = tables.map((table) => {
      const text = safeText(table);
      const score = (text.match(/\n/g) || []).length + qsa('tr', table).length * 2 + qsa('td, th', table).length;
      return { table, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.table || null;
  }

  function extractTableData() {
    const table = findVisibleTable();
    const emptyState = detectEmptyState();

    if (!table) {
      return {
        columns: [],
        rows: [],
        row_count: 0,
        empty_state: emptyState || 'Tabela não encontrada',
      };
    }

    const headerRow = qs('thead tr', table) || qsa('tr', table).find((row) => qsa('th', row).length > 0) || null;
    const columns = headerRow
      ? qsa('th, td', headerRow).map((cell) => safeText(cell)).filter(Boolean)
      : [];

    const bodyRows = qsa('tbody tr', table).length
      ? qsa('tbody tr', table)
      : qsa('tr', table).filter((row) => row !== headerRow);

    const rows = bodyRows
      .filter((row) => visible(row))
      .map((row) => qsa('td, th', row).map((cell) => safeText(cell)).filter(Boolean))
      .filter((row) => row.length > 0);

    return {
      columns,
      rows,
      row_count: rows.length,
      empty_state: rows.length ? '' : emptyState,
    };
  }

  function detectEmptyState() {
    const candidates = qsa('*')
      .filter(visible)
      .map((el) => safeText(el))
      .filter((text) => /nenhum dado registrado para este período/i.test(text));
    return candidates[0] || '';
  }

  function extractFiltersSnapshot() {
    const filters = [];
    qsa(SELECTORS.textInputs)
      .filter(visible)
      .forEach((el) => {
        const labelText = detectFieldLabel(el);
        const value = el.tagName === 'SELECT'
          ? normalizeSpaces(el.selectedOptions?.[0]?.textContent || el.value || '')
          : normalizeSpaces(el.value || '');

        if (!labelText && !value) return;
        filters.push({
          label: labelText,
          value,
          name: el.name || '',
          type: el.type || el.tagName.toLowerCase(),
        });
      });
    return filters;
  }

  function detectFieldLabel(el) {
    const label = el.labels?.[0];
    if (label) return safeText(label);

    const id = el.id;
    if (id) {
      const explicit = qs(`label[for="${CSS.escape(id)}"]`);
      if (explicit) return safeText(explicit);
    }

    const parent = el.closest('label');
    if (parent) return safeText(parent).replace(safeText(el), '').trim();

    const container = el.parentElement;
    if (!container) return '';
    const texts = qsa('*', container)
      .filter(visible)
      .map((node) => safeText(node))
      .filter(Boolean);
    return texts.find((text) => text !== normalizeSpaces(el.value || '') && text.length < 80) || '';
  }

  async function captureActiveTabSnapshot(label) {
    await sleep(400);
    const table = extractTableData();
    const snapshot = {
      label,
      captured_at: nowIso(),
      active_tab_detected: getActiveTabLabel(),
      table,
      filters: extractFiltersSnapshot(),
    };
    log(`Aba capturada: ${label} (${table.row_count} linha(s)).`);
    return snapshot;
  }

  async function captureCurrentTabOnly() {
    log('Iniciando captura da aba atual.');
    const meta = extractPageMeta();
    const active = getActiveTabLabel();
    const summary = extractSummary();
    const currentTab = await captureActiveTabSnapshot(active);

    const payload = {
      meta,
      summary,
      tabs: [currentTab],
      capture_mode: 'current_tab',
      notes: [
        'Este JSON representa somente a aba ativa no momento da captura.',
        'Use a captura completa para montar o cruzamento com a loja depois.',
      ],
    };

    log('Captura da aba atual concluída.');
    return payload;
  }

  async function captureAllTabs() {
    log('Iniciando captura completa das métricas do Afiliados.');
    const meta = extractPageMeta();
    const summary = extractSummary();
    const originalTab = getActiveTabLabel();
    const tabs = [];

    for (const label of TAB_LABELS) {
      try {
        await activateTab(label);
        tabs.push(await captureActiveTabSnapshot(label));
      } catch (error) {
        tabs.push({
          label,
          captured_at: nowIso(),
          error: error.message || String(error),
          table: { columns: [], rows: [], row_count: 0, empty_state: '' },
          filters: extractFiltersSnapshot(),
        });
        log(`Falha ao capturar aba ${label}: ${error.message || error}`, 'error');
      }
    }

    if (originalTab && originalTab !== getActiveTabLabel()) {
      try {
        await activateTab(originalTab);
      } catch (error) {
        log(`Não foi possível restaurar a aba original (${originalTab}).`, 'error');
      }
    }

    const payload = {
      meta,
      summary,
      tabs,
      capture_mode: 'all_tabs',
      notes: [
        'JSON bruto das métricas do Mercado Livre Afiliados.',
        'Próxima etapa: cruzar com sku, id_busca, open_url e short_url do produtos.json.',
        'Este arquivo não depende da loja e não adiciona barreira entre cliente e produto.',
      ],
    };

    log('Captura completa concluída.');
    return payload;
  }

  function sanityCheckPage() {
    const hostOk = /mercadolivre\.com\.br$/i.test(location.host);
    const text = document.body ? safeText(document.body) : '';
    const metricsOk = /métricas/i.test(text) && /rendimento geral|etiquetas de rastreamento/i.test(text);
    return hostOk && metricsOk;
  }

  function bootstrap() {
    if (!sanityCheckPage()) {
      throw new Error('Abra a página de Métricas do Mercado Livre Afiliados antes de usar este bridge.');
    }

    ensurePanel();
    syncPanelMeta();
    enableExports(false);
    log('Bridge pronto. Clique em “Capturar tudo”.');
    window.CNMLBridge = {
      version: VERSION,
      state: STATE,
      captureCurrentTabOnly,
      captureAllTabs,
      extractPageMeta,
      extractSummary,
      downloadJson,
      getLastCapture: () => STATE.lastCapture,
    };
  }

  bootstrap();
})();
