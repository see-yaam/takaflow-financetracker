ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_opening_balance boolean NOT NULL DEFAULT false;