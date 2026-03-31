
-- Drop old triggers and functions
DROP TRIGGER IF EXISTS trg_wallet_balance_insert ON public.transactions;
DROP TRIGGER IF EXISTS trg_wallet_balance_delete ON public.transactions;

-- Recreate insert trigger: skip if already reversed
CREATE OR REPLACE FUNCTION public.update_wallet_balance_on_insert()
RETURNS trigger
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

-- Recreate delete trigger: skip if reversed (balance already undone)
CREATE OR REPLACE FUNCTION public.update_wallet_balance_on_delete()
RETURNS trigger
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

-- Add update trigger for reversals
CREATE OR REPLACE FUNCTION public.update_wallet_balance_on_reverse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when is_reversed changes from false to true
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

CREATE TRIGGER trg_wallet_balance_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_insert();

CREATE TRIGGER trg_wallet_balance_delete
  AFTER DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_delete();

CREATE TRIGGER trg_wallet_balance_reverse
  AFTER UPDATE OF is_reversed ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_reverse();
