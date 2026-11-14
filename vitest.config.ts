import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify("0.0.0-test") },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
