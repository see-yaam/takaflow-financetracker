import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearOfflineCache, discardOwnerOutbox, setOutboxOwner, useOutboxAutoSync } from "@/lib/offlineSync";

export interface SignOutOptions {
  /** Permanently delete this user's unsynced offline changes. Only for an explicit user choice. */
  discardOfflineChanges?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: (opts?: SignOutOptions) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// localStorage keys that must survive a normal sign-out: the owner-scoped offline
// outbox and the SMS ingest bookkeeping. Everything else is session/cache data.
export function isPreservedOnSignOut(key: string): boolean {
  return key === "TAKAPERSIST_OUTBOX_V1" || key.startsWith("TAKAPERSIST_SMS_");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Single owner of every automatic outbox sync trigger. Replays this user's
  // queued changes as soon as they are signed in (any route, incl. /onboarding).
  useOutboxAutoSync(queryClient, user?.id);

  useEffect(() => {
    let mounted = true;

    // Safety timeout to ensure loading never hangs indefinitely
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 2000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === "SIGNED_OUT") {
          setOutboxOwner(null);
          setSession(null);
          setUser(null);
        } else {
          // Set the outbox owner before React state so nothing reads the queue as the wrong user.
          setOutboxOwner(session?.user?.id ?? null);
          setSession(session);
          setUser(session?.user ?? null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return;
        if (error) {
          console.warn("Auth session initialization error:", error.message);
          // If refresh token is expired or invalid, purge corrupted state
          if (error.message?.includes("Refresh Token") || error.message?.includes("invalid_grant")) {
            supabase.auth.signOut().catch(() => {});
          }
          setSession(null);
          setUser(null);
        } else {
          setOutboxOwner(session?.user?.id ?? null);
          setSession(session);
          setUser(session?.user ?? null);
        }
      })
      .catch((err) => {
        console.warn("Failed to get auth session:", err);
        if (mounted) {
          setSession(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (mounted) {
          clearTimeout(safetyTimer);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);


  const signOut = async (opts: SignOutOptions = {}) => {
    try {
      // Unsynced offline changes are kept (owner-scoped) unless the user explicitly
      // discards them; they sync the next time this user signs in on this device.
      if (opts.discardOfflineChanges && user?.id) {
        discardOwnerOutbox(user.id);
      }
      clearOfflineCache();
      setOutboxOwner(null);
      queryClient.clear();

      // 1. Immediately reset React state so ProtectedRoute redirects right away
      setUser(null);
      setSession(null);

      // 2. Purge Supabase auth tokens and cached data from localStorage (never the outbox)
      if (typeof window !== "undefined") {
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
              key &&
              (key.startsWith("sb-") ||
                key.includes("supabase") ||
                key.startsWith("TAKAPERSIST_") ||
                key.startsWith("takaflow_")) &&
              !isPreservedOnSignOut(key)
            ) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k));
        } catch (storageErr) {
          console.warn("Could not clear local session keys:", storageErr);
        }
      }

      // 3. Inform Supabase with local scope so it never blocks on network latency
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]).catch(() => {});
      }
    } catch (err) {
      console.warn("Sign out cleanup completed:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
