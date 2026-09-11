import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const css = await fs.readFile(path.join(root, 'home-reset-v1.css'), 'utf8');
const failures = [];

const localCss = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/g)]
  .map(m => m[0]).filter(tag => !tag.includes('fonts.googleapis.com'));
if (localCss.length !== 1 || !localCss[0].includes('home-reset-v1.css')) failures.push(`expected 1 local stylesheet, found ${localCss.length}`);
if (/blackgold-v\d|authority-mobile|mobile-v46|mockup-lock/i.test(html)) failures.push('legacy visual layer referenced by Home');
if (css.includes('!important')) failures.push('!important is forbidden');
if (/html\s*,\s*body[^{}]*\{[^}]*overflow\s*:\s*hidden/i.test(css)) failures.push('desktop document overflow is locked');

for (const [selector, height] of [['.header',49],['.hero',362],['.catalogue',443],['.eco',172],['.footer',60]]) {
  const escaped = selector.replace('.', '\\.');
  const match = css.match(new RegExp(`${escaped}\\{[^}]*height:${height}px`, 'i'));
  if (!match) failures.push(`${selector} canonical height ${height}px missing`);
}
const canonicalTotal = 49 + 362 + 443 + 172 + 60;
if (canonicalTotal !== 1086) failures.push(`canonical height math changed: ${canonicalTotal}`);

for (const token of ['Curadoria feminina','Seleção do Dia','Vitrine Premium','Ecossistema']) {
  if (!html.includes(token)) failures.push(`required visual token missing: ${token}`);
}
for (const asset of ['header-lockup.webp','hero-photo.webp','eco-center.webp','ysl-loulou.webp','lancome-creme.webp','swarovski-brinco.webp']) {
  if (!html.includes(asset) && !css.includes(asset)) failures.push(`approved reset asset not referenced: ${asset}`);
}

if (failures.length) {
  console.error('HOME RESET GATE: FAIL');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`HOME RESET GATE: PASS | canonical=1448x1086 | single-css=${localCss.length} | important=0 | approved-assets=6`);
