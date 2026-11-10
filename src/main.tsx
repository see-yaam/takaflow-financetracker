// Must stay first: captures the password-recovery link before the Supabase client consumes it.
import "./lib/captureAuthRedirect";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
