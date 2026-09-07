import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });

const publicFiles = [
  'index.html',
  'destaque.html',
  'vitrine.html',
  'ecossistema.html',
  'blackgold-v9.css',
  'blackgold-v9.js',
  'blackgold-v10-overrides.css',
  'styles.css',
  'app.js',
  'admin.html',
  'admin.js',
  'mercadolivre-callback.html',
  '_headers'
];

for (const file of publicFiles) {
  await fs.copyFile(path.join(here, file), path.join(out, file));
}

// V10 fidelity layer over the stable V9 markup. Public product slots remain clean
// placeholders until new products are created in the administration flow.
await fs.cp(path.join(here, 'approved-home'), path.join(out, 'approved-home'), { recursive: true });
await fs.cp(path.join(here, 'approved-v5'), path.join(out, 'approved-v5'), { recursive: true });
await fs.copyFile(path.join(here, 'hero-approved.webp'), path.join(out, 'hero-approved.webp'));

// Reuse only assets that already exist in the repository. This avoids resurrecting
// the broken product-image directory and guarantees a uniform temporary placeholder.
for (const asset of ['logo-cn-round.png', 'logo-cn-square.png']) {
  const src = path.join(root, 'assets', asset);
  const dest = path.join(out, 'assets', asset);
  try { await fs.copyFile(src, dest); } catch {}
}

// The stable V9 markup referenced generated asset names that are not part of source.
// Patch only the DIST package to known-good institutional files already versioned.
for (const page of ['index.html','destaque.html','vitrine.html','ecossistema.html']) {
  const file = path.join(out, page);
  let html = await fs.readFile(file, 'utf8');
  html = html
    .replaceAll('./assets/header-lockup-v9.webp', './approved-v5/header-lockup.webp')
    .replaceAll('./assets/product-placeholder-v9.webp', './assets/logo-cn-square.png');
  await fs.writeFile(file, html, 'utf8');
}

try { await fs.copyFile(path.join(root, 'ecosystem.json'), path.join(out, 'ecosystem.json')); }
catch { await fs.writeFile(path.join(out, 'ecosystem.json'), JSON.stringify({}), 'utf8'); }

const productsRaw = JSON.parse(await fs.readFile(path.join(root, 'produtos.json'), 'utf8'));
const activeProducts = (Array.isArray(productsRaw) ? productsRaw : productsRaw.products || []).filter(p => p && p.active !== false);
let dailySelection = { campaign_id: 'organic', selected: [] };
try { dailySelection = JSON.parse(await fs.readFile(path.join(root, 'data', 'daily_selection.json'), 'utf8')); } catch {}
const dailyRows = Array.isArray(dailySelection.selected) ? dailySelection.selected : [];
const dailyBySku = new Map(dailyRows.map(row => [String(row?.sku || ''), row]));

const products = activeProducts.map(p => ({
  sku: p.sku || '',
  title: p.title || 'BlackGold Find',
  category: p.categoria_principal || 'Beleza',
  secondary: Array.isArray(p.categorias_secundarias) ? p.categorias_secundarias : [],
  badges: Array.isArray(p.badges) ? p.badges : [],
  price: p.price_text || p.preco_atual || p.price_current || p.price || '',
  description: p.descricao_curta || p.short_description || p.description || p.notes || '',
  image: p.image || p.image_original || '',
  card_image: p.card_image || (Array.isArray(p.images) ? p.images[0] : '') || p.image || p.image_original || '',
  url: p.active_affiliate_url || p.open_url || p.short_url || p.canonical_url || p.check_url || '#',
  featured: p.featured === true || p.quick_home === true,
  daily_position: Number(dailyBySku.get(String(p.sku || ''))?.position || 0)
}));

await fs.writeFile(path.join(out, 'catalog.json'), JSON.stringify({
  updated_at: new Date().toISOString(),
  total_active: activeProducts.length,
  products
}), 'utf8');
await fs.writeFile(path.join(out, 'daily-selection.json'), JSON.stringify({
  campaign_id: dailySelection.campaign_id || 'organic',
  date: dailySelection.date || '',
  selected: dailyRows.map(row => ({ sku: row.sku || '', position: Number(row.position || 0) }))
}), 'utf8');

for (const page of ['index.html','destaque.html','vitrine.html','ecossistema.html']) {
  const html = await fs.readFile(path.join(out, page), 'utf8');
  if (!html.includes('blackgold-v9.css') || !html.includes('blackgold-v9.js')) {
    throw new Error(`Stable V9 markup contract missing in ${page}`);
  }
  if (html.includes('./assets/header-lockup-v9.webp') || html.includes('./assets/product-placeholder-v9.webp')) {
    throw new Error(`Unresolved V9 generated asset reference in ${page}`);
  }
}

await fs.access(path.join(out, 'approved-v5', 'header-lockup.webp'));
await fs.access(path.join(out, 'assets', 'logo-cn-square.png'));
await fs.access(path.join(out, 'hero-approved.webp'));
await fs.access(path.join(out, 'approved-home', 'ecosystem-approved-exact.webp'));
await fs.access(path.join(out, 'blackgold-v10-overrides.css'));

console.log(`BlackGold V10 fidelity package ready: ${products.length} legacy products kept backend-only -> ${out}`);
