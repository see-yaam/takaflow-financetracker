/**
 * Currency conversion using `rates` = BDT per 1 unit of each currency
 * (the shape returned by useCurrencyRates: { BDT: 1, USD: 122.5, ... }).
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> | undefined
): number | null {
  const from = fromCurrency || "BDT";
  const to = toCurrency || "BDT";
  if (!Number.isFinite(amount)) return null;
  if (from === to) return round2(amount);
  const fromRate = from === "BDT" ? 1 : rates?.[from];
  const toRate = to === "BDT" ? 1 : rates?.[to];
  if (!fromRate || !toRate) return null; // rate unknown: caller must ask the user
  return round2((amount * fromRate) / toRate);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
