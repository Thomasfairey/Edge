-- Add profile_data JSONB column for dynamic user profiles
-- Replaces the hardcoded V0 user profile in system-context.ts
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT NULL;

-- Allow users to update their own profile_data
-- (existing RLS policy "Users update own profile" already covers this)
