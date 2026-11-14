import { Capacitor } from "@capacitor/core";

/**
 * Public web origin used in auth emails. The Android app runs on
 * https://localhost inside a WebView, which a phone's browser can't open,
 * so email links from the APK always point at the hosted web app.
 */
export const PUBLIC_APP_URL = (
  (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || "https://takaflow-financetracker.vercel.app"
).replace(/\/+$/, "");

export function authRedirectUrl(path: string): string {
  const base = Capacitor.isNativePlatform() || typeof window === "undefined" ? PUBLIC_APP_URL : window.location.origin;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// ---------------------------------------------------------------------------
// Password-recovery link detection.
// supabase-js consumes the `#access_token=…&type=recovery` hash asynchronously
// as soon as the client is created, so the marker is captured here at module
// load (this module is imported first in main.tsx) and kept for the tab.
// ---------------------------------------------------------------------------
const RECOVERY_KEY = "takaflow_password_recovery";

export interface RecoveryLinkState {
  recovery: boolean;
  error: string | null;
}

export function parseRecoveryHash(hash: string, search = ""): RecoveryLinkState {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  const error = h.get("error_description") || q.get("error_description") || h.get("error") || q.get("error");
  return { recovery: h.get("type") === "recovery", error: error ? error.replace(/\+/g, " ") : null };
}

export function captureRecoveryFromUrl(): void {
  if (typeof window === "undefined") return;
  const state = parseRecoveryHash(window.location.hash, window.location.search);
  if (!state.recovery && !state.error) return;
  try {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(state));
  } catch {
    // private mode: the reset page falls back to the PASSWORD_RECOVERY event
  }
}

export function readRecoveryState(): RecoveryLinkState {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    if (raw) return JSON.parse(raw) as RecoveryLinkState;
  } catch {
    // ignore
  }
  return { recovery: false, error: null };
}

export function clearRecoveryState(): void {
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // ignore
  }
}
