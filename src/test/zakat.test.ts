import { describe, it, expect } from "vitest";
import { computeZakat, NISAB_GRAMS } from "@/lib/zakat";

describe("computeZakat", () => {
  it("silver basis: 2.5% of net wealth once at or above Nisab", () => {
    const price = 150; // BDT per gram silver
    const nisab = Math.round(NISAB_GRAMS.silver * price * 100) / 100; // 91,854
    expect(computeZakat({ cashAndBank: 100000, basis: "silver", pricePerGram: price })).toEqual({
      netWealth: 100000,
      nisab,
      eligible: true,
      due: 2500,
    });
    expect(computeZakat({ cashAndBank: nisab, basis: "silver", pricePerGram: price }).eligible).toBe(true);
    expect(computeZakat({ cashAndBank: nisab - 1, basis: "silver", pricePerGram: price })).toMatchObject({ eligible: false, due: 0 });
  });

  it("gold basis has a much higher threshold", () => {
    const r = computeZakat({ cashAndBank: 500000, basis: "gold", pricePerGram: 12000 });
    expect(r.nisab).toBe(1049760);
    expect(r.eligible).toBe(false);
  });

  it("adds receivables and other assets, deducts short-term debts", () => {
    const r = computeZakat({ cashAndBank: 80000, otherAssets: 50000, receivables: 20000, shortTermDebts: 30000, basis: "silver", pricePerGram: 100 });
    expect(r.netWealth).toBe(120000);
    expect(r.due).toBe(3000);
  });

  it("is never eligible without a price", () => {
    expect(computeZakat({ cashAndBank: 1e9, basis: "silver", pricePerGram: 0 })).toMatchObject({ eligible: false, due: 0 });
  });
});
