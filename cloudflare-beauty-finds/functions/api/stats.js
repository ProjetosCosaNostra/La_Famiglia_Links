const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const bearer = request => {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export async function onRequestGet(context) {
  const db = context.env.CAMPAIGN_DB;
  const expected = String(context.env.STATS_EXPORT_TOKEN || '');
  if (!db || !expected) return response({ ok: false, code: 'not_configured' }, 503);
  if (bearer(context.request) !== expected) return response({ ok: false, code: 'unauthorized' }, 401);

  try {
    const query = await db.prepare(
      `SELECT sku,
              SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
              SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks,
              MAX(created_at) AS last_event_at
       FROM campaign_events
       WHERE created_at >= datetime('now', '-90 days')
       GROUP BY sku
       ORDER BY clicks DESC, impressions DESC`
    ).all();
    return response({ generated_at: new Date().toISOString(), window_days: 90, rows: query.results || [] });
  } catch {
    return response({ ok: false, code: 'storage_error' }, 500);
  }
}
