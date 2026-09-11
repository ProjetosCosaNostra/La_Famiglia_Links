import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });

const publicFiles = [
  'index.html', 'home-reset-v1.css', 'home-reset-v1.js',
  'styles.css', 'app.js', 'admin.html', 'admin.js',
  'mercadolivre-callback.html', '_headers'
];
for (const file of publicFiles) {
  try { await fs.copyFile(path.join(here, file), path.join(out, file)); } catch (error) {
    if (['index.html','home-reset-v1.css','home-reset-v1.js'].includes(file)) throw error;
  }
}

await fs.cp(path.join(here, 'approved-home'), path.join(out, 'approved-home'), { recursive: true });
await fs.cp(path.join(here, 'reset-assets'), path.join(out, 'reset-assets'), { recursive: true });
await fs.copyFile(path.join(here, 'hero-approved.webp'), path.join(out, 'hero-approved.webp'));
for (const asset of ['logo-cn-round.png','logo-cn-square.png']) {
  await fs.copyFile(path.join(root, 'assets', asset), path.join(out, 'assets', asset));
}

const productsRaw = JSON.parse(await fs.readFile(path.join(root, 'produtos.json'), 'utf8'));
const activeProducts = (Array.isArray(productsRaw) ? productsRaw : productsRaw.products || []).filter(p => p && p.active !== false);
let dailySelection = { campaign_id: 'organic', selected: [] };
try { dailySelection = JSON.parse(await fs.readFile(path.join(root, 'data', 'daily_selection.json'), 'utf8')); } catch {}
const dailyRows = Array.isArray(dailySelection.selected) ? dailySelection.selected : [];
const dailyBySku = new Map(dailyRows.map(row => [String(row?.sku || ''), row]));
const products = activeProducts.map(p => ({
  sku: p.sku || '', title: p.title || 'BlackGold Find',
  category: p.categoria_principal || 'Beleza',
  price: p.price_text || p.preco_atual || p.price_current || p.price || '',
  description: p.descricao_curta || p.short_description || p.description || p.notes || '',
  card_image: p.card_image || (Array.isArray(p.images) ? p.images[0] : '') || p.image || p.image_original || '',
  url: p.active_affiliate_url || p.open_url || p.short_url || p.canonical_url || p.check_url || '#',
  daily_position: Number(dailyBySku.get(String(p.sku || ''))?.position || 0)
}));
await fs.writeFile(path.join(out, 'catalog.json'), JSON.stringify({ updated_at:new Date().toISOString(), total_active:activeProducts.length, products }), 'utf8');
await fs.writeFile(path.join(out, 'daily-selection.json'), JSON.stringify({ campaign_id:dailySelection.campaign_id || 'organic', date:dailySelection.date || '', selected:dailyRows.map(row => ({ sku:row.sku || '', position:Number(row.position || 0) })) }), 'utf8');

const home = await fs.readFile(path.join(out, 'index.html'), 'utf8');
const stylesheetLinks = [...home.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/g)].map(match => match[0]).filter(tag => !tag.includes('fonts.googleapis.com'));
if (stylesheetLinks.length !== 1 || !stylesheetLinks[0].includes('home-reset-v1.css')) throw new Error(`Home must load exactly one local stylesheet; found ${stylesheetLinks.length}`);
if (home.includes('blackgold-v') || home.includes('authority-mobile') || home.includes('mobile-v46')) throw new Error('Legacy visual layer leaked into Home reset');
const css = await fs.readFile(path.join(out, 'home-reset-v1.css'), 'utf8');
if (css.includes('!important')) throw new Error('Home reset forbids !important');
if (/html\s*,\s*body[^{}]*\{[^}]*overflow\s*:\s*hidden/i.test(css)) throw new Error('Desktop document overflow lock is forbidden');
for (const asset of ['header-lockup.webp','hero-photo.webp','eco-center.webp','ysl-loulou.webp','lancome-creme.webp','swarovski-brinco.webp']) {
  await fs.access(path.join(out, 'reset-assets', asset));
}

console.log(`BlackGold Home Reset V1 ready: single CSS, ${products.length} catalogue records preserved backend-only.`);
