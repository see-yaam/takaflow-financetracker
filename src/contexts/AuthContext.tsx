import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearOfflineCache } from "@/lib/offlineSync";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
          setSession(null);
          setUser(null);
        } else {
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


  const signOut = async () => {
    clearOfflineCache();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
