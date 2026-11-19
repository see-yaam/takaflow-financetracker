import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { setOnline } from "./helpers";
import { __resetSyncStateForTests, setOutboxOwner, handleOfflineCreateTransaction } from "@/lib/offlineSync";
import { toast } from "sonner";
import OfflineSyncBadge, { SYNCED_FLASH_MS } from "@/components/OfflineSyncBadge";

function renderBadge(props: { compact?: boolean } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OfflineSyncBadge {...props} />
    </QueryClientProvider>
  );
}

const finishSync = (syncedCount: number) =>
  act(() => {
    window.dispatchEvent(new CustomEvent("takaflow_sync_started"));
    window.dispatchEvent(new CustomEvent("takaflow_sync_finished", { detail: { syncedCount } }));
  });

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  setOnline(true);
  setOutboxOwner("user-a");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("OfflineSyncBadge synced confirmation", () => {
  it("stays hidden when online with nothing queued", () => {
    renderBadge();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows 'Synced' for a few seconds after a sync delivers changes, then goes away", () => {
    renderBadge();
    finishSync(1);
    expect(screen.getByRole("button")).toHaveTextContent("Synced");

    act(() => vi.advanceTimersByTime(SYNCED_FLASH_MS - 500));
    expect(screen.getByRole("button")).toHaveTextContent("Synced");

    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not flash 'Synced' when a pass sent nothing", () => {
    renderBadge();
    finishSync(0);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("restarts the timer when another sync finishes", () => {
    renderBadge();
    finishSync(1);
    act(() => vi.advanceTimersByTime(SYNCED_FLASH_MS - 100));
    finishSync(2);
    act(() => vi.advanceTimersByTime(SYNCED_FLASH_MS - 100));
    expect(screen.getByRole("button")).toHaveTextContent("Synced");
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("OfflineSyncBadge compact (phone header)", () => {
  it("hides long words visually but keeps them for screen readers", () => {
    setOnline(false);
    renderBadge({ compact: true });
    expect(screen.getByRole("button")).toHaveTextContent("Offline");
    expect(screen.getByText("Offline")).toHaveClass("sr-only");
  });

  it("shows the full label when not compact", () => {
    setOnline(false);
    renderBadge();
    expect(screen.getByText("Offline")).not.toHaveClass("sr-only");
  });
});

describe("OfflineSyncBadge while syncing", () => {
  it("a tap explains what the sync is waiting on instead of doing nothing", () => {
    handleOfflineCreateTransaction(
      { wallet_id: "11111111-1111-4111-8111-111111111111", type: "expense", amount: 5, category: "Food", date: "2026-11-10" },
      "user-a",
      new QueryClient(),
      { skipSync: true }
    );
    renderBadge();
    act(() => {
      window.dispatchEvent(new CustomEvent("takaflow_sync_started"));
    });
    fireEvent.click(screen.getByRole("button"));
    expect(toast.info).toHaveBeenCalledWith(
      "Syncing 1 change…",
      expect.objectContaining({ description: expect.stringMatching(/\w/) })
    );
  });
});
