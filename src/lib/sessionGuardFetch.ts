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
    if (requestUrl(input).includes("/rest/v1/")) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (headers.get("Authorization") === `Bearer ${anonKey}` && hasStoredUserSession(storageKey)) {
        throw new TypeError(SESSION_NOT_READY_MESSAGE);
      }
    }
    return baseFetch(input, init);
  };
}
