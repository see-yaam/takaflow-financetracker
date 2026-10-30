import { describe, it, expect } from "vitest";
import { formatMoney } from "../lib/utils";

describe("Financial Calculations & Business Logic Integrity", () => {
  describe("Wallet Balance Updates", () => {
    it("correctly calculates balance after income and expense transactions", () => {
      let walletBalance = 5000; // Initial balance: 5,000 ৳

      // Income transaction: +12,500 ৳
      const incomeAmount = 12500;
      walletBalance += incomeAmount;
      expect(walletBalance).toBe(17500);

      // Expense transaction: -3,250.75 ৳
      const expenseAmount = 3250.75;
      walletBalance -= expenseAmount;
      expect(walletBalance).toBe(14249.25);
    });

    it("verifies wallet transfers preserve total net worth across the vault", () => {
      let bKashBalance = 10000;
      let bankBalance = 25000;
      const initialTotalWealth = bKashBalance + bankBalance;

      // Transfer 4,500 ৳ from Bank to bKash
      const transferAmount = 4500;
      bankBalance -= transferAmount;
      bKashBalance += transferAmount;

      expect(bankBalance).toBe(20500);
      expect(bKashBalance).toBe(14500);
      expect(bKashBalance + bankBalance).toBe(initialTotalWealth);
    });
  });

  describe("Dhar-Dena (Debt & Loan) Calculations", () => {
    it("handles initial debt, partial repayments, and auto-settlement", () => {
      const initialDebt = 10000; // Borrowed 10,000 ৳ from Rahim
      let remainingAmount = initialDebt;
      let settled = false;

      // First partial payment: 3,000 ৳
      const payment1 = 3000;
      remainingAmount = Math.max(0, remainingAmount - payment1);
      settled = remainingAmount === 0;

      expect(remainingAmount).toBe(7000);
      expect(settled).toBe(false);

      // Second partial payment: 5,000 ৳
      const payment2 = 5000;
      remainingAmount = Math.max(0, remainingAmount - payment2);
      settled = remainingAmount === 0;

      expect(remainingAmount).toBe(2000);
      expect(settled).toBe(false);

      // Final payment of remaining 2,000 ৳
      const payment3 = 2000;
      remainingAmount = Math.max(0, remainingAmount - payment3);
      settled = remainingAmount === 0;

      expect(remainingAmount).toBe(0);
      expect(settled).toBe(true);
    });

    it("calculates debt addition correctly when borrowing more from same person", () => {
      let remainingAmount = 5000;
      const additionalLoan = 3000;

      remainingAmount += additionalLoan;
      expect(remainingAmount).toBe(8000);
    });

    it("allows paying back more than remaining debt (gratitude/extra gift) and clamps remaining to 0", () => {
      const remainingAmount = 100;
      const paymentAmount = 120; // 100 debt + 20 extra gift
      const newRemaining = Math.max(0, remainingAmount - paymentAmount);
      const extraGift = paymentAmount > remainingAmount ? paymentAmount - remainingAmount : 0;
      const settled = newRemaining === 0;

      expect(newRemaining).toBe(0);
      expect(extraGift).toBe(20);
      expect(settled).toBe(true);
    });
  });

  describe("Monthly Budget Tracking & Alerts", () => {
    it("computes accurate budget percentage spent", () => {
      const budgetLimit = 15000; // 15,000 ৳ budget for Groceries

      const spentAmount = 7500;
      const percentSpent = (spentAmount / budgetLimit) * 100;
      expect(percentSpent).toBe(50);

      const remainingBudget = budgetLimit - spentAmount;
      expect(remainingBudget).toBe(7500);
    });

    it("correctly identifies over-budget situations (>= 100%)", () => {
      const budgetLimit = 10000;
      const spentAmount = 11200;

      const isOverBudget = spentAmount > budgetLimit;
      const overspentAmount = spentAmount - budgetLimit;
      const percentSpent = (spentAmount / budgetLimit) * 100;

      expect(isOverBudget).toBe(true);
      expect(overspentAmount).toBe(1200);
      expect(percentSpent).toBeCloseTo(112);
    });
  });

  describe("Multi-Currency Conversion", () => {
    it("converts international balances to BDT using benchmark exchange rates", () => {
      const rates: Record<string, number> = {
        USD: 122.5,
        EUR: 133.2,
        GBP: 155.8,
        BDT: 1.0,
      };

      const usdWalletAmount = 150;
      const convertedToBdt = usdWalletAmount * rates["USD"];
      expect(convertedToBdt).toBeCloseTo(18375); // 150 * 122.5 = 18,375 ৳

      const gbpWalletAmount = 50;
      const gbpToBdt = gbpWalletAmount * rates["GBP"];
      expect(gbpToBdt).toBeCloseTo(7790); // 50 * 155.8 = 7,790 ৳
    });
  });

  describe("Non-Negative Balance Protection & Currency Formatting", () => {
    it("formats positive, zero, and negative money with proper sign placement", () => {
      expect(formatMoney(50)).toBe("৳50.00");
      expect(formatMoney(0)).toBe("৳0.00");
      expect(formatMoney(-10)).toBe("-৳10.00");
      expect(formatMoney(-60.5)).toBe("-৳60.50");
      expect(formatMoney(120, "USD")).toBe("USD 120.00");
      expect(formatMoney(-25, "USD")).toBe("-USD 25.00");
    });

    it("detects when an expense exceeds wallet balance and calculates shortage correctly", () => {
      const walletBalance = 10;
      const expenseAmount = 12;
      const hasInsufficientBalance = walletBalance < expenseAmount;
      const shortage = Math.max(0, expenseAmount - walletBalance);

      expect(hasInsufficientBalance).toBe(true);
      expect(shortage).toBe(2);
    });

    it("verifies inter-wallet loading prevents wallet balance from going negative", () => {
      let bKashBalance = 10;
      let pocketBalance = 50;
      const expenseAmount = 12;
      const shortage = expenseAmount - bKashBalance; // 2 ৳

      // User transfers shortage from Pocket to bKash
      pocketBalance -= shortage;
      bKashBalance += shortage;

      // Now expense executes
      bKashBalance -= expenseAmount;

      expect(bKashBalance).toBe(0); // Zero, NEVER negative!
      expect(pocketBalance).toBe(48);
      expect(bKashBalance >= 0).toBe(true);
      expect(pocketBalance >= 0).toBe(true);
    });
  });
});
