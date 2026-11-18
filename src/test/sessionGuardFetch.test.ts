import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// offlineSync (for isNetworkError) imports the app client; keep that one mocked.
vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});

import { createSessionGuardFetch, hasStoredUserSession, SESSION_NOT_READY_MESSAGE } from "@/lib/sessionGuardFetch";
import { isNetworkError } from "@/lib/offlineSync";
import { setOnline } from "./helpers";

const ANON = "anon-public-key";
const KEY = "sb-guardtest-auth-token";
const REST = "https://x.supabase.co/rest/v1/transactions?select=*";

const storeSession = () =>
  localStorage.setItem(KEY, JSON.stringify({ access_token: "user-jwt", refresh_token: "r", user: { id: "u1" } }));
const ok = () => vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  setOnline(true);
});

describe("hasStoredUserSession", () => {
  it("is true only for a stored signed-in session", () => {
    expect(hasStoredUserSession(KEY)).toBe(false);
    storeSession();
    expect(hasStoredUserSession(KEY)).toBe(true);
    localStorage.setItem(KEY, "{not json");
    expect(hasStoredUserSession(KEY)).toBe(false);
  });
});

describe("createSessionGuardFetch", () => {
  it("refuses a data read sent with the anon key while a signed-in session is stored", async () => {
    storeSession();
    const base = ok();
    const guarded = createSessionGuardFetch(ANON, KEY, base);
    const err = await guarded(REST, { headers: { Authorization: `Bearer ${ANON}` } }).catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe(SESSION_NOT_READY_MESSAGE);
    expect(isNetworkError(err)).toBe(true); // hooks take their offline path
    expect(base).not.toHaveBeenCalled();
  });

  it("lets signed-in requests through", async () => {
    storeSession();
    const base = ok();
    await createSessionGuardFetch(ANON, KEY, base)(REST, { headers: { Authorization: "Bearer user-jwt" } });
    expect(base).toHaveBeenCalledOnce();
  });

  it("lets anon requests through when nobody is signed in", async () => {
    const base = ok();
    await createSessionGuardFetch(ANON, KEY, base)(REST, { headers: { Authorization: `Bearer ${ANON}` } });
    expect(base).toHaveBeenCalledOnce();
  });

  it("never blocks auth calls (the token refresh itself must go out)", async () => {
    storeSession();
    const base = ok();
    await createSessionGuardFetch(ANON, KEY, base)("https://x.supabase.co/auth/v1/token?grant_type=refresh_token", {
      headers: { Authorization: `Bearer ${ANON}` },
    });
    expect(base).toHaveBeenCalledOnce();
  });
});

describe("with the real supabase-js client", () => {
  it("a read during a failed token refresh comes back as a network error, not an empty list", async () => {
    // localStorage still holds the signed-in session, but the client has no usable
    // session (what auth-js reports after a refresh fails on a flaky network),
    // so supabase-js falls back to the anon key.
    storeSession();
    const base = ok();
    const emptyAuthStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const client = createClient("https://x.supabase.co", ANON, {
      auth: {
        storage: emptyAuthStorage,
        storageKey: "other-key",
        persistSession: true,
        autoRefreshToken: false,
      },
      global: { fetch: createSessionGuardFetch(ANON, KEY, base) },
    });

    // .retry(false): postgrest-js would otherwise retry 3x with backoff (useful in the app, slow here).
    const { data, error } = await client.from("transactions").select("*").retry(false);

    expect(base).not.toHaveBeenCalled();
    expect(data).toBeNull(); // before the fix this was [] and the list emptied
    expect(isNetworkError(error)).toBe(true);
  });
});
