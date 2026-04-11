CREATE OR REPLACE FUNCTION public.handle_debt_addition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Update debt amounts only; wallet balance is handled by the transaction insert
  UPDATE public.debts
  SET amount = amount + NEW.amount,
      remaining_amount = remaining_amount + NEW.amount
  WHERE id = NEW.debt_id;

  RETURN NEW;
END;
$$;