-- Extend external channel registry conservatively.
-- New channels start review-required, unconfigured and live-disabled.
INSERT INTO channel_state(channel,policy_status,configured,live_enabled,last_error)
VALUES('facebook','REVIEW_REQUIRED',0,0,NULL)
ON CONFLICT(channel) DO NOTHING;

INSERT INTO channel_state(channel,policy_status,configured,live_enabled,last_error)
VALUES('pinterest','REVIEW_REQUIRED',0,0,NULL)
ON CONFLICT(channel) DO NOTHING;
