-- Ledger table: stores all session entries
CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  day INTEGER NOT NULL,
  date DATE NOT NULL,
  concept TEXT NOT NULL,
  domain TEXT NOT NULL,
  character TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1,
  score_technique_application INTEGER NOT NULL,
  score_tactical_awareness INTEGER NOT NULL,
  score_frame_control INTEGER NOT NULL,
  score_emotional_regulation INTEGER NOT NULL,
  score_strategic_outcome INTEGER NOT NULL,
  behavioral_weakness_summary TEXT NOT NULL DEFAULT '',
  key_moment TEXT NOT NULL DEFAULT '',
  mission TEXT NOT NULL DEFAULT '',
  mission_outcome TEXT NOT NULL DEFAULT '',
  commands_used TEXT[] NOT NULL DEFAULT '{}',
  session_completed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spaced repetition table
CREATE TABLE IF NOT EXISTS spaced_repetition (
  id SERIAL PRIMARY KEY,
  concept_id TEXT NOT NULL UNIQUE,
  last_practiced DATE NOT NULL,
  ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  interval INTEGER NOT NULL DEFAULT 1,
  next_review DATE NOT NULL,
  practice_count INTEGER NOT NULL DEFAULT 1,
  last_score_avg NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_day ON ledger(day);
CREATE INDEX IF NOT EXISTS idx_sr_next_review ON spaced_repetition(next_review);
CREATE INDEX IF NOT EXISTS idx_sr_concept_id ON spaced_repetition(concept_id);
