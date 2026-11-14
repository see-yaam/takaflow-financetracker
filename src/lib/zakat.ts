/** Zakat (যাকাত) calculation, pure. All amounts in BDT. */

/** Nisab thresholds in grams (7.5 tola gold / 52.5 tola silver). */
export const NISAB_GRAMS = { gold: 87.48, silver: 612.36 } as const;
export type NisabBasis = keyof typeof NISAB_GRAMS;
export const ZAKAT_RATE = 0.025;

export interface ZakatInput {
  /** Eligible cash + MFS + bank balances. */
  cashAndBank: number;
  /** Other zakatable assets (gold/silver value, savings, business stock). */
  otherAssets?: number;
  /** Recoverable money others owe you (active "lent" debts). */
  receivables?: number;
  /** Short-term debts you owe now (active "borrowed" debts), deducted. */
  shortTermDebts?: number;
  basis: NisabBasis;
  /** Current market price per gram of the chosen metal, in BDT. */
  pricePerGram: number;
}

export interface ZakatResult {
  netWealth: number;
  nisab: number;
  eligible: boolean;
  due: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pos = (n: number | undefined) => (Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0);

export function computeZakat(input: ZakatInput): ZakatResult {
  const netWealth = round2(pos(input.cashAndBank) + pos(input.otherAssets) + pos(input.receivables) - pos(input.shortTermDebts));
  const nisab = round2(NISAB_GRAMS[input.basis] * pos(input.pricePerGram));
  const eligible = nisab > 0 && netWealth >= nisab;
  return { netWealth, nisab, eligible, due: eligible ? round2(netWealth * ZAKAT_RATE) : 0 };
}
