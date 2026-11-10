/** Pure money math shared by Dashboard, Goals, Streaks and the month rollover. */

export interface MoneyTx {
  type: string;
  amount: number | string;
  is_reversed?: boolean | null;
  date?: string;
}

/** Reversed transactions no longer affect balances (the DB trigger undid them), so they never count. */
export function activeTransactions<T extends { is_reversed?: boolean | null }>(txs: T[] | null | undefined): T[] {
  return (txs || []).filter((t) => !t.is_reversed);
}

export function sumIncomeExpense(txs: MoneyTx[] | null | undefined): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const t of activeTransactions(txs)) {
    if (t.type === "income") income += Number(t.amount);
    else if (t.type === "expense") expense += Number(t.amount);
  }
  return { income: round2(income), expense: round2(expense) };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** First and last calendar day ("yyyy-MM-dd") of a "yyyy-MM" month. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * Snapshot of `month` for one wallet.
 *
 * `balanceNow` already includes EVERY active transaction (the balance trigger
 * applies them on insert, whatever their date). So the balance at the end of
 * `month` is today's balance minus everything dated after that month, and the
 * opening balance is that closing balance minus the month's own net change.
 *
 * `txsSinceMonthStart` must contain this wallet's transactions dated on or
 * after the first day of `month` (including later months and future-dated ones).
 */
export function computeRolloverSnapshot(
  balanceNow: number,
  txsSinceMonthStart: MoneyTx[],
  month: string
): { opening_balance: number; total_income: number; total_expense: number; closing_balance: number } {
  const { start, end } = monthBounds(month);
  const active = activeTransactions(txsSinceMonthStart).filter((t) => !!t.date && t.date >= start);
  const after = active.filter((t) => (t.date as string) > end);
  const inMonth = active.filter((t) => (t.date as string) <= end);

  const netAfter = after.reduce((s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
  const closing = Number(balanceNow) - netAfter;
  const { income, expense } = sumIncomeExpense(inMonth);
  const opening = closing - (income - expense);

  return {
    opening_balance: round2(opening),
    total_income: income,
    total_expense: expense,
    closing_balance: round2(closing),
  };
}

/**
 * Transactions that count as real income/expense. Reversed rows never count,
 * and the two legs of a wallet-to-wallet transfer (transfer_id set) only move
 * money between your own wallets, so they are excluded from totals.
 */
export function reportableTransactions<T extends { is_reversed?: boolean | null; transfer_id?: string | null }>(
  txs: T[] | null | undefined
): T[] {
  return activeTransactions(txs).filter((t) => !t.transfer_id);
}

/** Income/expense totals in BDT for transactions from wallets in different currencies. */
export function sumIncomeExpenseInBDT(
  txs: Array<MoneyTx & { wallet_id?: string; transfer_id?: string | null }> | null | undefined,
  currencyOfWallet: (walletId: string | undefined) => string | undefined,
  rates: Record<string, number> | undefined
): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const t of reportableTransactions(txs)) {
    const cur = currencyOfWallet(t.wallet_id) || "BDT";
    const rate = cur === "BDT" ? 1 : rates?.[cur] ?? 1;
    const bdt = Number(t.amount) * rate;
    if (t.type === "income") income += bdt;
    else if (t.type === "expense") expense += bdt;
  }
  return { income: round2(income), expense: round2(expense) };
}

/** Days left in the month including today (>= 1). */
export function daysLeftInMonth(today: Date): number {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return last - today.getDate() + 1;
}

/**
 * Safe daily allowance: what is left of this month's budget spread over the
 * remaining days (including today). Negative remaining means over budget.
 */
export function safeDailyAllowance(budget: number, spent: number, today: Date): { remaining: number; perDay: number; daysLeft: number } {
  const daysLeft = daysLeftInMonth(today);
  const remaining = round2(budget - spent);
  return { remaining, perDay: remaining > 0 ? round2(remaining / daysLeft) : 0, daysLeft };
}

/**
 * Budget runway: how many days the current balance lasts at this month's
 * average daily spend. null when nothing has been spent yet.
 */
export function budgetRunwayDays(balance: number, spentThisMonth: number, today: Date): number | null {
  const daysElapsed = today.getDate();
  const avgDaily = spentThisMonth / daysElapsed;
  if (!(avgDaily > 0)) return null;
  return Math.max(0, Math.floor(balance / avgDaily));
}
