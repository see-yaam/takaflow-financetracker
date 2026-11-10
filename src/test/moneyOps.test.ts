import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertAmount } from "@/lib/fx";
import { reportableTransactions, sumIncomeExpenseInBDT } from "@/lib/finance";
import { OnlineRequiredError, requireOnline } from "@/lib/onlineOnly";

const RATES = { BDT: 1, USD: 120, EUR: 130, GBP: 150 };

describe("convertAmount (cross-currency transfers)", () => {
  it("converts through BDT", () => {
    expect(convertAmount(100, "USD", "BDT", RATES)).toBe(12000);
    expect(convertAmount(12000, "BDT", "USD", RATES)).toBe(100);
    expect(convertAmount(100, "GBP", "EUR", RATES)).toBe(115.38);
  });
  it("is identity for the same currency and null when a rate is unknown", () => {
    expect(convertAmount(55.555, "BDT", "BDT", undefined)).toBe(55.56);
    expect(convertAmount(10, "USD", "BDT", undefined)).toBeNull();
  });
});

describe("totals exclude transfers and convert to BDT", () => {
  const txs = [
    { wallet_id: "bdt", type: "income", amount: 1000 },
    { wallet_id: "usd", type: "expense", amount: 10 },
    { wallet_id: "bdt", type: "expense", amount: 500, transfer_id: "t1" },
    { wallet_id: "usd", type: "income", amount: 4, transfer_id: "t1" },
    { wallet_id: "bdt", type: "expense", amount: 300, is_reversed: true },
  ];
  it("drops reversed rows and transfer legs", () => {
    expect(reportableTransactions(txs)).toHaveLength(2);
  });
  it("sums in BDT using each wallet's currency", () => {
    const cur = (id?: string) => (id === "usd" ? "USD" : "BDT");
    expect(sumIncomeExpenseInBDT(txs, cur, RATES)).toEqual({ income: 1000, expense: 1200 });
  });
});

describe("requireOnline", () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  });
  afterEach(() => vi.restoreAllMocks());
  it("fails fast offline with a clear message", () => {
    expect(() => requireOnline("Transferring between wallets")).toThrow(OnlineRequiredError);
    expect(() => requireOnline("Transferring between wallets")).toThrow(/needs an internet connection/);
  });
});
