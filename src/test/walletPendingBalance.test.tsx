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

import { supabaseMock, deferred } from "./mocks/supabase";
import { setOnline } from "./helpers";
import {
  __resetSyncStateForTests,
  handleOfflineCreateTransaction,
  processOutboxSync,
  queuedWalletDeltas,
  setOutboxOwner,
} from "@/lib/offlineSync";
import { useWallets } from "@/hooks/useWallets";

const UID = "user-a";
const WALLET = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

let qc: QueryClient;

function queueTx(over: Partial<{ amount: number; type: string; wallet_id: string }> = {}) {
  return handleOfflineCreateTransaction(
    { wallet_id: WALLET, type: "expense", amount: 50, category: "Food", date: "2026-11-10", ...over },
    UID,
    qc,
    { skipSync: true }
  );
}

const serverWallet = (balance: number) => ({ id: WALLET, name: "bKash", balance, currency: "BDT", user_id: UID });

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  setOnline(true);
  setOutboxOwner(UID);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("queuedWalletDeltas", () => {
  it("nets queued income and expenses per wallet", () => {
    queueTx({ amount: 50 });
    queueTx({ amount: 200, type: "income" });
    queueTx({ amount: 30, wallet_id: OTHER });
    const d = queuedWalletDeltas();
    expect(d.get(WALLET)).toBe(150);
    expect(d.get(OTHER)).toBe(-30);
  });

  it("is empty when nothing is queued", () => {
    expect(queuedWalletDeltas().size).toBe(0);
  });

  it("skips the item currently being sent (the server may already count it)", async () => {
    queueTx({ amount: 50 });
    const held = deferred();
    supabaseMock.reply("transactions:insert", () => held.promise);
    const running = processOutboxSync(qc, { force: true });
    await vi.waitFor(() => expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(1));

    expect(queuedWalletDeltas().size).toBe(0);

    held.resolve({ error: null, status: 201 });
    await running;
    expect(queuedWalletDeltas().size).toBe(0);
  });
});

describe("useWallets keeps queued transactions in the balance", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

  it("a server refetch before the sync lands does not roll the balance back", async () => {
    queueTx({ amount: 50 }); // made offline; the server still says 1000
    supabaseMock.reply("wallets:select", { data: [serverWallet(1000)] });

    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Number(result.current.data?.[0].balance)).toBe(950);
  });

  it("after the sync lands, the server balance is used as-is (no double count)", async () => {
    queueTx({ amount: 50 });
    supabaseMock.reply("transactions:insert", { error: null, status: 201 });
    await processOutboxSync(qc, { force: true });

    supabaseMock.reply("wallets:select", { data: [serverWallet(950)] });
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Number(result.current.data?.[0].balance)).toBe(950);
  });
});
