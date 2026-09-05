CREATE TABLE IF NOT EXISTS campaign_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  sku TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_events_sku_created
  ON campaign_events (sku, created_at);

CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign
  ON campaign_events (campaign_id, event_type);
