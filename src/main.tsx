// Must stay first: captures the password-recovery link before the Supabase client consumes it.
import "./lib/captureAuthRedirect";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

createRoot(document.getElementById("root")!).render(<App />);

// P2-07: offline app shell for the web/PWA only (the APK already bundles the app).
if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        toast.info("A new version of TakaFlow is available", {
          duration: Infinity,
          action: { label: "Reload", onClick: () => updateSW(true) },
        });
      },
    });
  });
}
