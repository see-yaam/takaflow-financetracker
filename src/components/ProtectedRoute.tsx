import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { useWallets } from "@/hooks/useWallets";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const [walletWaitTimeout, setWalletWaitTimeout] = useState(false);

  useEffect(() => {
    if (user && walletsLoading) {
      const timer = setTimeout(() => {
        setWalletWaitTimeout(true);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [user, walletsLoading]);

  if (loading || (user && walletsLoading && !walletWaitTimeout)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground animate-pulse text-lg">Loading vault...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isOnboarding = location.pathname === "/onboarding";
  const hasWallets = wallets && wallets.length > 0;

  // No wallets → force onboarding (unless already there)
  if (!hasWallets && !isOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Has wallets → skip onboarding, go to dashboard
  if (hasWallets && isOnboarding) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
