CREATE TABLE IF NOT EXISTS outbound_clicks (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'unknown',
  clicked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_product_time
ON outbound_clicks(product_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_time
ON outbound_clicks(clicked_at DESC);
