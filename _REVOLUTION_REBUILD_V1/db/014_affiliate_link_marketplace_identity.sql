ALTER TABLE product_links ADD COLUMN marketplace_item_id TEXT;
ALTER TABLE product_links ADD COLUMN marketplace_variation_id TEXT;
ALTER TABLE product_links ADD COLUMN marketplace_catalog_product_id TEXT;
ALTER TABLE product_links ADD COLUMN marketplace_identity_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE product_links ADD COLUMN marketplace_seller_id TEXT;
ALTER TABLE product_links ADD COLUMN marketplace_seller_level TEXT;
ALTER TABLE product_links ADD COLUMN marketplace_last_checked_at TEXT;
ALTER TABLE product_links ADD COLUMN marketplace_last_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_product_links_marketplace_item
  ON product_links(marketplace_item_id,marketplace_variation_id);

CREATE INDEX IF NOT EXISTS idx_product_links_marketplace_catalog
  ON product_links(product_id,marketplace_catalog_product_id,marketplace_identity_status,is_active);

INSERT INTO system_settings(key,value,updated_at)
VALUES('affiliate_identity_model','link_listing_v1',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;