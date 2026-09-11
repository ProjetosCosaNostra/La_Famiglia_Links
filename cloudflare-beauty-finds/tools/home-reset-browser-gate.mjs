import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const shots = path.join(root, 'artifacts', 'home-reset-v1');
await fs.mkdir(shots, { recursive: true });

const types = new Map([['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.webp','image/webp'],['.png','image/png'],['.svg','image/svg+xml']]);
const server = createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//,'');
    const file = path.join(dist, rel);
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types.get(path.extname(file)) || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless:true });
const cases = [
  { name:'canonical-1448x1086', width:1448, height:1086, exactHeight:1086 },
  { name:'wide-1914x815', width:1914, height:815 },
  { name:'mobile-390x844', width:390, height:844 }
];
const report = [];
let failed = false;
for (const item of cases) {
  const page = await browser.newPage({ viewport:{ width:item.width, height:item.height }, deviceScaleFactor:1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts?.ready);
  const metrics = await page.evaluate(() => {
    const box = sel => { const r=document.querySelector(sel)?.getBoundingClientRect(); return r ? { width:r.width, height:r.height, top:r.top, bottom:r.bottom } : null; };
    return {
      innerWidth, innerHeight,
      scrollWidth:document.documentElement.scrollWidth,
      scrollHeight:document.documentElement.scrollHeight,
      header:box('.header'), hero:box('.hero'), catalogue:box('.catalogue'), eco:box('.eco'), footer:box('.footer'),
      styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.getAttribute('href')).filter(Boolean)
    };
  });
  if (metrics.scrollWidth !== item.width) { failed=true; errors.push(`horizontal overflow: ${metrics.scrollWidth} vs ${item.width}`); }
  if (item.exactHeight && metrics.scrollHeight !== item.exactHeight) { failed=true; errors.push(`canonical height: ${metrics.scrollHeight} vs ${item.exactHeight}`); }
  if (item.width >= 761) {
    for (const [key,expected] of Object.entries({header:49,hero:362,catalogue:443,eco:172,footer:60})) {
      const actual = Math.round(metrics[key]?.height || 0);
      if (actual !== expected) { failed=true; errors.push(`${key} height ${actual} vs ${expected}`); }
    }
  }
  if (page.url().includes('404')) { failed=true; errors.push('navigation failed'); }
  await page.screenshot({ path:path.join(shots, `${item.name}.png`), fullPage:item.name === 'canonical-1448x1086' });
  report.push({ ...item, metrics, errors });
  await page.close();
}
await browser.close();
server.close();
await fs.writeFile(path.join(shots, 'report.json'), JSON.stringify(report,null,2), 'utf8');
console.log(JSON.stringify(report,null,2));
if (failed || report.some(x => x.errors.length)) process.exit(1);
