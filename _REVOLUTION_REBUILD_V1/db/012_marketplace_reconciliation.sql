CREATE TABLE IF NOT EXISTS marketplace_reconciliation (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  candidate_item_id TEXT,
  candidate_variation_id TEXT,
  candidate_catalog_product_id TEXT,
  candidate_title TEXT,
  candidate_url TEXT,
  classification TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (classification IN ('exact','probable','conflict','unresolved','rejected')),
  confidence REAL NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL DEFAULT 'insufficient_evidence',
  evidence_json TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review','accepted','rejected','superseded')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_reconciliation_product
  ON marketplace_reconciliation(product_id, review_status, classification);

CREATE INDEX IF NOT EXISTS idx_marketplace_reconciliation_candidate
  ON marketplace_reconciliation(candidate_item_id, candidate_catalog_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_reconciliation_evidence
  ON marketplace_reconciliation(
    product_id,
    source,
    IFNULL(candidate_item_id,''),
    IFNULL(candidate_variation_id,''),
    IFNULL(candidate_catalog_product_id,''),
    IFNULL(source_ref,'')
  );