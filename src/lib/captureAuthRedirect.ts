// Side-effect module: must be the FIRST import in main.tsx, so it reads the
// URL before the Supabase client (imported by App) consumes the auth hash.
import { captureRecoveryFromUrl } from "./authRedirect";

captureRecoveryFromUrl();
