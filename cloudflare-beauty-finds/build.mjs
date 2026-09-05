import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js', 'admin.html', 'admin.js', 'mercadolivre-callback.html', '_headers']) {
  await fs.copyFile(path.join(here, file), path.join(out, file));
}

const productsRaw = JSON.parse(await fs.readFile(path.join(root, 'produtos.json'), 'utf8'));
const activeProducts = (Array.isArray(productsRaw) ? productsRaw : productsRaw.products || [])
  .filter(p => p && p.active !== false);

let dailySelection = { campaign_id: 'organic', selected: [] };
try {
  dailySelection = JSON.parse(await fs.readFile(path.join(root, 'data', 'daily_selection.json'), 'utf8'));
} catch {}
const dailyRows = Array.isArray(dailySelection.selected) ? dailySelection.selected : [];
const dailyBySku = new Map(dailyRows.map(row => [String(row?.sku || ''), row]));

const products = activeProducts
  .map(p => ({
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

try {
  await fs.copyFile(path.join(root, 'ecosystem.json'), path.join(out, 'ecosystem.json'));
} catch {
  await fs.writeFile(path.join(out, 'ecosystem.json'), JSON.stringify({}), 'utf8');
}

const localImages = [...new Set(products
  .map(p => p.card_image)
  .filter(v => v && !/^https?:\/\//i.test(v)))];
for (const rel of localImages) {
  const clean = rel.replace(/^\.\//, '');
  const src = path.join(root, clean);
  const dest = path.join(out, clean);
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  } catch {
    // Missing legacy images are ignored; frontend has a branded fallback.
  }
}

for (const asset of ['logo-cn-round.png', 'logo-cn-square.png']) {
  const src = path.join(root, 'assets', asset);
  const dest = path.join(out, 'assets', asset);
  try { await fs.copyFile(src, dest); } catch {}
}

for (const asset of ['hero-approved.webp', 'ecosystem-approved.webp']) {
  await fs.copyFile(path.join(here, asset), path.join(out, asset));
}

console.log(`Cloudflare Pages package ready: ${products.length} active products -> ${out}`);
