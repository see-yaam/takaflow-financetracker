-- Self-checking test of the P1-01 money RPCs. Runs inside a transaction and
-- ROLLS BACK, so nothing is kept. Run in the Supabase SQL editor (or
-- `npx supabase db query --linked --file supabase/tests/atomic_rpcs_check.sql`)
-- after applying migration 20261112100000. It raises an exception on the first
-- failed expectation and prints "ALL RPC CHECKS PASSED" otherwise.
BEGIN;

DO $$
DECLARE
  v_uid uuid := (SELECT id FROM auth.users ORDER BY created_at LIMIT 1);
  w_bdt uuid := gen_random_uuid();
  w_bdt2 uuid := gen_random_uuid();
  w_usd uuid := gen_random_uuid();
  v_debt uuid;
  v_goal uuid := gen_random_uuid();
  v_res jsonb;
  v_bal numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Need at least one auth user to run the checks'; END IF;
  -- Act as that user (what PostgREST does for a signed-in request).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.wallets (id, user_id, name, balance, currency) VALUES
    (w_bdt, v_uid, 'RPC test BDT', 1000, 'BDT'),
    (w_bdt2, v_uid, 'RPC test BDT 2', 0, 'BDT'),
    (w_usd, v_uid, 'RPC test USD', 0, 'USD');

  -- Same-currency transfer
  PERFORM public.transfer_wallet_funds(w_bdt, w_bdt2, 400);
  SELECT balance INTO v_bal FROM public.wallets WHERE id = w_bdt;  IF v_bal <> 600 THEN RAISE EXCEPTION 'transfer debit: %', v_bal; END IF;
  SELECT balance INTO v_bal FROM public.wallets WHERE id = w_bdt2; IF v_bal <> 400 THEN RAISE EXCEPTION 'transfer credit: %', v_bal; END IF;

  -- Cross-currency transfer credits the converted amount
  PERFORM public.transfer_wallet_funds(w_bdt, w_usd, 120, 1);
  SELECT balance INTO v_bal FROM public.wallets WHERE id = w_usd; IF v_bal <> 1 THEN RAISE EXCEPTION 'fx credit: %', v_bal; END IF;

  -- Insufficient balance is rejected and changes nothing
  BEGIN
    PERFORM public.transfer_wallet_funds(w_bdt2, w_bdt, 999999);
    RAISE EXCEPTION 'expected insufficient balance error';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Insufficient balance%' THEN RAISE; END IF;
  END;
  SELECT balance INTO v_bal FROM public.wallets WHERE id = w_bdt2; IF v_bal <> 400 THEN RAISE EXCEPTION 'failed transfer changed balance: %', v_bal; END IF;

  -- Debt: create (lent 100 from w_bdt), add 50, pay 200 (50 extra)
  v_debt := public.create_debt('lent', 'RPC Tester', 100, w_bdt);
  SELECT balance INTO v_bal FROM public.wallets WHERE id = w_bdt; IF v_bal <> 380 THEN RAISE EXCEPTION 'create_debt wallet: %', v_bal; END IF;
  PERFORM public.add_to_debt(v_debt, 50, w_bdt);
  IF (SELECT remaining_amount FROM public.debts WHERE id = v_debt) <> 150 THEN RAISE EXCEPTION 'add_to_debt remaining'; END IF;
  v_res := public.record_debt_payment(v_debt, w_bdt, 200);
  IF (v_res->>'settled')::boolean IS NOT TRUE OR (v_res->>'extra')::numeric <> 50 THEN RAISE EXCEPTION 'payment result: %', v_res; END IF;
  SELECT balance INTO v_bal FROM public.wallets WHERE id = w_bdt; IF v_bal <> 530 THEN RAISE EXCEPTION 'payment wallet: %', v_bal; END IF;

  -- Goal contribution with wallet deduction completes the goal
  INSERT INTO public.savings_goals (id, user_id, title, target_amount, saved_amount) VALUES (v_goal, v_uid, 'RPC goal', 100, 0);
  v_res := public.contribute_savings_goal(v_goal, 100, w_bdt);
  IF (v_res->>'completed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'goal not completed: %', v_res; END IF;
  SELECT balance INTO v_bal FROM public.wallets WHERE id = w_bdt; IF v_bal <> 430 THEN RAISE EXCEPTION 'goal wallet: %', v_bal; END IF;

  RAISE NOTICE 'ALL RPC CHECKS PASSED';
END $$;

ROLLBACK;
