// Shared CORS policy for all TakaFlow Edge Functions.
//
// This module is intentionally pure (no Deno globals, no URL imports) so the
// allowlist can be unit-tested with vitest from src/test.

export const PRODUCTION_ORIGIN = "https://takaflow-financetracker.vercel.app";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

// Vercel preview deployments of THIS project only (not any *.vercel.app site).
const VERCEL_PREVIEW = /^https:\/\/takaflow-financetracker(-[a-z0-9-]+)?\.vercel\.app$/;
// Local development servers on any port.
const LOCAL_DEV = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Capacitor WebViews: Android (androidScheme "https") and iOS.
const CAPACITOR_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);

export function isAllowedOrigin(origin: string | null, allowedOrigin: string = PRODUCTION_ORIGIN): boolean {
  if (!origin) return true; // non-browser callers send no Origin header
  return (
    origin === allowedOrigin ||
    origin === PRODUCTION_ORIGIN ||
    CAPACITOR_ORIGINS.has(origin) ||
    LOCAL_DEV.test(origin) ||
    VERCEL_PREVIEW.test(origin)
  );
}

export function corsHeadersFor(
  origin: string | null,
  allowedOrigin: string | undefined | null,
): Record<string, string> {
  const configured = allowedOrigin || PRODUCTION_ORIGIN;
  const allowOrigin = origin && isAllowedOrigin(origin, configured) ? origin : configured;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
