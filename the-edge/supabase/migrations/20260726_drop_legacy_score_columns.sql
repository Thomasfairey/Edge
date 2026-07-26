-- Context-specific scoring dimensions — CONTRACT phase.
--
-- DO NOT RUN THIS UNTIL the new code is deployed and verified in production.
--
-- 20260725_context_scores.sql added `scores` JSONB and backfilled it from the
-- five legacy columns, deliberately leaving those columns in place. That is
-- what allows the old and new code to run against the same schema during a
-- deploy: the old code keeps reading score_*, the new code reads scores.
--
-- This migration removes the legacy columns. Once it has run, any instance of
-- the old code still running will fail on every ledger read. Run it only after
-- confirming that no such instance remains — including the Hono backend in
-- backend/ and the native iOS app, both of which are still pinned to the
-- five-column contract (see ARCHITECTURE.md).
--
-- Safety check before running:
--
--   SELECT count(*) FROM ledger WHERE scores = '{}'::jsonb;
--
-- A non-zero result means at least one row was never backfilled; investigate
-- rather than proceeding, because dropping the columns destroys its scores.

ALTER TABLE ledger
  DROP CONSTRAINT IF EXISTS chk_score_technique,
  DROP CONSTRAINT IF EXISTS chk_score_tactical,
  DROP CONSTRAINT IF EXISTS chk_score_frame,
  DROP CONSTRAINT IF EXISTS chk_score_emotional,
  DROP CONSTRAINT IF EXISTS chk_score_strategic;

ALTER TABLE ledger
  DROP COLUMN IF EXISTS score_technique_application,
  DROP COLUMN IF EXISTS score_tactical_awareness,
  DROP COLUMN IF EXISTS score_frame_control,
  DROP COLUMN IF EXISTS score_emotional_regulation,
  DROP COLUMN IF EXISTS score_strategic_outcome;
