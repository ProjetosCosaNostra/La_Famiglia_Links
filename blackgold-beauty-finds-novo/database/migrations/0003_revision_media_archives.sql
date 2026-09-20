CREATE TABLE IF NOT EXISTS revision_media_archives (
  revision_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  original_key TEXT NOT NULL,
  archive_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  archived_at TEXT NOT NULL DEFAULT (datetime('now')),
  restored_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_revision_media_archives_product
ON revision_media_archives(product_id, archived_at DESC);
