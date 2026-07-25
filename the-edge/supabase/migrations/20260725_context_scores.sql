-- Context-specific scoring dimensions.
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
-- CLEAN BREAK — no backfill. Existing rows keep whatever the five columns held
-- until this migration drops them; their scores are not migrated into the new
-- shape. This is deliberate and was agreed: the session history is test data.
-- If that ever stops being true, add a backfill UPDATE before the DROP below.

ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dimension_set TEXT NOT NULL DEFAULT 'work';

-- The old per-column range constraints go with their columns.
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

-- Replace the five range checks with one over the JSONB values: every entry
-- must be an integer between 1 and 5. An empty object passes, which is what a
-- session that never reached the debrief should look like.
ALTER TABLE ledger
  DROP CONSTRAINT IF EXISTS chk_scores_range;

ALTER TABLE ledger
  ADD CONSTRAINT chk_scores_range CHECK (
    jsonb_typeof(scores) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(scores) AS entry(key, value)
      WHERE jsonb_typeof(entry.value) <> 'number'
         OR (entry.value)::numeric < 1
         OR (entry.value)::numeric > 5
         OR (entry.value)::numeric <> trunc((entry.value)::numeric)
    )
  );

-- dimension_set must name a known set, so the dashboard can always resolve
-- labels for a row.
ALTER TABLE ledger
  DROP CONSTRAINT IF EXISTS chk_dimension_set;

ALTER TABLE ledger
  ADD CONSTRAINT chk_dimension_set
    CHECK (dimension_set IN ('dating', 'friends', 'groups', 'family', 'work'));
