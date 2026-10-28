import { Outlet, useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Calendar, BarChart3, Wallet, LogOut, Target, Handshake, User, Mic } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useState } from "react";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import VoiceTransactionModal from "@/components/voice/VoiceTransactionModal";
import { useAutoSmsSync } from "@/hooks/useAutoSmsSync";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/goals", icon: Target, label: "Goals" },
  { to: "/debts", icon: Handshake, label: "Debts" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Wallet, label: "Wallet Settings" },
];

const mobileNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/goals", icon: Target, label: "Goals" },
  { to: "/debts", icon: Handshake, label: "Debts" },
  { to: "/settings", icon: Wallet, label: "Wallet Settings" },
  { to: "/profile", icon: User, label: "Profile" },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Background SMS Sync for Mobile Native Environment
  useAutoSmsSync();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-secondary/50 border-r border-border p-4">
        {/* Top Scrollable Navigation Section */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 -mr-1 space-y-6">
          <Link to="/dashboard" className="px-2 block hover:opacity-90 transition-opacity">
            <h1 className="text-xl font-bold tracking-tighter text-foreground flex items-center gap-2">
              <span className="h-6 w-6 rounded-md bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
                ৳
              </span>
              TakaFlow
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Finance Tracker Vault</p>
          </Link>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  pathname === item.to
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Bottom Pinned Section: Clickable Profile Badge + Sign Out */}
        <div className="shrink-0 pt-3 mt-2 border-t border-border/40">
          {user && (
            <Link
              to="/profile"
              className={cn(
                "flex items-center gap-3 px-2 py-2.5 rounded-xl mb-1 transition-all group border border-transparent hover:border-primary/25",
                pathname === "/profile"
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "hover:bg-muted/40 text-foreground"
              )}
              title="Open Vault Profile & Security"
            >
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="h-8 w-8 rounded-full object-cover border border-primary/40 shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                  {(user.user_metadata?.full_name?.[0] || user.email?.[0] || "U").toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                  {user.user_metadata?.full_name || user.email?.split("@")[0]}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </Link>
          )}

          <button
            onClick={() => setSignOutOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen pb-20 md:pb-0">
        <div className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-secondary/95 backdrop-blur-lg border-t border-border flex justify-around py-2 z-50">
        {mobileNavItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1.5 text-[10px] transition-colors",
              pathname === item.to ? "text-primary" : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Floating Voice Assistant Button */}
      <button
        type="button"
        onClick={() => setVoiceOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40 h-13 w-13 rounded-full bg-gradient-to-tr from-primary to-emerald-500 text-primary-foreground shadow-xl shadow-primary/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-all p-3 border-2 border-background/80 group"
        title="Voice Expense Assistant (মুখে বলুন)"
        aria-label="Voice Expense Assistant"
      >
        <Mic className="h-6 w-6 group-hover:scale-110 transition-transform" />
      </button>

      <VoiceTransactionModal
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
      />

      <SignOutConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onConfirm={signOut}
      />
    </div>
  );
}
