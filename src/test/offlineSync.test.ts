import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { supabaseMock, deferred } from "./mocks/supabase";
import { setOnline } from "./helpers";
import {
  __resetSyncStateForTests,
  addToOutbox,
  classifySyncError,
  discardOwnerOutbox,
  getOutbox,
  getOutboxStats,
  handleOfflineCreateTransaction,
  handleOfflineCreateWallet,
  handleOfflineDeleteTransaction,
  handleOfflineReverseTransaction,
  isNetworkError,
  MAX_TRANSIENT_ATTEMPTS,
  nextBackoffMs,
  processOutboxSync,
  removeFromOutbox,
  retryOutboxItems,
  setOutboxOwner,
} from "@/lib/offlineSync";

const UID = "user-a";
const WALLET = "11111111-1111-4111-8111-111111111111";

function rawOutbox() {
  return JSON.parse(localStorage.getItem("TAKAPERSIST_OUTBOX_V1") || "[]");
}

function queueTx(qc: QueryClient, overrides: Partial<{ amount: number; type: string; wallet_id: string }> = {}) {
  return handleOfflineCreateTransaction(
    { wallet_id: WALLET, type: "expense", amount: 50, category: "Food", note: "lunch", date: "2026-11-10", ...overrides },
    UID,
    qc,
    { skipSync: true }
  );
}

const sync = (qc: QueryClient) => processOutboxSync(qc, { force: true });
const fetchFailure = () => new TypeError("Failed to fetch");

let qc: QueryClient;

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  setOnline(true);
  setOutboxOwner(UID);
  qc = new QueryClient();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("outbox storage", () => {
  it("adds and removes items by id", () => {
    const item = addToOutbox("DELETE_TRANSACTION", { id: "tx-1" });
    expect(getOutbox()).toHaveLength(1);
    expect(getOutbox()[0]).toMatchObject({ type: "DELETE_TRANSACTION", status: "pending", ownerId: UID });
    removeFromOutbox(item.id);
    expect(getOutbox()).toHaveLength(0);
  });

  it("offline create updates keyed caches optimistically", () => {
    setOnline(false);
    qc.setQueryData(["wallets", UID], [{ id: WALLET, balance: 1000 }]);
    qc.setQueryData(["transactions", UID, { month: "2026-11" }], []);
    const tx = queueTx(qc, { amount: 250 });
    expect(getOutbox()).toHaveLength(1);
    expect(qc.getQueryData<Array<{ balance: number }>>(["wallets", UID])?.[0].balance).toBe(750);
    expect(qc.getQueryData<Array<{ id: string }>>(["transactions", UID, { month: "2026-11" }])?.[0].id).toBe(tx.id);
  });
});

describe("processOutboxSync never drops data silently", () => {
  it("removes an item once the server confirms it", async () => {
    queueTx(qc);
    const res = await sync(qc);
    expect(res.synced).toBe(1);
    expect(getOutbox()).toHaveLength(0);
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1);
  });

  it("treats a unique violation on a client-generated id as already synced", async () => {
    queueTx(qc);
    supabaseMock.reply("transactions:insert", { error: { code: "23505", message: "duplicate key" }, status: 409 });
    const res = await sync(qc);
    expect(res.synced).toBe(1);
    expect(getOutbox()).toHaveLength(0);
  });

  it("keeps a network failure pending, counts the attempt once, and stops the pass", async () => {
    queueTx(qc);
    queueTx(qc);
    supabaseMock.throwNext("transactions:insert", fetchFailure());
    const res = await sync(qc);
    expect(res.synced).toBe(0);
    const items = getOutbox();
    expect(items).toHaveLength(2);
    expect(items[0].attempts).toBe(1);
    expect(items[0].status).toBe("pending");
    // pass stopped after the first failure: the second item was not attempted
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1);
  });

  it("survives many flaky passes and only then moves to failed (never deleted)", async () => {
    queueTx(qc);
    for (let i = 0; i < MAX_TRANSIENT_ATTEMPTS; i++) {
      supabaseMock.throwNext("transactions:insert", fetchFailure());
      await sync(qc);
    }
    const [item] = getOutbox();
    expect(item).toBeDefined();
    expect(item.status).toBe("failed");
    expect(item.lastError).toMatch(/Failed to fetch/);
  });

  it("marks a server rejection as failed with the reason and does not retry it automatically", async () => {
    queueTx(qc);
    supabaseMock.reply("transactions:insert", {
      error: { code: "42501", message: "new row violates row-level security policy" },
      status: 403,
    });
    const res = await sync(qc);
    expect(res.newlyFailed).toBe(1);
    const [item] = getOutbox();
    expect(item).toMatchObject({ status: "failed", lastErrorCode: "42501" });
    expect(getOutboxStats()).toEqual({ pending: 0, failed: 1, blocked: 0 });

    await sync(qc);
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1);
  });

  it("retries a failed item only after the user asks", async () => {
    queueTx(qc);
    supabaseMock.reply("transactions:insert", { error: { code: "23503", message: "fk" }, status: 409 });
    await sync(qc);
    const [item] = getOutbox();
    retryOutboxItems([item.id]);
    const res = await sync(qc);
    expect(res.synced).toBe(1);
    expect(getOutbox()).toHaveLength(0);
  });

  it("keeps the queue and refreshes the session on an expired JWT", async () => {
    queueTx(qc);
    supabaseMock.reply("transactions:insert", { error: { code: "PGRST301", message: "JWT expired" }, status: 401 });
    await sync(qc);
    expect(getOutbox()[0].status).toBe("pending");
    expect(supabaseMock.client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("leaves the queue untouched when nobody is signed in", async () => {
    queueTx(qc);
    supabaseMock.setSessionUser(null);
    const res = await sync(qc);
    expect(res.skipped).toBe("no-session");
    expect(getOutbox()).toHaveLength(1);
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(0);
  });

  it("does not lose an item queued while a sync is in flight", async () => {
    queueTx(qc);
    const held = deferred();
    supabaseMock.reply("transactions:insert", () => held.promise);
    const running = sync(qc);
    await vi.waitFor(() => expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1));

    const late = queueTx(qc, { amount: 999 }); // added mid-sync

    held.resolve({ error: null, status: 201 });
    await running;
    const items = getOutbox();
    expect(items).toHaveLength(1);
    expect(items[0].payload.tempId).toBe(late.id);
  });

  it("never runs two passes at once, even when forced", async () => {
    queueTx(qc);
    const held = deferred();
    supabaseMock.reply("transactions:insert", () => held.promise);
    const first = sync(qc);
    await vi.waitFor(() => expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1));
    const second = sync(qc);
    held.resolve({ error: null, status: 201 });
    await Promise.all([first, second]);
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1);
    expect(getOutbox()).toHaveLength(0);
  });

  it("does not move a transaction into another wallet when its own wallet failed to sync", async () => {
    setOnline(false);
    const wallet = handleOfflineCreateWallet({ name: "Nagad", balance: 0 }, UID, qc);
    queueTx(qc, { wallet_id: wallet.id });
    setOnline(true);
    supabaseMock.reply("wallets:select", { data: [{ id: WALLET }] });
    supabaseMock.reply("wallets:insert", { error: { code: "23514", message: "check violation" }, status: 400 });
    await sync(qc);

    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(0);
    const txItem = getOutbox().find((i) => i.type === "CREATE_TRANSACTION")!;
    expect(txItem.status).toBe("pending");
    expect(txItem.blockedBy).toBeTruthy();
    expect(txItem.payload.transaction?.wallet_id).toBe(wallet.id);
  });

  it("syncs a wallet before its transactions", async () => {
    setOnline(false);
    const wallet = handleOfflineCreateWallet({ name: "Rocket", balance: 0 }, UID, qc);
    queueTx(qc, { wallet_id: wallet.id });
    setOnline(true);
    const res = await sync(qc);
    expect(res.synced).toBe(2);
    const ops = supabaseMock.calls.filter((c) => c.op === "insert").map((c) => c.table);
    expect(ops).toEqual(["wallets", "transactions"]);
  });
});

describe("delete / reverse of queued and synced transactions", () => {
  it("cancels a queued create locally when deleted before it syncs", () => {
    setOnline(false);
    qc.setQueryData(["wallets", UID], [{ id: WALLET, balance: 500 }]);
    const tx = queueTx(qc, { amount: 100 });
    handleOfflineDeleteTransaction(tx.id, qc);
    expect(getOutbox()).toHaveLength(0);
    expect(qc.getQueryData<Array<{ balance: number }>>(["wallets", UID])?.[0].balance).toBe(500);
  });

  it("queues a DELETE when the create is already being sent (so it can't resurrect)", async () => {
    const tx = queueTx(qc);
    const held = deferred();
    supabaseMock.reply("transactions:insert", () => held.promise);
    const running = sync(qc);
    await vi.waitFor(() => expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1));

    handleOfflineDeleteTransaction(tx.id, qc);
    held.resolve({ error: null, status: 201 });
    await running;

    const remaining = getOutbox();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ type: "DELETE_TRANSACTION", payload: { id: tx.id } });
  });

  it("reversing a synced transaction offline restores the wallet balance under keyed queries", () => {
    setOnline(false);
    qc.setQueryData(["wallets", UID], [{ id: WALLET, balance: 100 }]);
    qc.setQueryData(
      ["transactions", UID, { month: "2026-11" }],
      [{ id: "tx-synced", wallet_id: WALLET, type: "expense", amount: 30, is_reversed: false }]
    );
    handleOfflineReverseTransaction("tx-synced", qc);
    expect(qc.getQueryData<Array<{ balance: number }>>(["wallets", UID])?.[0].balance).toBe(130);
    expect(getOutbox()[0]).toMatchObject({ type: "REVERSE_TRANSACTION", payload: { id: "tx-synced" } });
    expect(
      qc.getQueryData<Array<{ is_reversed: boolean }>>(["transactions", UID, { month: "2026-11" }])?.[0].is_reversed
    ).toBe(true);
  });

  it("reversing a queued create marks it reversed instead of queuing a separate REVERSE", () => {
    setOnline(false);
    const tx = queueTx(qc);
    handleOfflineReverseTransaction(tx.id, qc);
    const items = getOutbox();
    expect(items).toHaveLength(1);
    expect(items[0].payload.transaction?.is_reversed).toBe(true);
  });
});

describe("per-user ownership (P0-02)", () => {
  it("hides and never syncs another user's queued changes", async () => {
    queueTx(qc);
    setOutboxOwner("user-b");
    supabaseMock.setSessionUser("user-b");
    expect(getOutbox()).toHaveLength(0);
    await sync(qc);
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(0);
    expect(rawOutbox()).toHaveLength(1);

    setOutboxOwner(UID);
    supabaseMock.setSessionUser(UID);
    expect(getOutbox()).toHaveLength(1);
  });

  it("adopts legacy (pre-ownership) items by their payload user", () => {
    localStorage.setItem(
      "TAKAPERSIST_OUTBOX_V1",
      JSON.stringify([
        { id: "legacy-1", type: "CREATE_TRANSACTION", createdAt: 1, payload: { tempId: "t1", transaction: { id: "t1", user_id: "user-b" } } },
        { id: "legacy-2", type: "CREATE_TRANSACTION", createdAt: 2, payload: { tempId: "t2", transaction: { id: "t2", user_id: UID } } },
      ])
    );
    setOutboxOwner(UID);
    expect(getOutbox().map((i) => i.id)).toEqual(["legacy-2"]);
    expect(rawOutbox().find((i: { id: string }) => i.id === "legacy-1").ownerId).toBeUndefined();
  });

  it("discardOwnerOutbox removes only that user's items", () => {
    queueTx(qc);
    addToOutbox("DELETE_TRANSACTION", { id: "x" }, "user-b");
    discardOwnerOutbox(UID);
    expect(rawOutbox()).toHaveLength(1);
    expect(rawOutbox()[0].ownerId).toBe("user-b");
  });
});

describe("error classification", () => {
  it.each([
    [{ code: "23505" }, 409, "ok-exists"],
    [{ code: "42501", message: "rls" }, 403, "permanent"],
    [{ code: "23503", message: "fk" }, 409, "permanent"],
    [{ code: "PGRST301", message: "JWT expired" }, 401, "auth"],
    [{ message: "Internal" }, 503, "transient"],
    [{ message: "rate limited" }, 429, "transient"],
    [new TypeError("Failed to fetch"), undefined, "transient"],
    [new Error("Operation timed out after 20000ms"), undefined, "transient"],
  ])("%o / %s -> %s", (error, status, expected) => {
    expect(classifySyncError(error, status as number | undefined)).toBe(expected);
  });

  it("backs off exponentially up to 5 minutes", () => {
    expect(nextBackoffMs(1)).toBe(5000);
    expect(nextBackoffMs(2)).toBe(10000);
    expect(nextBackoffMs(20)).toBe(300000);
  });

  it("isNetworkError recognises transport failures", () => {
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
    expect(isNetworkError({ code: "42501", message: "Failed to fetch" })).toBe(false);
    expect(isNetworkError(new Error("Some random error"))).toBe(false);
  });
});
