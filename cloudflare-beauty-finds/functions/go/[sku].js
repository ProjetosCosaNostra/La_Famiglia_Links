const mlUrl = value => /^https:\/\/(?:www\.)?(?:meli\.la|meli\.co|mercadolivre\.com(?:\.br)?|mercadolibre\.[a-z.]+)\//i.test(String(value || ''));
const clean = (value, max = 160) => String(value || '').trim().slice(0, max);

const getCatalog = async request => {
  const url = new URL('/catalog.json', request.url);
  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`catalog_http_${response.status}`);
  return response.json();
};

export async function onRequestGet(context) {
  const sku = clean(context.params?.sku, 180);
  if (!sku) return new Response('Produto não informado.', { status: 400 });

  let catalog;
  try {
    catalog = await getCatalog(context.request);
  } catch {
    return new Response('Catálogo temporariamente indisponível.', { status: 503 });
  }

  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const product = products.find(row => String(row?.sku || '') === sku);
  const destination = clean(product?.url, 800);
  if (!product || !mlUrl(destination)) {
    return new Response('Produto ou link indisponível.', { status: 404 });
  }

  const requestUrl = new URL(context.request.url);
  const source = clean(requestUrl.searchParams.get('src') || 'direct', 60);
  const campaignId = clean(requestUrl.searchParams.get('c') || 'organic', 80);
  const eventId = clean(requestUrl.searchParams.get('eid') || crypto.randomUUID(), 100);
  const db = context.env.CAMPAIGN_DB;

  if (db) {
    try {
      await db.prepare(
        `INSERT OR IGNORE INTO campaign_events
         (event_id, event_type, sku, campaign_id, source, created_at)
         VALUES (?, 'click', ?, ?, ?, datetime('now'))`
      ).bind(eventId, sku, campaignId, source).run();
    } catch {
      // A venda não pode ser bloqueada por uma falha de telemetria.
    }
  }

  return Response.redirect(destination, 302);
}
