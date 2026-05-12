-- Production hardening: lock down tables that were previously trusting
-- service-role-only access without enabling RLS.

-- 1) rate_limits: was world-readable/writable if anon key ever touches it.
--   Service-role bypasses RLS, so enabling it has no effect on the cleanup
--   path; but it stops accidental exposure via public anon traffic.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies = deny all. Only service_role (which bypasses RLS) can use it.

-- 2) analytics_events INSERT was unrestricted (`WITH CHECK (true)`).
--   Replace with a stricter policy: either the row has no user_id (system-
--   level events) OR the user_id matches the authenticated user.
DROP POLICY IF EXISTS "Service role can insert" ON analytics_events;
CREATE POLICY "Authenticated users can insert own events"
  ON analytics_events FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- 3) analytics_events: explicitly deny mutation/deletion from clients.
--   (Service role still bypasses; this just makes the deny intent explicit.)
DROP POLICY IF EXISTS "No client updates" ON analytics_events;
CREATE POLICY "No client updates"
  ON analytics_events FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No client deletes" ON analytics_events;
CREATE POLICY "No client deletes"
  ON analytics_events FOR DELETE
  USING (false);

-- 4) Index hygiene: idx_ledger_user_id already exists, but rolling history
--   reads filter by user_id ORDER BY day DESC. A composite index makes that
--   query an index-only scan instead of a sort.
CREATE INDEX IF NOT EXISTS idx_ledger_user_day_desc
  ON ledger (user_id, day DESC);

-- 5) Spaced repetition reads always filter by user + due date. Composite
--   index lets the "due for review" dashboard query stay O(log n).
CREATE INDEX IF NOT EXISTS idx_sr_user_next_review
  ON spaced_repetition (user_id, next_review);

-- 6) Backfill any pre-auth ledger/SR rows that still have NULL user_id.
--   Pre-auth rows should not be readable by random authenticated users
--   (the previous "user_id IS NULL" RLS clause leaked them). Tighten the
--   policies first, then null rows become invisible to all clients.
DROP POLICY IF EXISTS "Users read own ledger" ON ledger;
CREATE POLICY "Users read own ledger" ON ledger
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own ledger" ON ledger;
CREATE POLICY "Users update own ledger" ON ledger
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own SR" ON spaced_repetition;
CREATE POLICY "Users read own SR" ON spaced_repetition
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own SR" ON spaced_repetition;
CREATE POLICY "Users update own SR" ON spaced_repetition
  FOR UPDATE USING (auth.uid() = user_id);
