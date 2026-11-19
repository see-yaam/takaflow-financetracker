/**
 * Guards Supabase data reads against a silent "you have no data" answer.
 *
 * When the access token has expired and refreshing it fails on a flaky network,
 * auth-js keeps the stored session (the user still looks signed in) but
 * getSession() returns null. supabase-js then sends the request with the public
 * anon key, Row Level Security hides every row, and PostgREST answers
 * `200 []` with no error. The app took that as "no transactions/wallets" and
 * the lists vanished until the network recovered.
 *
 * This wrapper refuses to send a database request with the anon key while a
 * signed-in session is still stored, and fails it like a dropped connection
 * instead. Hooks then fall back to exactly what they do offline (keep the
 * cached rows plus queued changes), and React Query retries once the token
 * refreshes. Signed-out pages (no stored session) are unaffected.
 *
 * Which requests are held back: everything that could quietly succeed while
 * doing nothing for an anonymous caller. Reads return `200 []`; PATCH/DELETE
 * match zero rows and still succeed; RPCs filter on auth.uid() and can no-op.
 * Plain table inserts (POST, not /rpc/) are let through: RLS rejects an
 * anonymous insert with a real 401/42501, which the sync engine handles as
 * "auth" (refresh and retry), so nothing is lost and the server has the say.
 */

/** Matched by isNetworkError() ("failed to fetch"), so callers use their offline path. */
export const SESSION_NOT_READY_MESSAGE = "Failed to fetch: signed-in session is not ready (token refresh pending)";

/** True when supabase-js persisted a signed-in session under this storage key. */
export function hasStoredUserSession(storageKey: string, storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    const raw = storage?.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const s = parsed?.currentSession ?? parsed;
    return Boolean(s?.refresh_token && s?.user?.id);
  } catch {
    return false;
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

/** Could this request "succeed" without doing anything when sent anonymously? */
export function canSilentlyNoOp(url: string, method: string): boolean {
  if (!url.includes("/rest/v1/")) return false;
  const isInsert = method === "POST" && !url.includes("/rest/v1/rpc/");
  return !isInsert;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function createSessionGuardFetch(
  anonKey: string,
  storageKey: string,
  baseFetch: typeof fetch = (...args) => fetch(...args)
): typeof fetch {
  return async (input, init) => {
    if (canSilentlyNoOp(requestUrl(input), requestMethod(input, init))) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (headers.get("Authorization") === `Bearer ${anonKey}` && hasStoredUserSession(storageKey)) {
        throw new TypeError(SESSION_NOT_READY_MESSAGE);
      }
    }
    return baseFetch(input, init);
  };
}
