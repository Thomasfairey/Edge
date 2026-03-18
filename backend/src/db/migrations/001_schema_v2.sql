-- ============================================================================
-- THE EDGE — Database Schema v2
-- Multi-user with Row-Level Security
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USER PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  professional_context TEXT DEFAULT '',
  communication_style TEXT DEFAULT 'Direct and constructive',
  experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
  goals TEXT[] DEFAULT '{}',
  subscription_tier TEXT CHECK (subscription_tier IN ('free', 'pro')) DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 2. SESSIONS (tracks session lifecycle)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  phase TEXT CHECK (phase IN ('checkin', 'lesson', 'roleplay', 'debrief', 'mission', 'complete')) DEFAULT 'lesson',
  concept_id TEXT,
  character_id TEXT,
  roleplay_transcript JSONB DEFAULT '[]',
  coach_messages TEXT[] DEFAULT '{}',
  commands_used TEXT[] DEFAULT '{}',
  checkin_outcome TEXT,
  lesson_content TEXT,
  debrief_content TEXT,
  scores JSONB,
  mission TEXT,
  is_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_user_date ON sessions(user_id, date);
CREATE INDEX idx_sessions_user_day ON sessions(user_id, day DESC);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. NUANCE LEDGER (one entry per completed session)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  date DATE NOT NULL,
  concept TEXT NOT NULL,
  domain TEXT NOT NULL,
  character TEXT NOT NULL,
  difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5) DEFAULT 3,
  score_technique_application INTEGER CHECK (score_technique_application BETWEEN 1 AND 5),
  score_tactical_awareness INTEGER CHECK (score_tactical_awareness BETWEEN 1 AND 5),
  score_frame_control INTEGER CHECK (score_frame_control BETWEEN 1 AND 5),
  score_emotional_regulation INTEGER CHECK (score_emotional_regulation BETWEEN 1 AND 5),
  score_strategic_outcome INTEGER CHECK (score_strategic_outcome BETWEEN 1 AND 5),
  behavioral_weakness_summary TEXT DEFAULT '',
  key_moment TEXT DEFAULT '',
  mission TEXT DEFAULT '',
  mission_outcome TEXT DEFAULT '',
  commands_used TEXT[] DEFAULT '{}',
  session_completed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_user_id ON ledger(user_id);
CREATE INDEX idx_ledger_user_day ON ledger(user_id, day DESC);

ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ledger"
  ON ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ledger"
  ON ledger FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ledger"
  ON ledger FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. SPACED REPETITION (per-user concept mastery)
-- ============================================================================

CREATE TABLE IF NOT EXISTS spaced_repetition (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL,
  last_practiced DATE,
  ease_factor NUMERIC(4,2) DEFAULT 2.50,
  interval INTEGER DEFAULT 1,
  next_review DATE,
  practice_count INTEGER DEFAULT 0,
  last_score_avg NUMERIC(3,1) DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, concept_id)
);

CREATE INDEX idx_sr_user_review ON spaced_repetition(user_id, next_review);
CREATE INDEX idx_sr_user_concept ON spaced_repetition(user_id, concept_id);

ALTER TABLE spaced_repetition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own SR data"
  ON spaced_repetition FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own SR data"
  ON spaced_repetition FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own SR data"
  ON spaced_repetition FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 5. SESSION USAGE TRACKING (for free tier limits)
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  session_count INTEGER DEFAULT 0,
  UNIQUE(user_id, week_start)
);

ALTER TABLE session_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON session_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON session_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON session_usage FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sr_updated_at
  BEFORE UPDATE ON spaced_repetition
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
