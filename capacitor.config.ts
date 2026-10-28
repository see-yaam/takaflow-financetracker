import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.takaflow.financetracker",
  appName: "TakaFlow",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    // Mobile configurations
  },
};

export default config;
