import { describe, it, expect } from "vitest";
import { activeTransactions, computeRolloverSnapshot, monthBounds, sumIncomeExpense } from "@/lib/finance";

describe("sumIncomeExpense / activeTransactions", () => {
  it("excludes reversed transactions", () => {
    const txs = [
      { type: "income", amount: 1000 },
      { type: "expense", amount: 300 },
      { type: "expense", amount: 500, is_reversed: true },
      { type: "income", amount: "200.50", is_reversed: false },
    ];
    expect(activeTransactions(txs)).toHaveLength(3);
    expect(sumIncomeExpense(txs)).toEqual({ income: 1200.5, expense: 300 });
  });

  it("handles empty / missing input", () => {
    expect(sumIncomeExpense(undefined)).toEqual({ income: 0, expense: 0 });
  });
});

describe("monthBounds", () => {
  it("returns the real last day, including leap years", () => {
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthBounds("2028-02").end).toBe("2028-02-29");
    expect(monthBounds("2026-10").end).toBe("2026-10-31");
  });
});

describe("computeRolloverSnapshot (month rollover run mid-month)", () => {
  // Wallet started October at 10,000. October: +5,000 income, -2,000 expense (+ a reversed
  // -700 that the trigger already undid). November so far: -1,500. A future-dated +300 exists.
  // Today's balance therefore = 10000 + 5000 - 2000 - 1500 + 300 = 11,800.
  const txs = [
    { date: "2026-10-01", type: "income", amount: 5000 },
    { date: "2026-10-15", type: "expense", amount: 2000 },
    { date: "2026-10-20", type: "expense", amount: 700, is_reversed: true },
    { date: "2026-11-03", type: "expense", amount: 1500 },
    { date: "2026-12-01", type: "income", amount: 300 },
  ];

  it("computes October's opening/closing from today's balance by backing out later activity", () => {
    expect(computeRolloverSnapshot(11800, txs, "2026-10")).toEqual({
      opening_balance: 10000,
      closing_balance: 13000,
      total_income: 5000,
      total_expense: 2000,
    });
  });

  it("matches the naive formula only when nothing happened after the month", () => {
    const octOnly = txs.filter((t) => t.date.startsWith("2026-10"));
    // balance now = 10000 + 5000 - 2000 = 13000
    expect(computeRolloverSnapshot(13000, octOnly, "2026-10").opening_balance).toBe(10000);
  });

  it("ignores transactions dated before the month even if passed in", () => {
    const withOld = [...txs, { date: "2026-09-30", type: "income", amount: 99999 }];
    expect(computeRolloverSnapshot(11800, withOld, "2026-10").opening_balance).toBe(10000);
  });
});
