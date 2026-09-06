import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });

for (const file of [
  'index.html',
  'blackgold-v3.css',
  'styles.css',
  'app.js',
  'admin.html',
  'admin.js',
  'mercadolivre-callback.html',
  '_headers'
]) {
  await fs.copyFile(path.join(here, file), path.join(out, file));
}

// V3 VISUAL: o arquivo publicado usa um nome de CSS novo para matar qualquer cache da V2.
// A home continua isolada do renderer legado e do catálogo antigo.
const publishedIndex = path.join(out, 'index.html');
let html = await fs.readFile(publishedIndex, 'utf8');
html = html
  .replace('./blackgold-v2.css', './blackgold-v3.css?v=20260906-v3')
  .replace('<meta name="theme-color" content="#0b0907">', '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta http-equiv="Expires" content="0">\n  <meta name="theme-color" content="#0b0907">');
await fs.writeFile(publishedIndex, html, 'utf8');

/*
  CLEAN REBUILD V3:
  A home visual é independente do renderer legado e não carrega produtos.json na UI.
  O catálogo real permanece disponível separadamente em catalog.json para backend/admin.
*/
await fs.cp(path.join(here, 'approved-home'), path.join(out, 'approved-home'), { recursive: true });
await fs.copyFile(path.join(here, 'hero-approved.webp'), path.join(out, 'hero-approved.webp'));

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
  has_cleaner_image: Boolean(p.card_image || (Array.isArray(p.images) && p.images[0])),
  url: p.active_affiliate_url || p.open_url || p.short_url || p.canonical_url || p.check_url || '#',
  affiliate_link_count: Array.isArray(p.affiliate_links) ? p.affiliate_links.length : (p.open_url ? 1 : 0),
  affiliate_healthy_count: Number(p.affiliate_healthy_count || 0),
  featured: p.featured === true || p.quick_home === true,
  id_busca: p.id_busca || '',
  daily_position: Number(dailyBySku.get(String(p.sku || ''))?.position || 0),
  daily_score: Number(dailyBySku.get(String(p.sku || ''))?.score?.total || 0)
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

try { await fs.copyFile(path.join(root, 'ecosystem.json'), path.join(out, 'ecosystem.json')); }
catch { await fs.writeFile(path.join(out, 'ecosystem.json'), JSON.stringify({}), 'utf8'); }

for (const asset of ['logo-cn-round.png', 'logo-cn-square.png']) {
  const src = path.join(root, 'assets', asset);
  const dest = path.join(out, 'assets', asset);
  try { await fs.copyFile(src, dest); } catch {}
}

console.log(`Cloudflare Pages V3 package ready: ${products.length} active products -> ${out}`);
