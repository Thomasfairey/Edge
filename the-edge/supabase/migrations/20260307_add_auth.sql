-- Add user_id to ledger table
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger(user_id);

-- Add user_id to spaced_repetition table
ALTER TABLE spaced_repetition ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_sr_user_id ON spaced_repetition(user_id);

-- Drop the old unique constraint on concept_id (now needs to be per-user)
ALTER TABLE spaced_repetition DROP CONSTRAINT IF EXISTS spaced_repetition_concept_id_key;
ALTER TABLE spaced_repetition ADD CONSTRAINT spaced_repetition_user_concept_unique UNIQUE (user_id, concept_id);

-- Profiles table for role management
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'tester' CHECK (role IN ('admin', 'tester')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Enable RLS on all tables
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaced_repetition ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see/modify their own data
CREATE POLICY "Users read own ledger" ON ledger
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ledger" ON ledger
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ledger" ON ledger
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users read own SR" ON spaced_repetition
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own SR" ON spaced_repetition
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own SR" ON spaced_repetition
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Allow service role full access (bypasses RLS automatically)
-- The service role key is only used server-side so this is safe.

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email = current_setting('app.admin_email', true) THEN 'admin'
      ELSE 'tester'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
