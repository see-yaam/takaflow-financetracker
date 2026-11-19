import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));

import { supabaseMock } from "./mocks/supabase";
import { setOnline } from "./helpers";
import {
  __resetSyncStateForTests,
  addToOutbox,
  getOutbox,
  handleOfflineCreateWallet,
  processOutboxSync,
  readPersistedQueryData,
  resetNetworkBackoff,
  setOutboxOwner,
  updateOutboxItem,
} from "@/lib/offlineSync";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction } from "@/hooks/useTransactions";

const UID = "user-a";
const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";
const serverWallets = [
  { id: W1, user_id: UID, name: "bKash", balance: 12500, currency: "BDT", icon: "smartphone", created_at: "2026-01-01T00:00:00Z" },
  { id: W2, user_id: UID, name: "Bank", balance: 80000, currency: "BDT", icon: "bank", created_at: "2026-01-02T00:00:00Z" },
];
const dropped = () => ({ error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 });

/** What persistQueryClient writes to localStorage. */
function seedDiskCache(entries: Array<{ queryKey: unknown[]; data: unknown }>) {
  localStorage.setItem(
    "TAKAPERSIST_CACHE_V1",
    JSON.stringify({
      buster: "",
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: entries.map((e) => ({ queryKey: e.queryKey, queryHash: JSON.stringify(e.queryKey), state: { data: e.data, status: "success" } })),
      },
    })
  );
}

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const total = (rows?: Array<{ balance: number | string }>) => (rows ?? []).reduce((s, w) => s + Number(w.balance), 0);

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  vi.clearAllMocks();
  setOnline(true);
  setOutboxOwner(UID);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("useWallets when the server can't be reached (৳0.00 regression)", () => {
  it("keeps the in-memory wallets", async () => {
    qc.setQueryData(["wallets", UID], serverWallets);
    supabaseMock.reply("wallets:select", dropped());
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(total(result.current.data)).toBe(92500);
  });

  it("cold start: uses the wallets saved on disk", async () => {
    seedDiskCache([{ queryKey: ["wallets", UID], data: serverWallets }]);
    supabaseMock.reply("wallets:select", dropped());
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data?.map((w) => w.name)).toEqual(["bKash", "Bank"]);
    expect(total(result.current.data)).toBe(92500);
  });

  it("with nothing known, reports an error instead of 'no wallets' (no ৳0.00)", async () => {
    supabaseMock.reply("wallets:select", dropped());
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("does not trust an empty list saved by the old bug", async () => {
    seedDiskCache([{ queryKey: ["wallets", UID], data: [] }]);
    supabaseMock.reply("wallets:select", dropped());
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("never uses another account's cached wallets", async () => {
    seedDiskCache([{ queryKey: ["wallets", "someone-else"], data: serverWallets }]);
    supabaseMock.reply("wallets:select", dropped());
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("never auto-creates 'Main Vault' after a failed load", async () => {
    supabaseMock.reply("wallets:select", dropped());
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(supabaseMock.callsTo("wallets", "insert")).toHaveLength(0);
  });

  it("still shows queued wallets on top of the known list", async () => {
    seedDiskCache([{ queryKey: ["wallets", UID], data: serverWallets }]);
    setOnline(false);
    handleOfflineCreateWallet({ name: "moneybag", balance: 500 }, UID, qc);
    qc.clear(); // cold start: memory empty, disk + outbox remain
    setOnline(true);
    supabaseMock.reply("wallets:select", dropped());
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(result.current.data?.find((w) => w.name === "moneybag")?._isOfflinePending).toBe(true);
  });
});

describe("adding a transaction to a wallet that hasn't synced yet", () => {
  it("queues it instead of hitting the server (no foreign-key error toast)", async () => {
    setOnline(false);
    const wallet = handleOfflineCreateWallet({ name: "moneybag", balance: 0 }, UID, qc);
    setOnline(true);
    supabaseMock.throwNext("wallets:insert", new TypeError("Failed to fetch")); // the follow-up sync can't send the wallet either
    const { result } = renderHook(() => useCreateTransaction(), { wrapper });

    const row = await result.current.mutateAsync({ wallet_id: wallet.id, type: "expense", amount: 40, category: "Food" });

    expect((row as { _isOfflinePending?: boolean })._isOfflinePending).toBe(true);
    expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(0);
    expect(getOutbox().map((i) => i.type).sort()).toEqual(["CREATE_TRANSACTION", "CREATE_WALLET"]);
  });

  it("falls back to the queue on a 23503 when the wallet turns out to be queued", async () => {
    const queuedWalletId = "33333333-3333-4333-8333-333333333333";
    supabaseMock.reply("transactions:insert", async () => {
      // the wallet got queued while this request was in flight
      addToOutbox("CREATE_WALLET", {
        tempId: queuedWalletId,
        wallet: { id: queuedWalletId, name: "Cash", balance: 0, icon: "wallet", currency: "BDT", user_id: UID },
      }, UID);
      return { error: { code: "23503", message: "violates foreign key constraint" }, status: 409 };
    });
    const { result } = renderHook(() => useCreateTransaction(), { wrapper });
    const row = await result.current.mutateAsync({ wallet_id: queuedWalletId, type: "expense", amount: 10, category: "Food" });
    expect((row as { _isOfflinePending?: boolean })._isOfflinePending).toBe(true);
  });

  it("still reports a 23503 for a wallet that really is gone", async () => {
    supabaseMock.reply("transactions:insert", { error: { code: "23503", message: "violates foreign key constraint" }, status: 409 });
    const { result } = renderHook(() => useCreateTransaction(), { wrapper });
    await expect(
      result.current.mutateAsync({ wallet_id: W1, type: "expense", amount: 10, category: "Food" })
    ).rejects.toBeTruthy();
    expect(getOutbox()).toHaveLength(0);
  });
});

describe("sync helpers", () => {
  it("readPersistedQueryData matches the exact key only", () => {
    seedDiskCache([{ queryKey: ["wallets", UID], data: serverWallets }]);
    expect(readPersistedQueryData(["wallets", UID])).toHaveLength(2);
    expect(readPersistedQueryData(["wallets"])).toBeUndefined();
    localStorage.setItem("TAKAPERSIST_CACHE_V1", "{broken");
    expect(readPersistedQueryData(["wallets", UID])).toBeUndefined();
  });

  it("resetNetworkBackoff clears backoff on pending items only", () => {
    setOnline(false);
    handleOfflineCreateWallet({ name: "a", balance: 0 }, UID, qc);
    handleOfflineCreateWallet({ name: "b", balance: 0 }, UID, qc);
    const [a, b] = getOutbox();
    updateOutboxItem(a.id, { networkFailures: 9, nextAttemptAt: Date.now() + 300_000 });
    updateOutboxItem(b.id, { status: "failed", networkFailures: 2, nextAttemptAt: Date.now() + 60_000 });
    resetNetworkBackoff();
    const [a2, b2] = getOutbox();
    expect(a2.networkFailures).toBeUndefined();
    expect(a2.nextAttemptAt).toBeUndefined();
    expect(b2.networkFailures).toBe(2); // failed items are left to Sync issues
  });

  it("sends only real wallet columns", async () => {
    setOnline(false);
    handleOfflineCreateWallet({ name: "moneybag", balance: 0 }, UID, qc);
    const [item] = getOutbox();
    // an older queued item carrying a UI-only field
    updateOutboxItem(item.id, { payload: { ...item.payload, wallet: { ...item.payload.wallet!, _isOfflinePending: true } as never } });
    setOnline(true);
    supabaseMock.reply("wallets:select", { data: [] });
    await processOutboxSync(qc, { force: true });
    const [call] = supabaseMock.callsTo("wallets", "insert");
    expect(Object.keys(call.payload as object).sort()).toEqual(["balance", "currency", "icon", "id", "name", "user_id"]);
  });
});
