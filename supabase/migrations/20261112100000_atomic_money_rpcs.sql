-- P1-01: atomic multi-step money operations.
--
-- Each function runs in a single transaction (all-or-nothing), is SECURITY
-- INVOKER (row-level security still applies) and re-checks auth.uid().
-- Wallet balances are still maintained only by the transactions triggers, so
-- every money movement leaves a ledger row.

-- Links the two legs of a wallet-to-wallet transfer (excluded from income/expense totals).
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transfer_id uuid;
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_id ON public.transactions(transfer_id) WHERE transfer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- transfer_wallet_funds: debit + credit + linked log, with FX for cross-currency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_wallet_funds(
  p_from_wallet uuid,
  p_to_wallet uuid,
  p_amount numeric,
  p_converted_amount numeric DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from public.wallets%ROWTYPE;
  v_to public.wallets%ROWTYPE;
  v_credit numeric;
  v_transfer uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_from_wallet = p_to_wallet THEN RAISE EXCEPTION 'Select two different wallets' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023'; END IF;

  -- Lock both wallets in a stable order to avoid deadlocks.
  PERFORM 1 FROM public.wallets WHERE id IN (p_from_wallet, p_to_wallet) AND user_id = v_uid ORDER BY id FOR UPDATE;
  SELECT * INTO v_from FROM public.wallets WHERE id = p_from_wallet AND user_id = v_uid;
  SELECT * INTO v_to FROM public.wallets WHERE id = p_to_wallet AND user_id = v_uid;
  IF v_from.id IS NULL OR v_to.id IS NULL THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE = '42704'; END IF;
  IF v_from.balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance in %', v_from.name USING ERRCODE = 'P0001'; END IF;

  IF coalesce(v_from.currency, 'BDT') = coalesce(v_to.currency, 'BDT') THEN
    v_credit := p_amount;
  ELSE
    IF p_converted_amount IS NULL OR p_converted_amount <= 0 THEN
      RAISE EXCEPTION 'Converted amount is required for a % -> % transfer', v_from.currency, v_to.currency USING ERRCODE = '22023';
    END IF;
    v_credit := round(p_converted_amount, 2);
  END IF;

  INSERT INTO public.transactions (user_id, wallet_id, type, amount, category, note, date, transfer_id)
  VALUES
    (v_uid, v_from.id, 'expense', p_amount, 'Transfer',
     coalesce(nullif(p_note, ''), 'Transfer to ' || v_to.name), p_date, v_transfer),
    (v_uid, v_to.id, 'income', v_credit, 'Transfer',
     coalesce(nullif(p_note, ''), 'Transfer from ' || v_from.name)
       || CASE WHEN v_from.currency IS DISTINCT FROM v_to.currency
            THEN format(' (%s %s → %s %s)', p_amount, v_from.currency, v_credit, v_to.currency) ELSE '' END,
     p_date, v_transfer);

  RETURN v_transfer;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_debt: debt row + optional wallet transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_debt(
  p_type text,
  p_person_name text,
  p_amount numeric,
  p_wallet uuid,
  p_date date DEFAULT CURRENT_DATE,
  p_note text DEFAULT NULL,
  p_affects_wallet boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debt uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_type NOT IN ('borrowed', 'lent') THEN RAISE EXCEPTION 'Invalid debt type' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023'; END IF;
  IF coalesce(trim(p_person_name), '') = '' THEN RAISE EXCEPTION 'Person name is required' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.debts (user_id, type, person_name, amount, remaining_amount, wallet_id, note, date)
  VALUES (v_uid, p_type, trim(p_person_name), p_amount, p_amount, p_wallet, nullif(p_note, ''), p_date)
  RETURNING id INTO v_debt;

  IF p_affects_wallet THEN
    IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = p_wallet AND user_id = v_uid) THEN
      RAISE EXCEPTION 'Wallet not found' USING ERRCODE = '42704';
    END IF;
    INSERT INTO public.transactions (user_id, wallet_id, type, amount, category, note, date)
    VALUES (v_uid, p_wallet,
            CASE WHEN p_type = 'borrowed' THEN 'income' ELSE 'expense' END,
            p_amount,
            CASE WHEN p_type = 'borrowed' THEN 'Debt Borrowed' ELSE 'Debt Lent' END,
            CASE WHEN p_type = 'borrowed' THEN 'Borrowed from ' ELSE 'Lent to ' END || trim(p_person_name),
            p_date);
  END IF;

  RETURN v_debt;
END;
$$;

-- ---------------------------------------------------------------------------
-- add_to_debt: debt_additions row (trigger grows the debt) + wallet transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_to_debt(
  p_debt uuid,
  p_amount numeric,
  p_wallet uuid,
  p_date date DEFAULT CURRENT_DATE,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debt public.debts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_debt FROM public.debts WHERE id = p_debt AND user_id = v_uid FOR UPDATE;
  IF v_debt.id IS NULL THEN RAISE EXCEPTION 'Debt not found' USING ERRCODE = '42704'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = p_wallet AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = '42704';
  END IF;

  INSERT INTO public.debt_additions (debt_id, user_id, amount, date, note, wallet_id)
  VALUES (p_debt, v_uid, p_amount, p_date, nullif(p_note, ''), p_wallet);

  UPDATE public.debts SET settled = false WHERE id = p_debt;

  INSERT INTO public.transactions (user_id, wallet_id, type, amount, category, note, date)
  VALUES (v_uid, p_wallet,
          CASE WHEN v_debt.type = 'borrowed' THEN 'income' ELSE 'expense' END,
          p_amount,
          CASE WHEN v_debt.type = 'borrowed' THEN 'Borrowed - ' ELSE 'Lent - ' END || v_debt.person_name,
          coalesce(nullif(p_note, ''),
                   CASE WHEN v_debt.type = 'borrowed' THEN 'Additional borrowed from ' ELSE 'Additional lent to ' END
                   || v_debt.person_name),
          p_date);
END;
$$;

-- ---------------------------------------------------------------------------
-- record_debt_payment: payment row + remaining/settled + wallet transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_debt_payment(
  p_debt uuid,
  p_wallet uuid,
  p_amount numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_debt public.debts%ROWTYPE;
  v_remaining numeric;
  v_extra numeric;
  v_note text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_debt FROM public.debts WHERE id = p_debt AND user_id = v_uid FOR UPDATE;
  IF v_debt.id IS NULL THEN RAISE EXCEPTION 'Debt not found' USING ERRCODE = '42704'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = p_wallet AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = '42704';
  END IF;

  v_extra := greatest(0, p_amount - v_debt.remaining_amount);
  v_remaining := greatest(0, v_debt.remaining_amount - p_amount);

  INSERT INTO public.debt_payments (debt_id, user_id, amount, date, note)
  VALUES (p_debt, v_uid, p_amount, p_date, nullif(p_note, ''));

  UPDATE public.debts SET remaining_amount = v_remaining, settled = (v_remaining <= 0) WHERE id = p_debt;

  v_note := coalesce(nullif(p_note, ''),
                     CASE WHEN v_debt.type = 'borrowed' THEN 'Repaid to ' ELSE 'Recovered from ' END || v_debt.person_name)
            || CASE WHEN v_extra > 0 THEN format(' (incl. %s extra/gift)', v_extra) ELSE '' END;

  INSERT INTO public.transactions (user_id, wallet_id, type, amount, category, note, date)
  VALUES (v_uid, p_wallet,
          CASE WHEN v_debt.type = 'borrowed' THEN 'expense' ELSE 'income' END,
          p_amount,
          CASE WHEN v_debt.type = 'borrowed' THEN 'Debt Repayment' ELSE 'Debt Recovery' END,
          v_note,
          p_date);

  RETURN jsonb_build_object('remaining_amount', v_remaining, 'settled', v_remaining <= 0, 'extra', v_extra);
END;
$$;

-- ---------------------------------------------------------------------------
-- contribute_savings_goal: atomic increment + completion + optional wallet debit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contribute_savings_goal(
  p_goal uuid,
  p_amount numeric,
  p_wallet uuid DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_goal public.savings_goals%ROWTYPE;
  v_saved numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_goal FROM public.savings_goals WHERE id = p_goal AND user_id = v_uid FOR UPDATE;
  IF v_goal.id IS NULL THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE = '42704'; END IF;

  IF p_wallet IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = p_wallet AND user_id = v_uid) THEN
      RAISE EXCEPTION 'Wallet not found' USING ERRCODE = '42704';
    END IF;
    INSERT INTO public.transactions (user_id, wallet_id, type, amount, category, note, date)
    VALUES (v_uid, p_wallet, 'expense', p_amount, 'Savings Goal', 'Savings goal: ' || v_goal.title, p_date);
  END IF;

  v_saved := v_goal.saved_amount + p_amount;
  UPDATE public.savings_goals SET saved_amount = v_saved, completed = (v_saved >= target_amount) WHERE id = p_goal;

  RETURN jsonb_build_object('saved_amount', v_saved, 'completed', v_saved >= v_goal.target_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_wallet_funds(uuid, uuid, numeric, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_debt(text, text, numeric, uuid, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_debt(uuid, numeric, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contribute_savings_goal(uuid, numeric, uuid, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_wallet_funds(uuid, uuid, numeric, numeric, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_debt(text, text, numeric, uuid, date, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_to_debt(uuid, numeric, uuid, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contribute_savings_goal(uuid, numeric, uuid, date) FROM PUBLIC, anon;
