-- ==============================================================================
-- TAKAFLOW FINANCE TRACKER - COMPLETE DATABASE SCHEMA
-- Copy and paste this entire script into your Supabase SQL Editor and click RUN
-- ==============================================================================

-- 1. WALLETS TABLE
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BDT',
  icon TEXT DEFAULT 'wallet',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wallets" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own wallets" ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own wallets" ON public.wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own wallets" ON public.wallets FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON public.wallets(user_id);

-- 2. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(15,2) NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON public.transactions(wallet_id);

-- 3. BUDGET GOALS TABLE
CREATE TABLE IF NOT EXISTS public.budget_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  monthly_budget NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.budget_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own budget goals" ON public.budget_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own budget goals" ON public.budget_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own budget goals" ON public.budget_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own budget goals" ON public.budget_goals FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_budget_goals_user_month ON public.budget_goals(user_id, month);

-- 4. MONTHLY SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS public.monthly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  total_income NUMERIC NOT NULL DEFAULT 0,
  total_expense NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, wallet_id, month)
);

ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots" ON public.monthly_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own snapshots" ON public.monthly_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own snapshots" ON public.monthly_snapshots FOR UPDATE USING (auth.uid() = user_id);

-- 5. SAVINGS GOALS TABLE
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  target_amount NUMERIC NOT NULL,
  saved_amount NUMERIC NOT NULL DEFAULT 0,
  deadline DATE,
  emoji TEXT DEFAULT '🫙',
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals" ON public.savings_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own goals" ON public.savings_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.savings_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.savings_goals FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON public.savings_goals(user_id);

-- 6. RECURRING TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  day_of_month INTEGER NOT NULL,
  last_applied_month TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recurring" ON public.recurring_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own recurring" ON public.recurring_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recurring" ON public.recurring_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring" ON public.recurring_transactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON public.recurring_transactions(user_id);

-- 7. PASSWORD RESET TOKENS TABLE
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- 8. DEBTS TABLE
CREATE TABLE IF NOT EXISTS public.debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('borrowed', 'lent')),
  person_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  remaining_amount NUMERIC NOT NULL,
  wallet_id UUID REFERENCES public.wallets(id) NOT NULL,
  note TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own debts" ON public.debts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own debts" ON public.debts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own debts" ON public.debts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own debts" ON public.debts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_debts_user_id ON public.debts(user_id);

-- 9. DEBT PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID REFERENCES public.debts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own debt payments" ON public.debt_payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own debt payments" ON public.debt_payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own debt payments" ON public.debt_payments FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_debt_payments_user_id ON public.debt_payments(user_id);

-- 10. DEBT ADDITIONS TABLE
CREATE TABLE IF NOT EXISTS public.debt_additions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own debt additions" ON public.debt_additions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own debt additions" ON public.debt_additions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own debt additions" ON public.debt_additions FOR DELETE USING (auth.uid() = user_id);

-- ==============================================================================
-- 11. FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Transaction Insert: update wallet balance (skips if reversed)
CREATE OR REPLACE FUNCTION public.update_wallet_balance_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_reversed = true THEN
    RETURN NEW;
  END IF;
  IF NEW.type = 'income' THEN
    UPDATE public.wallets SET balance = balance + NEW.amount WHERE id = NEW.wallet_id;
  ELSIF NEW.type = 'expense' THEN
    UPDATE public.wallets SET balance = balance - NEW.amount WHERE id = NEW.wallet_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Transaction Delete: undo wallet balance
CREATE OR REPLACE FUNCTION public.update_wallet_balance_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_reversed = true THEN
    RETURN OLD;
  END IF;
  IF OLD.type = 'income' THEN
    UPDATE public.wallets SET balance = balance - OLD.amount WHERE id = OLD.wallet_id;
  ELSIF OLD.type = 'expense' THEN
    UPDATE public.wallets SET balance = balance + OLD.amount WHERE id = OLD.wallet_id;
  END IF;
  RETURN OLD;
END;
$$;

-- Transaction Reverse: handles transaction cancellation
CREATE OR REPLACE FUNCTION public.update_wallet_balance_on_reverse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_reversed = false AND NEW.is_reversed = true THEN
    IF NEW.type = 'income' THEN
      UPDATE public.wallets SET balance = balance - NEW.amount WHERE id = NEW.wallet_id;
    ELSIF NEW.type = 'expense' THEN
      UPDATE public.wallets SET balance = balance + NEW.amount WHERE id = NEW.wallet_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Debt Addition: updates debt remaining balance
CREATE OR REPLACE FUNCTION public.handle_debt_addition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.debts
  SET amount = amount + NEW.amount,
      remaining_amount = remaining_amount + NEW.amount
  WHERE id = NEW.debt_id;

  RETURN NEW;
END;
$$;

-- Attach Triggers to Transactions
DROP TRIGGER IF EXISTS trg_wallet_balance_insert ON public.transactions;
CREATE TRIGGER trg_wallet_balance_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_insert();

DROP TRIGGER IF EXISTS trg_wallet_balance_delete ON public.transactions;
CREATE TRIGGER trg_wallet_balance_delete
  AFTER DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_delete();

DROP TRIGGER IF EXISTS trg_wallet_balance_reverse ON public.transactions;
CREATE TRIGGER trg_wallet_balance_reverse
  AFTER UPDATE OF is_reversed ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_reverse();

-- Attach Trigger to Debt Additions
DROP TRIGGER IF EXISTS trg_debt_addition_insert ON public.debt_additions;
CREATE TRIGGER trg_debt_addition_insert
  AFTER INSERT ON public.debt_additions
  FOR EACH ROW EXECUTE FUNCTION public.handle_debt_addition();
