CREATE TABLE IF NOT EXISTS product_revisions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'update',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_revisions_product
ON product_revisions(product_id, created_at DESC);
