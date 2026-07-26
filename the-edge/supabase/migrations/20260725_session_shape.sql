-- Record which shape a session ran.
--
-- Sessions now vary in shape — the full loop, a quick drill, a deep scene, a
-- review, a storytelling session. Shape selection avoids repeating the shapes
-- of recent sessions, which it can only do if the ledger remembers them.
--
-- Nullable with no backfill: every session written before this migration was
-- the full loop, but recording that retroactively would be inventing data, and
-- selection treats a missing shape as "unknown" and simply ignores that row.

ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS shape_id TEXT;
