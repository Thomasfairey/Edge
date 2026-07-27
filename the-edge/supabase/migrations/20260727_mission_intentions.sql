-- Mission implementation intentions, and what actually happened.
--
-- Missions used to be a paragraph of prose with a free-text outcome. Two
-- changes need storage:
--
--   1. The if-then structure. A plan bound to a trigger the user recognises in
--      the moment gets enacted far more often than the same plan phrased as a
--      goal, so the cue and the behaviour are kept apart from the prose. The
--      composed sentence still lives in `mission`, which nothing else has to
--      change to read.
--
--   2. What happened, in structure. `mission_outcome` conflated "the moment
--      never came up" with "I had the chance and didn't take it" — the first is
--      a fact about the user's week and the second is about the user, and
--      counting them together made the only real outcome measure this product
--      has meaningless. `mission_opportunity` and `mission_enacted` separate
--      them and give an honest enactment rate.
--
-- Expand only. Every column is nullable with no default, so existing rows stay
-- valid and older clients that never write them keep working. There is no
-- contract step to follow: `backend/` and the native iOS app read none of
-- these.

ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS mission_cue TEXT,
  ADD COLUMN IF NOT EXISTS mission_action TEXT,
  ADD COLUMN IF NOT EXISTS mission_commitment TEXT,
  ADD COLUMN IF NOT EXISTS mission_opportunity BOOLEAN,
  ADD COLUMN IF NOT EXISTS mission_enacted TEXT;

-- Only the three answers the client can produce. Nullable stays legal: a row
-- whose mission has not been checked in on yet has no answer.
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS chk_mission_enacted;
ALTER TABLE ledger
  ADD CONSTRAINT chk_mission_enacted
  CHECK (mission_enacted IS NULL OR mission_enacted IN ('yes', 'partly', 'no'));

COMMENT ON COLUMN ledger.mission_cue IS 'The trigger half of the if-then plan, without the "When" stem.';
COMMENT ON COLUMN ledger.mission_action IS 'The behaviour half, without the "I will" stem.';
COMMENT ON COLUMN ledger.mission_commitment IS 'When the user said they would do it. Written after the row, at the end of the session.';
COMMENT ON COLUMN ledger.mission_opportunity IS 'Whether the cue occurred at all. FALSE is not a failure.';
COMMENT ON COLUMN ledger.mission_enacted IS 'Whether the user acted on the cue when it occurred. NULL when it never did.';
