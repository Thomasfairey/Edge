-- Add CHECK constraints to enforce valid score ranges (1-5)
ALTER TABLE ledger
  ADD CONSTRAINT chk_score_technique CHECK (score_technique_application BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_score_tactical CHECK (score_tactical_awareness BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_score_frame CHECK (score_frame_control BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_score_emotional CHECK (score_emotional_regulation BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_score_strategic CHECK (score_strategic_outcome BETWEEN 1 AND 5);

-- Add CHECK constraint for difficulty
ALTER TABLE ledger
  ADD CONSTRAINT chk_difficulty CHECK (difficulty BETWEEN 1 AND 10);

-- Add CHECK constraint for day (must be positive)
ALTER TABLE ledger
  ADD CONSTRAINT chk_day_positive CHECK (day > 0);

-- Add CHECK constraints for spaced repetition
ALTER TABLE spaced_repetition
  ADD CONSTRAINT chk_ease_factor CHECK (ease_factor >= 1.0 AND ease_factor <= 5.0),
  ADD CONSTRAINT chk_interval_positive CHECK (interval > 0),
  ADD CONSTRAINT chk_practice_count CHECK (practice_count > 0),
  ADD CONSTRAINT chk_score_avg CHECK (last_score_avg >= 1.0 AND last_score_avg <= 5.0);

-- Add unique constraint on ledger day to prevent duplicate entries
ALTER TABLE ledger
  ADD CONSTRAINT uniq_ledger_day UNIQUE (day);
