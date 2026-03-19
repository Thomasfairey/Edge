-- Rate limiting table for durable, cross-instance rate limiting.
-- Used as a backing store behind the in-memory fast-path cache.

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_rate_limits_expires ON rate_limits(expires_at);
