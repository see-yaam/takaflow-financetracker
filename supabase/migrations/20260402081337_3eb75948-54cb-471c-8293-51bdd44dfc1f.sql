
-- Create debt_additions table
CREATE TABLE public.debt_additions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.debt_additions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own debt additions"
  ON public.debt_additions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own debt additions"
  ON public.debt_additions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own debt additions"
  ON public.debt_additions FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger function: update debt amounts and wallet balance on addition
CREATE OR REPLACE FUNCTION public.handle_debt_addition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_debt RECORD;
BEGIN
  SELECT * INTO v_debt FROM public.debts WHERE id = NEW.debt_id;
  
  -- Update debt amounts
  UPDATE public.debts
  SET amount = amount + NEW.amount,
      remaining_amount = remaining_amount + NEW.amount
  WHERE id = NEW.debt_id;

  -- Update wallet balance
  IF v_debt.type = 'borrowed' THEN
    UPDATE public.wallets SET balance = balance + NEW.amount WHERE id = v_debt.wallet_id;
  ELSIF v_debt.type = 'lent' THEN
    UPDATE public.wallets SET balance = balance - NEW.amount WHERE id = v_debt.wallet_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_debt_addition_insert
  AFTER INSERT ON public.debt_additions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_debt_addition();
