import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { useWallets } from "@/hooks/useWallets";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { data: wallets, isLoading: walletsLoading, isError: walletsError } = useWallets();

  if (loading) {
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
  const isMarkedOnboarded = typeof window !== "undefined" && localStorage.getItem(`takaflow_onboarded_${user.id}`) === "true";
  const hasWallets = Array.isArray(wallets) && wallets.length > 0;

  // Mark onboarded if wallets ever loaded successfully
  if (hasWallets && !isMarkedOnboarded && typeof window !== "undefined") {
    try {
      localStorage.setItem(`takaflow_onboarded_${user.id}`, "true");
    } catch {
        // best effort: ignore
      }
  }

  // Only redirect to onboarding if wallets definitively finished loading without error and returned 0 wallets
  // NEVER redirect during network lag, timeout, error, or if already marked onboarded!
  if (!isMarkedOnboarded && !walletsLoading && !walletsError && Array.isArray(wallets) && wallets.length === 0 && !isOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // If already has wallets or onboarded, skip onboarding and return to dashboard
  if ((hasWallets || isMarkedOnboarded) && isOnboarding) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
