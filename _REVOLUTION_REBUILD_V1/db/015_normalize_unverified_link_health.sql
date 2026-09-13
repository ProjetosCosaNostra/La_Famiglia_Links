-- V5 hardening: legacy HTTP health must never imply verified marketplace identity.
-- Preserve broken links and historical diagnostics; only downgrade positive legacy health.
UPDATE product_links
SET health_status='unknown', variant_match=0
WHERE is_active=1
  AND health_status IN ('healthy','verified')
  AND COALESCE(marketplace_identity_status,'pending')<>'verified_exact';

INSERT INTO system_settings(key,value,updated_at)
VALUES('affiliate_health_model','identity_gated_v2',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
