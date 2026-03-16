import { useQuery } from "@tanstack/react-query";

const SUPPORTED_CURRENCIES = ["BDT", "USD", "EUR", "GBP"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export const CURRENCIES = SUPPORTED_CURRENCIES;

export function useCurrencyRates() {
  return useQuery({
    queryKey: ["currency_rates"],
    queryFn: async () => {
      const res = await fetch("https://open.er-api.com/v6/latest/BDT");
      if (!res.ok) throw new Error("Failed to fetch rates");
      const data = await res.json();
      // rates are relative to BDT, we need inverse (how many BDT per 1 unit)
      const rates: Record<string, number> = { BDT: 1 };
      for (const c of SUPPORTED_CURRENCIES) {
        if (c === "BDT") continue;
        rates[c] = data.rates?.[c] ? 1 / data.rates[c] : 1;
      }
      return rates;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 2,
  });
}

export function convertToBDT(amount: number, currency: string, rates: Record<string, number> | undefined): number {
  if (!rates || currency === "BDT") return amount;
  return amount * (rates[currency] || 1);
}
