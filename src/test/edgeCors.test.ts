import { describe, it, expect } from "vitest";
import { corsHeadersFor, isAllowedOrigin, PRODUCTION_ORIGIN } from "../../supabase/functions/_shared/cors";

describe("Edge Function CORS allowlist", () => {
  it.each([
    PRODUCTION_ORIGIN,
    "https://localhost", // Capacitor Android WebView (androidScheme: https)
    "capacitor://localhost",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "https://takaflow-financetracker-git-fix-p0-stabilization-see-yaam.vercel.app",
  ])("allows %s", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
    expect(corsHeadersFor(origin, PRODUCTION_ORIGIN)["Access-Control-Allow-Origin"]).toBe(origin);
  });

  it.each([
    "https://evil.vercel.app",
    "https://takaflow-financetracker.vercel.app.evil.com",
    "http://localhost.evil.com",
    "https://example.com",
  ])("rejects %s (echoes the configured origin instead)", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
    expect(corsHeadersFor(origin, PRODUCTION_ORIGIN)["Access-Control-Allow-Origin"]).toBe(PRODUCTION_ORIGIN);
  });

  it("honours a custom ALLOWED_ORIGIN and falls back to production when unset", () => {
    expect(corsHeadersFor("https://app.takaflow.com.bd", "https://app.takaflow.com.bd")["Access-Control-Allow-Origin"]).toBe(
      "https://app.takaflow.com.bd",
    );
    expect(corsHeadersFor(null, undefined)["Access-Control-Allow-Origin"]).toBe(PRODUCTION_ORIGIN);
  });
});
