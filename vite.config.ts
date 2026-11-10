import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// Single source of truth for the app version: android/app/build.gradle (versionName).
function readAppVersion(): string {
  try {
    const gradle = fs.readFileSync(path.resolve(__dirname, "android/app/build.gradle"), "utf8");
    return gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion()),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // P2-07: installable PWA with an offline app shell (web only; registered from main.tsx,
    // never inside the Capacitor APK). Data stays in the persisted query cache, not the SW.
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "favicon.svg", "robots.txt"],
      manifest: {
        name: "TakaFlow Finance Vault",
        short_name: "TakaFlow",
        description: "Multi-wallet personal finance tracker for Bangladesh (bKash, Nagad, banks, cash).",
        theme_color: "#0f1f17",
        background_color: "#0f1f17",
        display: "standalone",
        start_url: "/dashboard",
        scope: "/",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,ico,woff2}"],
        // heic2any is ~1.4 MB and only used for iPhone photo uploads.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor code out of the entry chunk (better caching, smaller first load).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/[/](react|react-dom|scheduler)[/]/.test(id)) return "vendor-react";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) return "vendor-charts";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) return "vendor-ui";
          if (id.includes("date-fns")) return "vendor-dates";
          if (id.includes("zod") || id.includes("react-hook-form")) return "vendor-forms";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "decimal.js-light": path.resolve(__dirname, "./node_modules/decimal.js-light/decimal.mjs"),
    },
  },
}));
