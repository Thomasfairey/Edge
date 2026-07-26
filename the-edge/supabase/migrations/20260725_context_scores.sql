-- Context-specific scoring dimensions — EXPAND phase.
--
-- Scores were five fixed columns encoding a combat rubric: technique
-- application, tactical awareness, frame control, emotional regulation,
-- strategic outcome. That is the right lens for a negotiation and the wrong
-- one for a friend in crisis — scoring a warm conversation on "frame control"
-- teaches the wrong instinct.
--
-- Scores become a JSONB map whose keys are named by `dimension_set`, so dating,
-- friends, groups, family and work each get their own five.
--
-- THIS MIGRATION IS ADDITIVE AND NON-DESTRUCTIVE. It adds the new columns and
-- backfills them from the old ones, but leaves the old columns in place so the
-- currently-deployed code keeps working while the new code rolls out. The five
-- legacy columns are dropped by a separate later migration, once nothing reads
-- them — see 20260726_drop_legacy_score_columns.sql.
--
-- The earlier version of this file did a clean break with no backfill, on the
-- understanding that the session history was test data. It is not: production
-- holds real sessions for multiple users, including a twelve-day streak with
-- mission outcomes reported. Those scores are the entire progression record and
-- are preserved below.

ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dimension_set TEXT NOT NULL DEFAULT 'work';

-- Backfill: every pre-existing session was scored on the work rubric, which is
-- preserved unchanged as the `work` dimension set, so the mapping is exact
-- rather than approximate. Only rows that have not already been converted are
-- touched, so this is safe to re-run.
UPDATE ledger
SET
  scores = jsonb_build_object(
    'technique_application', score_technique_application,
    'tactical_awareness',    score_tactical_awareness,
    'frame_control',         score_frame_control,
    'emotional_regulation',  score_emotional_regulation,
    'strategic_outcome',     score_strategic_outcome
  ),
  dimension_set = 'work'
WHERE scores = '{}'::jsonb;

-- The legacy columns are NOT NULL, and the new code no longer writes them. That
-- combination fails EVERY insert from the new code for as long as the columns
-- exist — which is the entire transition window this expand/contract split
-- exists to create.
--
-- Caught by running a real session against a branch, not by any test:
--
--   Ledger write failed: null value in column "score_technique_application"
--   of relation "ledger" violates not-null constraint
--
-- Dropping NOT NULL lets the old code keep writing them and the new code omit
-- them. The columns go entirely in 20260726_drop_legacy_score_columns.sql.
ALTER TABLE ledger
  ALTER COLUMN score_technique_application DROP NOT NULL,
  ALTER COLUMN score_tactical_awareness    DROP NOT NULL,
  ALTER COLUMN score_frame_control         DROP NOT NULL,
  ALTER COLUMN score_emotional_regulation  DROP NOT NULL,
  ALTER COLUMN score_strategic_outcome     DROP NOT NULL;

-- Range checks over the JSONB values: every entry must be an integer 1-5. An
-- empty object passes, which is what a session that never reached the debrief
-- should look like.
--
-- Expressed as a JSONPath rather than a subquery: Postgres rejects subqueries
-- in CHECK constraints outright (0A000 "cannot use subquery in check
-- constraint"), so the obvious jsonb_each form does not compile. Verified
-- against a branch: accepts a valid rubric and an empty object; rejects 9,
-- "high", and 3.5.
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS chk_scores_range;

ALTER TABLE ledger
  ADD CONSTRAINT chk_scores_range CHECK (
    jsonb_typeof(scores) = 'object'
    AND NOT jsonb_path_exists(
      scores,
      '$.* ? (@.type() != "number" || @ < 1 || @ > 5 || @.floor() != @)'
    )
  );

-- dimension_set must name a known set, so the dashboard can always resolve
-- labels for a row.
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS chk_dimension_set;

ALTER TABLE ledger
  ADD CONSTRAINT chk_dimension_set
    CHECK (dimension_set IN ('dating', 'friends', 'groups', 'family', 'work'));
