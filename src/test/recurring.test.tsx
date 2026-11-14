import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dueOccurrences, recurringTxId, MAX_CATCH_UP_OCCURRENCES } from "@/lib/recurring";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));

import { supabaseMock } from "./mocks/supabase";
import { setOnline } from "./helpers";
import { useApplyRecurring } from "@/hooks/useRecurringTransactions";

// Local-time dates (the app schedules by the user's local calendar).
const d = (s: string) => new Date(`${s}T12:00:00`);
const rule = (over: Partial<{ day_of_month: number; last_applied_month: string | null; created_at: string }> = {}) => ({
  id: "rule-1",
  day_of_month: 5,
  last_applied_month: "2026-10",
  created_at: "2026-01-10T10:00:00",
  ...over,
});

describe("dueOccurrences", () => {
  it("catches up the day after the due date (app not opened on the 5th)", () => {
    expect(dueOccurrences(rule(), d("2026-11-06"))).toEqual([{ month: "2026-11", date: "2026-11-05" }]);
  });

  it("does nothing before the due day, or once this month is applied", () => {
    expect(dueOccurrences(rule(), d("2026-11-04"))).toEqual([]);
    expect(dueOccurrences(rule({ last_applied_month: "2026-11" }), d("2026-11-30"))).toEqual([]);
  });

  it("clamps day 31 to short months instead of skipping them", () => {
    const r = rule({ day_of_month: 31, last_applied_month: "2027-01" });
    expect(dueOccurrences(r, d("2027-02-28"))).toEqual([{ month: "2027-02", date: "2027-02-28" }]);
    expect(dueOccurrences(rule({ day_of_month: 31, last_applied_month: "2026-10" }), d("2026-11-30"))).toEqual([
      { month: "2026-11", date: "2026-11-30" },
    ]);
  });

  it("back-fills every missed month, dated on its own due day", () => {
    expect(dueOccurrences(rule({ last_applied_month: "2026-07" }), d("2026-11-10"))).toEqual([
      { month: "2026-08", date: "2026-08-05" },
      { month: "2026-09", date: "2026-09-05" },
      { month: "2026-10", date: "2026-10-05" },
      { month: "2026-11", date: "2026-11-05" },
    ]);
  });

  it("caps back-fill at the most recent 12 occurrences", () => {
    const out = dueOccurrences(rule({ last_applied_month: "2023-01", created_at: "2022-12-01T09:00:00" }), d("2026-11-10"));
    expect(out).toHaveLength(MAX_CATCH_UP_OCCURRENCES);
    expect(out[out.length - 1]).toEqual({ month: "2026-11", date: "2026-11-05" });
  });

  it("never back-fills before the rule existed (legacy rule, never applied)", () => {
    // Created Sep 20 together with September's transaction; first run should be Oct 5 and Nov 5.
    const r = rule({ last_applied_month: null, created_at: "2026-09-20T09:00:00" });
    expect(dueOccurrences(r, d("2026-11-10")).map((o) => o.month)).toEqual(["2026-10", "2026-11"]);
  });
});

describe("recurringTxId", () => {
  it("is deterministic per rule+month, distinct otherwise, and UUID-shaped", () => {
    const a = recurringTxId("rule-1", "2026-11");
    expect(recurringTxId("rule-1", "2026-11")).toBe(a);
    expect(recurringTxId("rule-1", "2026-12")).not.toBe(a);
    expect(recurringTxId("rule-2", "2026-11")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("useApplyRecurring", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    supabaseMock.reset();
    setOnline(true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(d("2026-11-10"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("inserts each missed occurrence with a deterministic id and advances the marker", async () => {
    supabaseMock.reply("recurring_transactions:select", {
      data: [
        {
          ...rule({ last_applied_month: "2026-09" }),
          wallet_id: "w1",
          type: "expense",
          amount: 15000,
          category: "Home Rent",
          note: null,
        },
      ],
    });
    const { result } = renderHook(() => useApplyRecurring(), { wrapper });
    const out = await result.current.mutateAsync();

    expect(out.created.map((c) => c.month)).toEqual(["2026-10", "2026-11"]);
    const inserts = supabaseMock.callsTo("transactions", "insert");
    expect(inserts.map((c) => (c.payload as { id: string }).id)).toEqual([
      recurringTxId("rule-1", "2026-10"),
      recurringTxId("rule-1", "2026-11"),
    ]);
    expect(inserts.map((c) => (c.payload as { date: string }).date)).toEqual(["2026-10-05", "2026-11-05"]);
    const updates = supabaseMock.callsTo("recurring_transactions", "update");
    expect(updates.map((u) => (u.payload as { last_applied_month: string }).last_applied_month)).toEqual([
      "2026-10",
      "2026-11",
    ]);
  });

  it("treats an occurrence another device already inserted as done (no duplicate)", async () => {
    supabaseMock.reply("recurring_transactions:select", {
      data: [{ ...rule(), wallet_id: "w1", type: "income", amount: 50000, category: "Salary", note: null }],
    });
    supabaseMock.reply("transactions:insert", { error: { code: "23505", message: "duplicate key" }, status: 409 });
    const { result } = renderHook(() => useApplyRecurring(), { wrapper });
    const out = await result.current.mutateAsync();

    expect(out.created).toEqual([]);
    await waitFor(() => expect(supabaseMock.callsTo("recurring_transactions", "update")).toHaveLength(1));
  });

  it("stops without marking anything applied when the network drops", async () => {
    supabaseMock.reply("recurring_transactions:select", {
      data: [{ ...rule({ last_applied_month: "2026-09" }), wallet_id: "w1", type: "expense", amount: 1, category: "X", note: null }],
    });
    supabaseMock.throwNext("transactions:insert", new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useApplyRecurring(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toThrow();
    expect(supabaseMock.callsTo("recurring_transactions", "update")).toHaveLength(0);
  });
});
