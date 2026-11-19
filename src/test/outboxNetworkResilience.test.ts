import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { supabaseMock } from "./mocks/supabase";
import { setOnline, seedStoredSession } from "./helpers";
import {
  __resetSyncStateForTests,
  classifySyncError,
  getOutbox,
  getOutboxStats,
  handleOfflineCreateTransaction,
  handleOfflineCreateWallet,
  MAX_TRANSIENT_ATTEMPTS,
  networkBackoffMs,
  processOutboxSync,
  retryOutboxItems,
  reviveNetworkFailedItems,
  setOutboxOwner,
  updateOutboxItem,
} from "@/lib/offlineSync";
import { SESSION_NOT_READY_MESSAGE } from "@/lib/sessionGuardFetch";

const UID = "user-a";
const WALLET = "11111111-1111-4111-8111-111111111111";
const fetchFailure = () => new TypeError("Failed to fetch");
const sessionNotReady = () => new TypeError(SESSION_NOT_READY_MESSAGE);
const sync = (qc: QueryClient) => processOutboxSync(qc, { force: true });

let qc: QueryClient;

function queueTx(walletId = WALLET) {
  return handleOfflineCreateTransaction(
    { wallet_id: walletId, type: "expense", amount: 50, category: "Food", date: "2026-11-10" },
    UID,
    qc,
    { skipSync: true }
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  vi.restoreAllMocks();
  setOnline(true);
  setOutboxOwner(UID);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("network errors never fail an outbox item", () => {
  it("stays pending through far more than MAX_TRANSIENT_ATTEMPTS unreachable passes", async () => {
    queueTx();
    const passes = MAX_TRANSIENT_ATTEMPTS * 3;
    for (let i = 0; i < passes; i++) {
      supabaseMock.throwNext("transactions:insert", fetchFailure());
      await sync(qc);
    }
    const [item] = getOutbox();
    expect(item.status).toBe("pending");
    expect(item.attempts ?? 0).toBe(0); // not counted toward the failure limit
    expect(item.networkFailures).toBe(passes);
    expect(item.lastError).toMatch(/Failed to fetch/);
    expect(getOutboxStats().failed).toBe(0);
  });

  it("treats a postgrest-style status-0 fetch error the same way", async () => {
    queueTx();
    for (let i = 0; i < MAX_TRANSIENT_ATTEMPTS + 2; i++) {
      supabaseMock.reply("transactions:insert", { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 });
      await sync(qc);
    }
    expect(getOutbox()[0].status).toBe("pending");
  });

  it("backs off 5s, 15s, 30s, 1m, 2m, then every 5 minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(networkBackoffMs)).toEqual([5e3, 15e3, 30e3, 60e3, 120e3, 300e3, 300e3, 300e3]);
  });

  it("waits out the backoff on automatic passes instead of retrying every tick", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = Date.now();
      queueTx();
      supabaseMock.throwNext("transactions:insert", fetchFailure());
      await sync(qc);
      expect(getOutbox()[0].nextAttemptAt).toBe(t0 + 5000);

      vi.setSystemTime(t0 + 3000); // past the 2s pass throttle, inside the 5s backoff
      const early = await processOutboxSync(qc); // not forced, e.g. the 10s timer
      expect(early.skipped).toBe("empty");
      expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1);

      vi.setSystemTime(t0 + 6000); // backoff over
      const later = await processOutboxSync(qc);
      expect(later.synced).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still fails real rejections right away and still bounds repeated 5xx errors", async () => {
    queueTx();
    supabaseMock.reply("transactions:insert", { error: { code: "23514", message: "check violation" }, status: 400 });
    await sync(qc);
    expect(getOutbox()[0].status).toBe("failed");

    localStorage.clear();
    queueTx();
    for (let i = 0; i < MAX_TRANSIENT_ATTEMPTS; i++) {
      supabaseMock.reply("transactions:insert", { error: { message: "Internal Server Error" }, status: 500 });
      await sync(qc);
    }
    expect(getOutbox()[0].status).toBe("failed");
  });
});

describe("session not ready", () => {
  it("is an auth pause, not a network failure", () => {
    expect(classifySyncError(sessionNotReady())).toBe("auth");
    expect(classifySyncError({ message: `TypeError: ${SESSION_NOT_READY_MESSAGE}`, code: "" }, 0)).toBe("auth");
    expect(classifySyncError(fetchFailure())).toBe("transient");
  });

  it("refreshes the session, pauses the pass, and never counts toward failure", async () => {
    queueTx();
    queueTx();
    for (let i = 0; i < MAX_TRANSIENT_ATTEMPTS + 2; i++) {
      supabaseMock.throwNext("transactions:insert", sessionNotReady());
      await sync(qc);
    }
    const items = getOutbox();
    expect(items.every((i) => i.status === "pending" && !i.attempts && !i.networkFailures)).toBe(true);
    expect(supabaseMock.client.auth.refreshSession).toHaveBeenCalled();
    // each pass stopped at the first item, so the second was never sent
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(MAX_TRANSIENT_ATTEMPTS + 2);
  });

  it("skips the whole pass (no writes, nothing counted) when no session can be restored", async () => {
    queueTx();
    supabaseMock.setSessionUser(null); // getSession() -> null, like a failed refresh
    seedStoredSession(UID); // the stored session is still there; setSession() can't revive it
    const res = await sync(qc);
    expect(res.skipped).toBe("no-session");
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(0);
    const [item] = getOutbox();
    expect(item.status).toBe("pending");
    expect(item.attempts ?? 0).toBe(0);
  });
});

describe("items stuck as failed by older versions", () => {
  const STUCK = "Server kept failing after 10 attempts: TypeError: Failed to fetch";

  it("revives the reported case: wallet 'moneybag' failed on Failed to fetch, its transaction waiting", async () => {
    setOnline(false); // queue like the user did, without an immediate sync
    const wallet = handleOfflineCreateWallet({ name: "moneybag", balance: 0 }, UID, qc);
    queueTx(wallet.id);
    const walletItem = getOutbox().find((i) => i.type === "CREATE_WALLET")!;
    updateOutboxItem(walletItem.id, { status: "failed", attempts: 10, lastError: STUCK, failedAt: Date.now() });
    expect(getOutboxStats().failed).toBe(1);

    setOnline(true);
    supabaseMock.reply("wallets:select", { data: [] });
    const res = await processOutboxSync(qc); // a normal automatic pass, no "Retry" tap
    expect(res.synced).toBe(2);
    expect(getOutbox()).toHaveLength(0);
    expect(supabaseMock.callsTo("wallets", "insert")).toHaveLength(1);
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1);
  });

  it("leaves genuine server failures and rejections in Sync issues", () => {
    queueTx();
    queueTx();
    const [a, b] = getOutbox();
    updateOutboxItem(a.id, { status: "failed", lastError: "Server kept failing after 10 attempts: Internal Server Error" });
    updateOutboxItem(b.id, { status: "failed", lastError: "new row violates row-level security policy" });
    expect(reviveNetworkFailedItems()).toBe(0);
    expect(getOutboxStats().failed).toBe(2);
  });
});

describe("Retry all", () => {
  it("resets the item completely and syncs it right away", async () => {
    queueTx();
    const [item] = getOutbox();
    updateOutboxItem(item.id, {
      status: "failed",
      attempts: 7,
      networkFailures: 4,
      nextAttemptAt: Date.now() + 60_000,
      failedAt: Date.now(),
      lastError: "check violation",
      lastErrorCode: "23514",
      blockedBy: "x",
    });
    retryOutboxItems([item.id]);
    const reset = getOutbox()[0];
    expect(reset).toMatchObject({ status: "pending", attempts: 0 });
    for (const k of ["networkFailures", "nextAttemptAt", "failedAt", "lastError", "lastErrorCode", "blockedBy"] as const) {
      expect(reset[k]).toBeUndefined();
    }
    const res = await sync(qc); // what the dialog runs after resetting
    expect(res.synced).toBe(1);
  });
});
