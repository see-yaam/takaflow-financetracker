import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { supabaseMock } from "./mocks/supabase";
import { setOnline } from "./helpers";
import { matchesTxFilters } from "@/lib/txFilters";
import {
  __resetSyncStateForTests,
  getOutbox,
  handleOfflineCreateTransaction,
  handleOfflineCreateWallet,
  handleOfflineUpdateCategory,
  handleOfflineUpdateWallet,
  handleOfflineUpsertBudget,
  handleOfflineCreateRecurring,
  handleOfflineDeleteRecurring,
  processOutboxSync,
  setOutboxOwner,
} from "@/lib/offlineSync";

const UID = "user-a";
let qc: QueryClient;

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  setOnline(false);
  setOutboxOwner(UID);
  qc = new QueryClient();
});
afterEach(() => vi.restoreAllMocks());

describe("queued rows only appear in matching filtered queries", () => {
  it("matchesTxFilters honours month, range, wallet and category", () => {
    const t = { date: "2026-11-10", wallet_id: "w1", category: "Food" };
    expect(matchesTxFilters(t, { month: "2026-11" })).toBe(true);
    expect(matchesTxFilters(t, { month: "2026-10" })).toBe(false);
    expect(matchesTxFilters(t, { from: "2026-11-11" })).toBe(false);
    expect(matchesTxFilters(t, { walletId: "w2" })).toBe(false);
    expect(matchesTxFilters(t, { category: "Food" })).toBe(true);
    expect(matchesTxFilters(t, undefined)).toBe(true);
  });

  it("an offline create is added to November's query but not October's or another wallet's", () => {
    qc.setQueryData(["transactions", UID, { month: "2026-11" }], []);
    qc.setQueryData(["transactions", UID, { month: "2026-10" }], [{ id: "old" }]);
    qc.setQueryData(["transactions", UID, { walletId: "other" }], []);
    handleOfflineCreateTransaction({ wallet_id: "w1", type: "expense", amount: 5, category: "Tea", date: "2026-11-10" }, UID, qc, { skipSync: true });
    expect(qc.getQueryData<unknown[]>(["transactions", UID, { month: "2026-11" }])).toHaveLength(1);
    expect(qc.getQueryData<unknown[]>(["transactions", UID, { month: "2026-10" }])).toEqual([{ id: "old" }]);
    expect(qc.getQueryData<unknown[]>(["transactions", UID, { walletId: "other" }])).toEqual([]);
  });
});

describe("more mutations are queued offline and synced later", () => {
  it("wallet edit, category change, budget and recurring rule all sync once online", async () => {
    qc.setQueryData(["wallets", UID], [{ id: "w1", name: "Cash", balance: 10 }]);
    handleOfflineUpdateWallet("w1", { name: "Pocket" }, qc);
    handleOfflineUpdateCategory("tx-1", "Groceries", qc);
    handleOfflineUpsertBudget({ user_id: UID, month: "2026-11", monthly_budget: 20000 }, qc);
    handleOfflineUpsertBudget({ user_id: UID, month: "2026-11", monthly_budget: 25000 }, qc); // replaces the first
    handleOfflineCreateRecurring(
      { user_id: UID, wallet_id: "w1", type: "expense", amount: 15000, category: "Rent", note: null, day_of_month: 5, last_applied_month: "2026-11" },
      qc
    );
    expect(qc.getQueryData<Array<{ name: string }>>(["wallets", UID])?.[0].name).toBe("Pocket");
    expect(getOutbox().map((i) => i.type).sort()).toEqual(["CREATE_RECURRING", "UPDATE_TRANSACTION_CATEGORY", "UPDATE_WALLET", "UPSERT_BUDGET"]);

    setOnline(true);
    const res = await processOutboxSync(qc, { force: true });
    expect(res.synced).toBe(4);
    expect(getOutbox()).toHaveLength(0);
    expect(supabaseMock.callsTo("wallets", "update")[0].payload).toEqual({ name: "Pocket" });
    expect(supabaseMock.callsTo("transactions", "update")[0].payload).toEqual({ category: "Groceries" });
    expect((supabaseMock.callsTo("budget_goals", "upsert")[0].payload as { monthly_budget: number }).monthly_budget).toBe(25000);
    expect(supabaseMock.callsTo("recurring_transactions", "insert")).toHaveLength(1);
  });

  it("recategorizing or renaming a still-queued item edits it in place", () => {
    const tx = handleOfflineCreateTransaction({ wallet_id: "w1", type: "expense", amount: 5, category: "Tea" }, UID, qc, { skipSync: true });
    const w = handleOfflineCreateWallet({ name: "Nagad", balance: 0 }, UID, qc);
    handleOfflineUpdateCategory(tx.id, "Snacks", qc);
    handleOfflineUpdateWallet(w.id, { name: "Nagad Personal" }, qc);
    const items = getOutbox();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.type === "CREATE_TRANSACTION")?.payload.transaction?.category).toBe("Snacks");
    expect(items.find((i) => i.type === "CREATE_WALLET")?.payload.wallet?.name).toBe("Nagad Personal");
  });

  it("deleting a queued recurring rule cancels it locally", () => {
    const rule = handleOfflineCreateRecurring(
      { user_id: UID, wallet_id: "w1", type: "income", amount: 1, category: "Salary", note: null, day_of_month: 1, last_applied_month: null },
      qc
    );
    handleOfflineDeleteRecurring(rule.id, qc);
    expect(getOutbox()).toHaveLength(0);
  });
});
