import { promises as fs } from 'node:fs';
import process from 'node:process';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--') || argv[i + 1] === undefined) throw new Error(`Invalid argument near ${key}`);
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv);
const url = args.url;
const output = args.output;
const width = Number(args.width);
const height = Number(args.height);
const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
if (!url || !output || !Number.isInteger(width) || !Number.isInteger(height)) {
  throw new Error('Usage: node capture_cdp.mjs --url <url> --width <px> --height <px> --output <png>');
}

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitForChrome() {
  let last;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${endpoint}/json/version`); if (r.ok) return; last = `HTTP ${r.status}`; }
    catch (e) { last = e.message; }
    await sleep(125);
  }
  throw new Error(`Chrome DevTools endpoint unavailable: ${last}`);
}
await waitForChrome();
const targetResponse = await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
if (!targetResponse.ok) throw new Error(`Could not create Chrome target: HTTP ${targetResponse.status}`);
const target = await targetResponse.json();
if (!target.webSocketDebuggerUrl) throw new Error('Chrome target missing webSocketDebuggerUrl');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const waiters = new Map();
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id) {
    const item = pending.get(msg.id);
    if (!item) return;
    pending.delete(msg.id);
    if (msg.error) item.reject(new Error(`${item.method}: ${msg.error.message}`));
    else item.resolve(msg.result || {});
    return;
  }
  const list = waiters.get(msg.method);
  if (list?.length) list.shift()(msg.params || {});
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function once(method, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), timeoutMs);
    const wrapped = params => { clearTimeout(timer); resolve(params); };
    const list = waiters.get(method) || [];
    list.push(wrapped);
    waiters.set(method, list);
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: false,
  screenWidth: width, screenHeight: height,
  positionX: 0, positionY: 0, dontSetVisibleSize: false,
});
try { await send('Emulation.setScrollbarsHidden', { hidden: true }); } catch {}

const loaded = once('Page.loadEventFired');
const nav = await send('Page.navigate', { url });
if (nav.errorText) throw new Error(`Navigation failed: ${nav.errorText}`);
await loaded;
await send('Runtime.evaluate', {
  expression: `(async()=>{await document.fonts?.ready;await Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {innerWidth,innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};})()`,
  awaitPromise: true,
  returnByValue: true,
});

const metrics = await send('Runtime.evaluate', {
  expression: `({innerWidth,innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})`,
  returnByValue: true,
});
const m = metrics.result?.value || {};
if (m.innerWidth !== width || m.innerHeight !== height || m.dpr !== 1) {
  throw new Error(`Viewport mismatch: expected ${width}x${height}@1, got ${m.innerWidth}x${m.innerHeight}@${m.dpr}`);
}

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
});
if (!shot.data) throw new Error('Chrome returned empty screenshot');
await fs.writeFile(output, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ output, width, height, metrics: m }));

try { await fetch(`${endpoint}/json/close/${target.id}`); } catch {}
try { ws.close(); } catch {}
