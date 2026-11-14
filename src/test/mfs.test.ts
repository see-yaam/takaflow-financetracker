import { describe, it, expect } from "vitest";
import { computeCashOutFee, isMfsWallet, smsToDraft } from "@/lib/mfs";

describe("cash-out fee", () => {
  it("computes 1.85% and 1.49% to the paisa", () => {
    expect(computeCashOutFee(1000, 1.85)).toBe(18.5);
    expect(computeCashOutFee(2500, 1.49)).toBe(37.25);
    expect(computeCashOutFee(0, 1.85)).toBe(0);
    expect(computeCashOutFee(100, -1)).toBe(0);
  });
  it("only applies to bKash/Nagad/Rocket wallets", () => {
    expect(isMfsWallet("bKash Personal")).toBe(true);
    expect(isMfsWallet("নগদ")).toBe(true);
    expect(isMfsWallet("City Bank")).toBe(false);
    expect(isMfsWallet(undefined)).toBe(false);
  });
});

describe("paste SMS -> form draft", () => {
  const wallets = [
    { id: "w-cash", name: "Cash" },
    { id: "w-bkash", name: "bKash" },
  ];
  it("prefills type, amount, wallet and TrxID note", () => {
    const d = smsToDraft(
      "bKash: You have received Tk 1,500.00 from 01711000000. Fee Tk 0.00. Balance Tk 4,500.00. TrxID 9K48FL29XY at 10/11/2026 14:30",
      wallets
    );
    expect(d).toMatchObject({ type: "income", amount: 1500, walletId: "w-bkash" });
    expect(d?.note).toContain("Trx: 9K48FL29XY");
  });
  it("keeps the current wallet when the provider is unknown", () => {
    expect(smsToDraft("Received Tk 200.00. Balance Tk 900.00", wallets)?.walletId).toBeUndefined();
  });
  it("returns null for text that is not a transaction", () => {
    expect(smsToDraft("Hello, how are you?", wallets)).toBeNull();
  });
});
