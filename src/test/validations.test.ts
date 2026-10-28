import { describe, it, expect } from "vitest";
import {
  walletCreateSchema,
  walletUpdateSchema,
  transactionCreateSchema,
  recurringCreateSchema,
  budgetGoalSchema,
  savingsGoalSchema,
  debtCreateSchema,
  debtPaymentSchema,
  transferSchema,
  loginSchema,
  resetPasswordSchema,
  forgotPasswordSchema,
} from "@/lib/validations";

const VALID_UUID_1 = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
const VALID_UUID_2 = "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e";

describe("Validation Schemas & Financial Edge Cases", () => {
  describe("walletCreateSchema", () => {
    it("accepts valid wallet details with positive balance", () => {
      const result = walletCreateSchema.safeParse({
        name: "bKash Personal",
        balance: 1500.5,
        currency: "BDT",
        icon: "smartphone",
      });
      expect(result.success).toBe(true);
    });

    it("accepts zero initial balance", () => {
      const result = walletCreateSchema.safeParse({
        name: "City Bank",
        balance: 0,
        currency: "BDT",
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative initial balance", () => {
      const result = walletCreateSchema.safeParse({
        name: "Pocket Cash",
        balance: -500,
        currency: "BDT",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Amount cannot be negative");
      }
    });

    it("rejects empty wallet name", () => {
      const result = walletCreateSchema.safeParse({
        name: "   ",
        balance: 100,
        currency: "BDT",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("transactionCreateSchema", () => {
    it("validates valid expense transaction", () => {
      const result = transactionCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "expense",
        amount: 350,
        category: "Food & Dining",
        note: "Dinner with friends",
        date: "2026-10-28",
      });
      expect(result.success).toBe(true);
    });

    it("validates valid income transaction", () => {
      const result = transactionCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "income",
        amount: 50000,
        category: "Salary",
        date: "2026-10-01",
      });
      expect(result.success).toBe(true);
    });

    it("rejects 0 amount transactions", () => {
      const result = transactionCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "expense",
        amount: 0,
        category: "Snacks",
        date: "2026-10-28",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Amount must be greater than zero");
      }
    });

    it("rejects negative amount transactions", () => {
      const result = transactionCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "income",
        amount: -100,
        category: "Refund",
        date: "2026-10-28",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid date format", () => {
      const result = transactionCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "expense",
        amount: 200,
        category: "Transport",
        date: "28/10/2026", // Wrong format
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Invalid date");
      }
    });
  });

  describe("transferSchema (Inter-Wallet Transfers)", () => {
    it("allows transferring positive funds between two distinct wallets", () => {
      const result = transferSchema.safeParse({
        fromWalletId: VALID_UUID_1,
        toWalletId: VALID_UUID_2,
        amount: 2500,
      });
      expect(result.success).toBe(true);
    });

    it("CRITICAL EDGE CASE: rejects transfer between identical wallets", () => {
      const result = transferSchema.safeParse({
        fromWalletId: VALID_UUID_1,
        toWalletId: VALID_UUID_1, // Same wallet!
        amount: 1000,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Select two different wallets");
      }
    });

    it("rejects transfer with 0 or negative amount", () => {
      const result = transferSchema.safeParse({
        fromWalletId: VALID_UUID_1,
        toWalletId: VALID_UUID_2,
        amount: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("debtCreateSchema & debtPaymentSchema", () => {
    it("accepts valid debt creation for borrowed money", () => {
      const result = debtCreateSchema.safeParse({
        type: "borrowed",
        person_name: "Tanvir Ahmed",
        amount: 5000,
        wallet_id: VALID_UUID_1,
        date: "2026-10-25",
        note: "Urgent medical loan",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid debt creation for lent money", () => {
      const result = debtCreateSchema.safeParse({
        type: "lent",
        person_name: "Rafiqul Islam",
        amount: 2000,
        wallet_id: VALID_UUID_1,
        date: "2026-10-27",
      });
      expect(result.success).toBe(true);
    });

    it("rejects debt payment with negative amount", () => {
      const result = debtPaymentSchema.safeParse({
        debtId: VALID_UUID_1,
        amount: -500,
        date: "2026-10-28",
        walletId: VALID_UUID_2,
        debtType: "borrowed",
        personName: "Tanvir Ahmed",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("recurringCreateSchema", () => {
    it("accepts day of month between 1 and 31", () => {
      const result = recurringCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "expense",
        amount: 1200,
        category: "Utilities",
        day_of_month: 15,
      });
      expect(result.success).toBe(true);
    });

    it("rejects day 0 or day greater than 31", () => {
      const res0 = recurringCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "expense",
        amount: 1200,
        category: "Utilities",
        day_of_month: 0,
      });
      expect(res0.success).toBe(false);

      const res32 = recurringCreateSchema.safeParse({
        wallet_id: VALID_UUID_1,
        type: "expense",
        amount: 1200,
        category: "Utilities",
        day_of_month: 32,
      });
      expect(res32.success).toBe(false);
    });
  });

  describe("loginSchema & resetPasswordSchema", () => {
    it("validates legitimate email and password (min 6 chars)", () => {
      const result = loginSchema.safeParse({
        email: "seyam@gmail.com",
        password: "securePassword123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects password less than 6 characters", () => {
      const result = loginSchema.safeParse({
        email: "seyam@gmail.com",
        password: "12345",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Password must be at least 6 characters");
      }
    });

    it("rejects malformed email address", () => {
      const result = loginSchema.safeParse({
        email: "not-an-email",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("validates reset password confirmation match", () => {
      const matchResult = resetPasswordSchema.safeParse({
        password: "newVaultPassword2026",
        confirmPassword: "newVaultPassword2026",
      });
      expect(matchResult.success).toBe(true);

      const mismatchResult = resetPasswordSchema.safeParse({
        password: "newVaultPassword2026",
        confirmPassword: "differentPassword",
      });
      expect(mismatchResult.success).toBe(false);
      if (!mismatchResult.success) {
        expect(mismatchResult.error.errors[0].message).toBe("Passwords do not match");
      }
    });
  });
});
