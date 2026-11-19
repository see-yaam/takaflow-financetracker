import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { supabaseMock } from "./mocks/supabase";
import { setOnline } from "./helpers";
import {
  __resetSyncStateForTests,
  describeSyncWait,
  getAuthWaitUntil,
  getOutbox,
  handleOfflineCreateTransaction,
  processOutboxSync,
  setOutboxOwner,
} from "@/lib/offlineSync";

const UID = "user-a";
const WALLET = "11111111-1111-4111-8111-111111111111";
const anonInsertRejected = { error: { code: "42501", message: "new row violates row-level security policy" }, status: 401 };

let qc: QueryClient;
let t0: number;
const at = (ms: number) => vi.setSystemTime(t0 + ms);
const auto = () => processOutboxSync(qc); // the 10s timer / focus
const forced = () => processOutboxSync(qc, { force: true }); // back online, Retry, badge

function queueTx() {
  return handleOfflineCreateTransaction(
    { wallet_id: WALLET, type: "expense", amount: 50, category: "Food", date: "2026-11-10" },
    UID,
    qc,
    { skipSync: true }
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  t0 = Date.now();
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  setOnline(true);
  setOutboxOwner(UID);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => vi.useRealTimers());

describe("sync waits instead of looping while the session can't refresh", () => {
  it("an auth rejection with a failed refresh pauses automatic passes (with backoff)", async () => {
    queueTx();
    supabaseMock.reply("transactions:insert", anonInsertRejected); // refreshSession() mock returns no session
    await auto();
    expect(supabaseMock.client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(getAuthWaitUntil()).toBe(t0 + 5000);

    at(3000); // past the 2s throttle: before the fix this started another pass
    expect((await auto()).skipped).toBe("auth-wait");
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1);

    at(6000); // first wait over; it fails again, so the next wait is longer
    supabaseMock.reply("transactions:insert", anonInsertRejected);
    await auto();
    expect(getAuthWaitUntil()).toBe(t0 + 6000 + 15000);
    expect(getOutbox()[0]).toMatchObject({ status: "pending" });
  });

  it("forced passes (back online, Retry, badge tap) still go straight through", async () => {
    queueTx();
    supabaseMock.reply("transactions:insert", anonInsertRejected);
    await auto();
    at(1000);
    const res = await forced();
    expect(res.skipped).toBeUndefined();
    expect(res.synced).toBe(1);
    expect(getAuthWaitUntil()).toBe(0); // a successful send clears the pause
  });

  it("does not pause when the refresh worked: the next pass retries with the new token", async () => {
    queueTx();
    supabaseMock.reply("transactions:insert", anonInsertRejected);
    vi.mocked(supabaseMock.client.auth.refreshSession).mockResolvedValueOnce({
      data: { session: { user: { id: UID } } },
      error: null,
    } as never);
    await auto();
    expect(getAuthWaitUntil()).toBe(0);
    at(3000);
    expect((await auto()).synced).toBe(1);
  });

  it("a pass skipped for no session also waits before trying again", async () => {
    queueTx();
    supabaseMock.setSessionUser(null);
    expect((await auto()).skipped).toBe("no-session");
    at(3000);
    expect((await auto()).skipped).toBe("auth-wait");
    expect(describeSyncWait()).toMatch(/refresh your sign-in/);
  });
});

describe("describeSyncWait", () => {
  it("explains a network wait", async () => {
    queueTx();
    supabaseMock.throwNext("transactions:insert", new TypeError("Failed to fetch"));
    await forced();
    expect(describeSyncWait()).toMatch(/Can't reach the server/);
  });

  it("falls back to a neutral message", () => {
    queueTx();
    expect(describeSyncWait()).toBe("Sending your offline changes to the cloud.");
  });
});
