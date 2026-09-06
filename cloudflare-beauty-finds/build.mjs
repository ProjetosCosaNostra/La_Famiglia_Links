import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js', 'approved-home.js', 'admin.html', 'admin.js', 'mercadolivre-callback.html', '_headers']) {
  await fs.copyFile(path.join(here, file), path.join(out, file));
}

// A home aprovada usa assets fixos recortados diretamente do mockup aprovado.
// O catálogo real continua separado e funcional dentro da busca/modal.
await fs.cp(path.join(here, 'approved-home'), path.join(out, 'approved-home'), { recursive: true });

// Carrega o lock visual APÓS o app dinâmico, sem alterar o HTML-fonte usado pelo backend.
const indexPath = path.join(out, 'index.html');
let indexSource = await fs.readFile(indexPath, 'utf8');
const approvedScript = '  <script src="./approved-home.js" defer></script>';
if (!indexSource.includes(approvedScript)) {
  const appScript = '  <script src="./app.js" defer></script>';
  if (!indexSource.includes(appScript)) {
    throw new Error('Script principal não encontrado; build bloqueado para evitar publicar uma home sem lock aprovado.');
  }
  indexSource = indexSource.replace(appScript, `${appScript}\n${approvedScript}`);
  await fs.writeFile(indexPath, indexSource, 'utf8');
}

// O mockup aprovado é o contrato visual. As regras abaixo entram por último no CSS
// para impedir regressões de escala/proporção sem mexer no backend ou nos dados reais.
const approvedLock = await fs.readFile(path.join(here, 'mockup-lock.css'), 'utf8');
await fs.appendFile(path.join(out, 'styles.css'), `\n\n${approvedLock}\n`, 'utf8');

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

// O número do mockup representa o catálogo ativo oficial, não apenas o subconjunto
// que o front classifica para a vitrine visível.
const appPath = path.join(out, 'app.js');
let appSource = await fs.readFile(appPath, 'utf8');
const countOld = "  $('#count').textContent = state.products.length;";
const countNew = "  $('#count').textContent = Number(data.total_active || state.rawProducts.length || state.products.length);";
if (!appSource.includes(countOld) && !appSource.includes(countNew)) {
  throw new Error('Contrato do contador ativo mudou; build bloqueado para evitar regressão visual.');
}
appSource = appSource.replace(countOld, countNew);
await fs.writeFile(appPath, appSource, 'utf8');

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

// Hero aprovado permanece a arte original. O ecossistema agora é fornecido por
// approved-home/ecosystem-approved-exact.webp, recortado da referência aprovada.
await fs.copyFile(path.join(here, 'hero-approved.webp'), path.join(out, 'hero-approved.webp'));

console.log(`Cloudflare Pages package ready: ${products.length} active products -> ${out}`);
