import { parseBangladeshFinancialSms } from "@/lib/smsParser";
import { strongTrxId } from "@/lib/smsIngest";

/** Mobile-financial-service wallets that charge a cash-out fee. */
const MFS_NAME = /(bkash|বিকাশ|nagad|নগদ|rocket|রকেট)/i;

export function isMfsWallet(name: string | null | undefined): boolean {
  return !!name && MFS_NAME.test(name);
}

/** Common BD cash-out rates (percent). */
export const CASH_OUT_RATES = [1.49, 1.85] as const;

/** Fee for cashing out `amount` at `ratePct` percent, rounded to paisa. */
export function computeCashOutFee(amount: number, ratePct: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(ratePct) || amount <= 0 || ratePct <= 0) return 0;
  return Math.round(amount * ratePct) / 100;
}

export interface SmsDraft {
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  walletId?: string;
  source: string;
}

/**
 * Turns a pasted bKash/Nagad/bank SMS into form values. No sender is given, so
 * the parser trusts the text (the user pasted it themselves).
 */
export function smsToDraft(text: string, wallets: Array<{ id: string; name: string }>): SmsDraft | null {
  const parsed = parseBangladeshFinancialSms(text.trim());
  if (!parsed) return null;
  const source = parsed.source.toLowerCase();
  const wallet =
    wallets.find((w) => w.name.toLowerCase().includes(source)) ||
    wallets.find((w) => source.includes(w.name.toLowerCase()));
  const trx = strongTrxId(parsed.rawSms || text) || parsed.trxId;
  const note = [parsed.source, parsed.merchantOrParty ? `(${parsed.merchantOrParty})` : "", trx ? `Trx: ${trx}` : ""]
    .filter(Boolean)
    .join(" ");
  return {
    type: parsed.type,
    amount: parsed.amount,
    category: parsed.categorySuggestion || "Other",
    note,
    walletId: wallet?.id,
    source: parsed.source,
  };
}
