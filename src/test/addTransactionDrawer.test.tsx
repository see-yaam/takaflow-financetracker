import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Wallet list returned by the mocked useWallets(); tests swap it to simulate a background refetch.
let walletsData: Array<{ id: string; name: string; balance: number; currency: string }> = [];

vi.mock("@/hooks/useWallets", () => ({
  useWallets: () => ({ data: walletsData }),
  useCreateWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  useCreateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useRecurringTransactions", () => ({
  useCreateRecurring: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/CategoryPicker", () => ({ default: () => <div data-testid="category-picker" /> }));
vi.mock("@/components/InsufficientBalanceModal", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import AddTransactionDrawer from "@/components/AddTransactionDrawer";

const W1 = { id: "w1", name: "bKash", balance: 1000, currency: "BDT" };
const W2 = { id: "w2", name: "Cash", balance: 200, currency: "BDT" };

describe("AddTransactionDrawer (P0-06)", () => {
  beforeEach(() => {
    walletsData = [W1];
  });

  it("keeps what the user typed when wallets refetch in the background", () => {
    const { rerender } = render(<AddTransactionDrawer open onOpenChange={() => {}} />);

    const amount = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    const note = screen.getByPlaceholderText("Details / merchant...") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "1234" } });
    fireEvent.change(note, { target: { value: "Rickshaw to office" } });

    // A refetch (or quick-adding a wallet) produces a NEW wallets array.
    walletsData = [W1, W2];
    rerender(<AddTransactionDrawer open onOpenChange={() => {}} />);
    walletsData = [{ ...W1, balance: 900 }, W2];
    rerender(<AddTransactionDrawer open onOpenChange={() => {}} />);

    expect((screen.getByPlaceholderText("0.00") as HTMLInputElement).value).toBe("1234");
    expect((screen.getByPlaceholderText("Details / merchant...") as HTMLInputElement).value).toBe("Rickshaw to office");
  });

  it("still resets the form when the drawer is reopened", () => {
    const { rerender } = render(<AddTransactionDrawer open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "50" } });

    rerender(<AddTransactionDrawer open={false} onOpenChange={() => {}} />);
    rerender(<AddTransactionDrawer open onOpenChange={() => {}} />);

    expect((screen.getByPlaceholderText("0.00") as HTMLInputElement).value).toBe("");
  });
});
