import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { supabaseMock } from "./mocks/supabase";
import { setOnline, seedStoredSession } from "./helpers";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { __resetSyncStateForTests, addToOutbox, getOutbox, setOutboxOwner } from "@/lib/offlineSync";

const UID = "user-a";

function renderAuth() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useAuth(), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
  __resetSyncStateForTests();
  supabaseMock.reset();
  setOnline(false); // keep the auto-sync from draining the queue during these tests
  seedStoredSession(UID);
  setOutboxOwner(UID);
  localStorage.setItem("TAKAPERSIST_CACHE_V1", "{}");
  localStorage.setItem("takaflow_privacy_mode", "true");
  addToOutbox("DELETE_TRANSACTION", { id: "tx-1" }, UID);
  addToOutbox("DELETE_TRANSACTION", { id: "tx-2" }, "user-b");
});

afterEach(() => vi.restoreAllMocks());

describe("signOut keeps unsynced changes unless explicitly discarded (P0-02)", () => {
  it("normal sign-out keeps the queue and clears the session + cache", async () => {
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(UID));

    await act(() => result.current.signOut());

    const raw = JSON.parse(localStorage.getItem("TAKAPERSIST_OUTBOX_V1") || "[]");
    expect(raw).toHaveLength(2);
    expect(localStorage.getItem("TAKAPERSIST_CACHE_V1")).toBeNull();
    expect(localStorage.getItem("sb-testproject-auth-token")).toBeNull();
    expect(localStorage.getItem("takaflow_privacy_mode")).toBeNull();

    // The same user signing back in sees their change again.
    setOutboxOwner(UID);
    expect(getOutbox().map((i) => i.payload.id)).toEqual(["tx-1"]);
  });

  it("discard sign-out removes only the signed-in user's queued changes", async () => {
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(UID));

    await act(() => result.current.signOut({ discardOfflineChanges: true }));

    const raw = JSON.parse(localStorage.getItem("TAKAPERSIST_OUTBOX_V1") || "[]");
    expect(raw).toHaveLength(1);
    expect(raw[0].ownerId).toBe("user-b");
  });
});
