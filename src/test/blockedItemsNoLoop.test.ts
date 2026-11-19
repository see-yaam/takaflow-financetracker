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
  getOutbox,
  handleOfflineCreateTransaction,
  handleOfflineCreateWallet,
  processOutboxSync,
  setOutboxOwner,
  updateOutboxItem,
} from "@/lib/offlineSync";

const UID = "user-a";
let qc: QueryClient;
let t0: number;
let passesStarted = 0;
const countPass = () => passesStarted++;
const at = (ms: number) => vi.setSystemTime(t0 + ms);

/** The state from the user's console: wallet "moneybag" backing off after 9 network failures, its transaction blocked. */
async function reportedState() {
  setOnline(false); // queue without an immediate sync, like offline use
  const wallet = handleOfflineCreateWallet({ name: "moneybag", balance: 0 }, UID, qc);
  handleOfflineCreateTransaction(
    { wallet_id: wallet.id, type: "expense", amount: 40, category: "Food", date: "2026-11-10" },
    UID,
    qc,
    { skipSync: true }
  );
  setOnline(true);
  const [w, tx] = getOutbox();
  updateOutboxItem(w.id, { networkFailures: 9, lastError: "TypeError: Failed to fetch", nextAttemptAt: t0 + 300_000 });
  updateOutboxItem(tx.id, { blockedBy: w.id });
  return { walletItem: w, txItem: tx };
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
  passesStarted = 0;
  window.addEventListener("takaflow_sync_started", countPass);
});
afterEach(() => {
  window.removeEventListener("takaflow_sync_started", countPass);
  vi.useRealTimers();
});

describe("a change blocked behind a backing-off wallet", () => {
  it("does not start a pass every tick (the stuck 'Syncing... 2' badge)", async () => {
    await reportedState();
    for (let tick = 1; tick <= 20; tick++) {
      at(tick * 10_000); // the 10s auto-sync timer, for 200s
      expect((await processOutboxSync(qc)).skipped).toBe("empty");
    }
    expect(passesStarted).toBe(0); // before the fix: 20 passes, spinner nearly always on
    expect(supabaseMock.callsTo("wallets", "insert")).toHaveLength(0);
  });

  it("sends the wallet and then its transaction once the wallet's retry is due", async () => {
    await reportedState();
    at(301_000);
    supabaseMock.reply("wallets:select", { data: [] });
    const res = await processOutboxSync(qc);
    expect(passesStarted).toBe(1);
    expect(res.synced).toBe(2);
    expect(getOutbox()).toHaveLength(0);
    const [walletCall] = supabaseMock.callsTo("wallets", "insert");
    const [txCall] = supabaseMock.callsTo("transactions", "insert");
    expect((txCall.payload as { wallet_id: string }).wallet_id).toBe((walletCall.payload as { id: string }).id);
  });

  it("a forced sync (Retry, back online, badge tap) still tries right away", async () => {
    await reportedState();
    at(20_000);
    supabaseMock.reply("wallets:select", { data: [] });
    const res = await processOutboxSync(qc, { force: true });
    expect(res.synced).toBe(2);
  });

  it("also stays quiet behind a wallet that failed for real", async () => {
    const { walletItem } = await reportedState();
    updateOutboxItem(walletItem.id, { status: "failed", nextAttemptAt: undefined, lastError: "check violation" });
    at(30_000);
    expect((await processOutboxSync(qc)).skipped).toBe("empty");
    expect(passesStarted).toBe(0);
  });
});
