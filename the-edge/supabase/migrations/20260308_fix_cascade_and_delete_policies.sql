-- Fix: Add ON DELETE CASCADE to user_id foreign keys so deleting a user
-- from auth.users doesn't leave orphaned rows in ledger/spaced_repetition.

-- ledger.user_id
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_user_id_fkey;
ALTER TABLE ledger
  ADD CONSTRAINT ledger_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- spaced_repetition.user_id
ALTER TABLE spaced_repetition DROP CONSTRAINT IF EXISTS spaced_repetition_user_id_fkey;
ALTER TABLE spaced_repetition
  ADD CONSTRAINT spaced_repetition_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix: Add DELETE RLS policies (missing from original migration)
CREATE POLICY "Users delete own ledger" ON ledger
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own SR" ON spaced_repetition
  FOR DELETE USING (auth.uid() = user_id);
