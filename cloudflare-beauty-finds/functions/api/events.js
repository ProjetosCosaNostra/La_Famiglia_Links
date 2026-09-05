const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const clean = (value, max) => String(value || '').trim().slice(0, max);

export async function onRequestPost(context) {
  const db = context.env.CAMPAIGN_DB;
  if (!db) return json({ ok: false, code: 'analytics_not_configured' }, 503);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, code: 'invalid_json' }, 400);
  }

  const eventType = clean(body.event_type, 20);
  const sku = clean(body.sku, 180);
  const campaignId = clean(body.campaign_id, 80) || 'organic';
  const source = clean(body.source, 60) || 'storefront';
  const eventId = clean(body.event_id, 100);
  if (!['impression', 'click'].includes(eventType) || !sku || !eventId) {
    return json({ ok: false, code: 'invalid_event' }, 400);
  }

  try {
    await db.prepare(
      `INSERT OR IGNORE INTO campaign_events
       (event_id, event_type, sku, campaign_id, source, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(eventId, eventType, sku, campaignId, source).run();
  } catch {
    return json({ ok: false, code: 'storage_error' }, 500);
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
