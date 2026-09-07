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
  'blackgold-v7.css',
  'blackgold-v7.js',
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

// V7: uma única identidade visual compartilhada entre Home, Destaque, Vitrine e Ecossistema.
// Imagens do catálogo antigo continuam fora da interface pública; entram apenas os novos produtos.
await fs.cp(path.join(here, 'approved-home'), path.join(out, 'approved-home'), { recursive: true });
await fs.cp(path.join(here, 'approved-v5'), path.join(out, 'approved-v5'), { recursive: true });
await fs.copyFile(path.join(here, 'hero-approved.webp'), path.join(out, 'hero-approved.webp'));

for (const asset of ['logo-cn-round.png', 'logo-cn-square.png']) {
  const src = path.join(root, 'assets', asset);
  const dest = path.join(out, 'assets', asset);
  try { await fs.copyFile(src, dest); } catch {}
}

// Manifesto oficial V2.1 é a fonte única dos links do Ecossistema.
try { await fs.copyFile(path.join(root, 'ecosystem.json'), path.join(out, 'ecosystem.json')); }
catch { await fs.writeFile(path.join(out, 'ecosystem.json'), JSON.stringify({}), 'utf8'); }

// O catálogo legado continua exportado SOMENTE para backend/admin e futuras migrações.
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
  if (!html.includes('blackgold-v7.css') || !html.includes('blackgold-v7.js')) {
    throw new Error(`V7 contract missing in ${page}`);
  }
}

console.log(`BlackGold V7 unified package ready: ${products.length} legacy products kept backend-only -> ${out}`);
