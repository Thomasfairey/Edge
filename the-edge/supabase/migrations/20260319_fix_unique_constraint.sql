-- Fix: UNIQUE(day) is wrong — it means only one user can have Day 1.
-- Replace with UNIQUE(user_id, day) so each user can have their own Day 1.

ALTER TABLE ledger DROP CONSTRAINT IF EXISTS uniq_ledger_day;
ALTER TABLE ledger ADD CONSTRAINT uniq_ledger_user_day UNIQUE (user_id, day);
