/** Does a transaction belong in a ["transactions", uid, filters] query? (shared by the query and the offline outbox). */
export interface TxFilterLike {
  month?: string;
  from?: string;
  to?: string;
  walletId?: string;
  category?: string;
}

export function matchesTxFilters(
  t: { date?: string | null; wallet_id?: string | null; category?: string | null },
  f?: TxFilterLike | null
): boolean {
  if (!f) return true;
  const date = t.date || "";
  if (f.month && !date.startsWith(f.month)) return false;
  if (f.from && date < f.from) return false;
  if (f.to && date > f.to) return false;
  if (f.walletId && t.wallet_id !== f.walletId) return false;
  if (f.category && t.category !== f.category) return false;
  return true;
}
