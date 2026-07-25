-- Record what a session actually was, not just how it scored.
--
-- History-aware selection can currently only match on the character's display
-- name, and scenario generation has nowhere to record what it produced — so it
-- cannot avoid repeating itself. These columns are the memory that makes both
-- work.
--
-- All nullable with no backfill: rows written before this migration simply have
-- no provenance, and every reader treats a missing value as "unknown" rather
-- than failing.

ALTER TABLE ledger
  -- Stable id, unlike `character` which stores the display name and breaks
  -- history matching the moment an archetype is renamed.
  ADD COLUMN IF NOT EXISTS character_id TEXT,
  -- The life context the session ran in (dating | friends | groups | family | work).
  ADD COLUMN IF NOT EXISTS context TEXT,
  -- One line describing the situation, fed back into generation as "don't
  -- repeat these".
  ADD COLUMN IF NOT EXISTS scenario_summary TEXT;

-- Recent-history lookups are always scoped to a user and ordered by day.
CREATE INDEX IF NOT EXISTS idx_ledger_user_day ON ledger(user_id, day DESC);
