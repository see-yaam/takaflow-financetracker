import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getOutbox,
  addToOutbox,
  removeFromOutbox,
  clearOutbox,
  handleOfflineCreateTransaction,
  handleOfflineDeleteTransaction,
  handleOfflineReverseTransaction,
} from "@/lib/offlineSync";
import { QueryClient } from "@tanstack/react-query";

describe("Offline Sync & Outbox Engine", () => {
  beforeEach(() => {
    window.localStorage?.clear?.();
    clearOutbox();
  });

  it("adds and retrieves items from local outbox queue", () => {
    expect(getOutbox()).toHaveLength(0);

    const item = addToOutbox("CREATE_TRANSACTION", {
      wallet_id: "w1",
      amount: 500,
      type: "expense",
      category: "Food",
    });

    const outbox = getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].id).toBe(item.id);
    expect(outbox[0].payload.amount).toBe(500);

    removeFromOutbox(item.id);
    expect(getOutbox()).toHaveLength(0);
  });

  it("handles offline create transaction optimistically and queues in outbox", () => {
    const qc = new QueryClient();
    const initialWallets = [{ id: "w1", name: "bKash", balance: 1000 }];
    const initialTx: any[] = [];

    qc.setQueryData(["wallets"], initialWallets);
    qc.setQueryData(["transactions"], initialTx);

    const result = handleOfflineCreateTransaction(
      {
        wallet_id: "w1",
        type: "expense",
        amount: 200,
        category: "Food",
        note: "Burger",
      },
      "user_123",
      qc
    );

    // 1. Returns optimistic transaction
    expect(result._isOfflinePending).toBe(true);
    expect(result.amount).toBe(200);

    // 2. Added to outbox queue
    const outbox = getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe("CREATE_TRANSACTION");
    expect(outbox[0].payload.transaction.amount).toBe(200);

    // 3. Optimistically updated local transactions query
    const cachedTx = qc.getQueryData<any[]>(["transactions"]);
    expect(cachedTx).toHaveLength(1);
    expect(cachedTx![0].id).toBe(result.id);

    // 4. Optimistically updated local wallet balance
    const cachedWallets = qc.getQueryData<any[]>(["wallets"]);
    expect(cachedWallets![0].balance).toBe(800); // 1000 - 200
  });

  it("handles offline delete transaction and cancels pending outbox item", () => {
    const qc = new QueryClient();
    const initialWallets = [{ id: "w1", name: "bKash", balance: 1000 }];
    qc.setQueryData(["wallets"], initialWallets);

    // Create an offline item
    const created = handleOfflineCreateTransaction(
      {
        wallet_id: "w1",
        type: "expense",
        amount: 200,
        category: "Food",
      },
      "user_123",
      qc
    );

    expect(getOutbox()).toHaveLength(1);
    expect(qc.getQueryData<any[]>(["wallets"])![0].balance).toBe(800);

    // Now delete it before it was synced
    handleOfflineDeleteTransaction(created.id, qc);

    // Should be removed from outbox completely
    expect(getOutbox()).toHaveLength(0);

    // Wallet balance restored
    const cachedWallets = qc.getQueryData<any[]>(["wallets"]);
    expect(cachedWallets![0].balance).toBe(1000);
  });
});
