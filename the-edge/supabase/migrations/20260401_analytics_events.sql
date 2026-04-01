-- Analytics events table for V0 success metric tracking.
-- Fire-and-forget writes from server-side; read via dashboard queries.

CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  event       TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  properties  JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by event type + time range
CREATE INDEX idx_analytics_events_event_created ON analytics_events (event, created_at DESC);

-- Index for per-user queries
CREATE INDEX idx_analytics_events_user ON analytics_events (user_id, created_at DESC);

-- RLS: only the service role writes; users can read their own events
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own events"
  ON analytics_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert"
  ON analytics_events FOR INSERT
  WITH CHECK (true);
