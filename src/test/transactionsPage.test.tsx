import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const rows = [
  { id: "1", date: "2026-11-02", type: "expense", amount: 120, category: "Food & Dining", note: "Kacchi", wallet_id: "w1" },
  { id: "2", date: "2026-11-03", type: "income", amount: 50000, category: "Salary", note: null, wallet_id: "w1" },
];
vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({ data: rows, isLoading: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn() }),
  useReverseTransaction: () => ({ mutateAsync: vi.fn() }),
  useUpdateTransactionCategory: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useWallets", () => ({ useWallets: () => ({ data: [{ id: "w1", name: "bKash", currency: "BDT", balance: 0 }] }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import TransactionsPage from "@/pages/TransactionsPage";

describe("TransactionsPage", () => {
  it("lists transactions and filters them by search", () => {
    render(<TransactionsPage />);
    expect(screen.getByText("2 transactions")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "kacchi" } });
    expect(screen.getByText("1 transaction")).toBeInTheDocument();
    expect(screen.getByText("Food & Dining")).toBeInTheDocument();
  });

  it("shows bulk actions once a row is selected", () => {
    render(<TransactionsPage />);
    fireEvent.click(screen.getByLabelText("Select Salary 2026-11-03"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /categorize/i })).toBeDisabled();
  });
});
