import { vi } from "vitest";

/** Forces navigator.onLine for the rest of the test (restore with vi.restoreAllMocks()). */
export function setOnline(online: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

/** Writes a persisted Supabase session the way supabase-js does, so code that reads it offline finds a user. */
export function seedStoredSession(uid: string) {
  localStorage.setItem(
    "sb-testproject-auth-token",
    JSON.stringify({ access_token: "access", refresh_token: "refresh", user: { id: uid } })
  );
}
