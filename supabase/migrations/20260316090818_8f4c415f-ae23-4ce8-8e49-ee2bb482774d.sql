DROP TRIGGER IF EXISTS trg_wallet_balance_insert ON public.transactions;
DROP TRIGGER IF EXISTS trg_wallet_balance_delete ON public.transactions;

CREATE TRIGGER trg_wallet_balance_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_insert();

CREATE TRIGGER trg_wallet_balance_delete
  AFTER DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance_on_delete();