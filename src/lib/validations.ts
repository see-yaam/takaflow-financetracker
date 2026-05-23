import { z } from "zod";

const positiveAmount = z.coerce.number().positive("Amount must be greater than zero");
const nonNegativeAmount = z.coerce.number().min(0, "Amount cannot be negative");
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const monthString = z.string().regex(/^\d{4}-\d{2}$/, "Invalid month");
const uuid = z.string().uuid("Invalid selection");

export const walletCreateSchema = z.object({
  name: z.string().trim().min(1, "Wallet name is required").max(100),
  balance: nonNegativeAmount,
  icon: z.string().optional(),
  currency: z.string().min(3).max(5),
});

export const walletUpdateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, "Wallet name is required").max(100).optional(),
  balance: nonNegativeAmount.optional(),
});

export const transactionCreateSchema = z.object({
  wallet_id: uuid,
  type: z.enum(["income", "expense"]),
  amount: positiveAmount,
  category: z.string().trim().min(1, "Category is required").max(100),
  note: z.string().trim().max(500).optional(),
  date: dateString,
});

export const recurringCreateSchema = z.object({
  wallet_id: uuid,
  type: z.enum(["income", "expense"]),
  amount: positiveAmount,
  category: z.string().trim().min(1, "Category is required").max(100),
  note: z.string().trim().max(500).optional(),
  day_of_month: z.number().int().min(1).max(31),
});

export const budgetGoalSchema = z.object({
  month: monthString,
  monthly_budget: positiveAmount,
});

export const savingsGoalCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  target_amount: positiveAmount,
  deadline: dateString.optional(),
  emoji: z.string().max(10).optional(),
});

export const savingsGoalContributionSchema = z.object({
  goalId: uuid,
  amount: positiveAmount,
  walletId: uuid,
  userId: uuid,
});

export const debtCreateSchema = z.object({
  type: z.enum(["borrowed", "lent"]),
  person_name: z.string().trim().min(1, "Person name is required").max(100),
  amount: positiveAmount,
  wallet_id: uuid,
  date: dateString,
  note: z.string().trim().max(500).optional(),
});

export const debtPaymentSchema = z.object({
  debtId: uuid,
  amount: positiveAmount,
  date: dateString,
  note: z.string().trim().max(500).optional(),
  debtType: z.enum(["borrowed", "lent"]),
  walletId: uuid,
  personName: z.string().trim().min(1).max(100),
  currentRemaining: nonNegativeAmount,
});

export const debtAdditionSchema = z.object({
  debtId: uuid,
  amount: positiveAmount,
  date: dateString,
  note: z.string().trim().max(500).optional(),
  walletId: uuid,
  debtType: z.enum(["borrowed", "lent"]),
  personName: z.string().trim().min(1).max(100),
});

export const transferSchema = z.object({
  fromWalletId: uuid,
  toWalletId: uuid,
  amount: positiveAmount,
}).refine((d) => d.fromWalletId !== d.toWalletId, {
  message: "Select two different wallets",
  path: ["toWalletId"],
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signupSchema = loginSchema;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export const onboardingWalletSchema = z.object({
  name: z.string().trim().min(1, "Wallet name is required").max(100),
  balance: nonNegativeAmount,
  icon: z.string(),
  currency: z.string().min(3).max(5),
});
