import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
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
  getOutbox,
  setOutboxOwner,
} from "@/lib/offlineSync";
import { SESSION_NOT_READY_MESSAGE } from "@/lib/sessionGuardFetch";
import { useTransactions, type TransactionRow } from "@/hooks/useTransactions";

const UID = "user-a";
const WALLET = "11111111-1111-4111-8111-111111111111";
const MONTH = "2026-11";

const serverRow = (n: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  user_id: UID,
  wallet_id: WALLET,
  type: "expense",
  amount: 10 * n,
  category: `Cat ${n}`,
  note: null,
  date: `2026-11-0${n}`,
  created_at: `2026-11-0${n}T10:00:00Z`,
  is_reversed: false,
  wallets: { name: "bKash" },
});
const SERVER = [serverRow(3), serverRow(2), serverRow(1)];

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

/** Renders the hook and records every value `data` takes, so a momentary blank can't hide. */
function renderTracked() {
  const history: Array<TransactionRow[] | undefined> = [];
  const hook = renderHook(
    () => {
      const q = useTransactions({ month: MONTH });
      history.push(q.data);
      return q;
    },
    { wrapper }
  );
  return { ...hook, history };
}

const queueTx = (amount: number) =>
  handleOfflineCreateTransaction(
    { wallet_id: WALLET, type: "expense", amount, category: "Food", date: "2026-11-10" },
    UID,
    qc,
    { skipSync: true }
  );

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  setOnline(true);
  setOutboxOwner(UID);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("useTransactions during a sync pass", () => {
  it("keeps every row when a refetch hits an expired-session read (no blank list)", async () => {
    supabaseMock.reply("transactions:select", { data: SERVER });
    const { result, history } = renderTracked();
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    const firstLoaded = history.findIndex((d) => d?.length === 3);

    // What the session guard turns a "token refresh failed" read into.
    supabaseMock.reply("transactions:select", { error: { message: `TypeError: ${SESSION_NOT_READY_MESSAGE}`, code: "" }, status: 0 });
    act(() => window.dispatchEvent(new CustomEvent("takaflow_sync_started")));
    await act(() => qc.invalidateQueries({ queryKey: ["transactions"] }));

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data?.map((r) => r.id)).toEqual(SERVER.map((r) => r.id));
    for (const d of history.slice(firstLoaded)) {
      expect(d).toBeDefined();
      expect(d!.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not drop a row that syncs while a list fetch is in flight", async () => {
    supabaseMock.reply("transactions:select", { data: SERVER });
    const { result, history } = renderTracked();
    await waitFor(() => expect(result.current.data).toHaveLength(3));

    const first = queueTx(111);
    const second = queueTx(222);
    await waitFor(() => expect(result.current.data).toHaveLength(5));

    // 1. A list fetch starts (it will answer with the server's state from *before* the inserts).
    const staleList = deferred();
    supabaseMock.reply("transactions:select", () => staleList.promise);
    let refetch!: Promise<unknown>;
    act(() => {
      refetch = result.current.refetch();
    });
    await vi.waitFor(() => expect(supabaseMock.callsTo("transactions", "select")).toHaveLength(2));

    // 2. Sync delivers the first queued row, and holds the second one in flight.
    supabaseMock.reply("wallets:select", { data: [{ id: WALLET }] });
    supabaseMock.reply("transactions:insert", { error: null, status: 201 });
    const secondInsert = deferred();
    supabaseMock.reply("transactions:insert", () => secondInsert.promise);
    const pass = processOutboxSync(qc, { force: true });
    await vi.waitFor(() => expect(supabaseMock.callsTo("transactions", "insert")).toHaveLength(2));
    expect(getOutbox().map((i) => i.payload.tempId)).toEqual([second.id]); // first one left the outbox

    // 3. The stale list response lands: it has neither new row.
    await act(async () => {
      staleList.resolve({ data: SERVER });
      await refetch;
    });
    // Before the fix the first row vanished here; now it stays, shown as synced.
    await waitFor(() => expect(result.current.data!.find((r) => r.id === first.id)?._isOfflinePending).toBe(false));
    expect(result.current.data!.find((r) => r.id === second.id)?._isOfflinePending).toBe(true);
    expect(result.current.data).toHaveLength(5);

    // 4. Pass finishes; the fresh fetch has both rows from the server.
    supabaseMock.reply("transactions:select", {
      data: [{ ...serverRow(5), id: second.id }, { ...serverRow(4), id: first.id }, ...SERVER],
    });
    secondInsert.resolve({ error: null, status: 201 });
    await act(() => pass);
    await waitFor(() => expect(result.current.data).toHaveLength(5));
    expect(result.current.data!.every((r) => !r._isOfflinePending)).toBe(true);
    expect(history.every((d, i) => i === 0 || d !== undefined)).toBe(true);
  });
});
