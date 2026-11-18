import { Outlet, useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Calendar, BarChart3, Wallet, LogOut, Target, Handshake, Mic, List, Moon, Search, LayoutGrid, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useState } from "react";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import VoiceTransactionModal from "@/components/voice/VoiceTransactionModal";
import { useAutoSmsSync } from "@/hooks/useAutoSmsSync";
import { useBillReminderSync } from "@/hooks/useBillReminderSync";
import OfflineSyncBadge from "@/components/OfflineSyncBadge";
import SyncIssuesDialog from "@/components/SyncIssuesDialog";
import SmsPermissionBanner from "@/components/SmsPermissionBanner";
import CommandPalette from "@/components/CommandPalette";
import AddTransactionDrawer from "@/components/AddTransactionDrawer";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/transactions", icon: List, label: "Transactions" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/goals", icon: Target, label: "Goals" },
  { to: "/debts", icon: Handshake, label: "Debts" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/zakat", icon: Moon, label: "Zakat" },
  { to: "/settings", icon: Wallet, label: "Wallet Settings" },
];

const mobileNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/goals", icon: Target, label: "Goals" },
];

/** Phone-only "More" sheet: every page that doesn't fit in the 4 bottom tabs (Profile and Sign Out stay in the header). */
const mobileMoreItems = [
  { to: "/transactions", icon: List, label: "Transactions", hint: "Search, filter & export" },
  { to: "/debts", icon: Handshake, label: "Debts", hint: "Dhar / Karz you owe or are owed" },
  { to: "/zakat", icon: Moon, label: "Zakat", hint: "Nisab & zakat calculator" },
  { to: "/settings", icon: Wallet, label: "Wallet Settings", hint: "Add, edit & reorder wallets" },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [paletteDrawer, setPaletteDrawer] = useState<null | "income" | "expense">(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = mobileMoreItems.some((item) => pathname.startsWith(item.to));

  // Background SMS Sync for Mobile Native Environment
  useAutoSmsSync();
  // Native bill reminders 48 h before recurring expenses
  useBillReminderSync();

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-3 min-[400px]:px-4 pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))] flex items-center justify-between gap-2 w-full max-w-full min-w-0">
        <Link to="/dashboard" className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span className="shrink-0 h-7 w-7 rounded-lg bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shadow-[0_0_10px_rgba(57,255,20,0.2)]">
            ৳
          </span>
          <span className="font-bold text-base tracking-tight text-foreground flex items-center gap-1.5">
            TakaFlow
            <span className="hidden min-[400px]:inline text-[9px] uppercase font-mono tracking-wider px-1 py-0.2 rounded bg-primary/15 text-primary border border-primary/20">
              Vault
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1 min-[400px]:gap-2 shrink-0">
          <OfflineSyncBadge compact />
          <button
            type="button"
            aria-label="Open command palette"
            onClick={() => window.dispatchEvent(new Event("takaflow_open_palette"))}
            className="p-1.5 min-[400px]:p-2 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
          {user && (
            <Link
              to="/profile"
              className={cn(
                "p-0.5 rounded-full border transition-all",
                pathname === "/profile"
                  ? "border-primary ring-2 ring-primary/25"
                  : "border-border/60 hover:border-primary/40"
              )}
              title="Account Profile"
              aria-label="Account Profile"
            >
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
                  {(user.user_metadata?.full_name?.[0] || user.email?.[0] || "U").toUpperCase()}
                </div>
              )}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setSignOutOpen(true)}
            className="p-1.5 min-[400px]:p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

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
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">Finance Tracker Vault</p>
              <OfflineSyncBadge />
            </div>
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
      <main className="flex-1 flex flex-col min-h-screen pb-32 md:pb-8 min-w-0 max-w-full overflow-x-clip">
        <div className="flex-1 p-3.5 sm:p-4 md:p-8 max-w-6xl w-full min-w-0 mx-auto">
          <SmsPermissionBanner />
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-secondary/95 backdrop-blur-lg border-t border-border flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] z-50 shadow-lg">
        {mobileNavItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center gap-1 px-2 min-[400px]:px-3 py-1 min-w-0 text-[11px] font-medium transition-colors",
              pathname === item.to
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-col items-center gap-1 px-2 min-[400px]:px-3 py-1 min-w-0 text-[11px] font-medium transition-colors",
            moreActive || moreOpen ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutGrid className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Phone "More" sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-2xl border-border bg-card px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-left">
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">Other TakaFlow pages</SheetDescription>
          </SheetHeader>
          <nav className="mt-3 space-y-1" aria-label="More pages">
            {mobileMoreItems.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                    active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted/50 active:bg-muted/60"
                  )}
                >
                  <span className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", active ? "bg-primary/20" : "bg-secondary")}>
                    <item.icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{item.label}</span>
                    <span className="block text-xs text-muted-foreground truncate">{item.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Floating Voice Assistant Button */}
      <button
        type="button"
        onClick={() => setVoiceOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 md:bottom-8 md:right-8 z-40 h-13 w-13 rounded-full bg-gradient-to-tr from-primary to-emerald-500 text-primary-foreground shadow-xl shadow-primary/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-all p-3 border-2 border-background/80 group"
        title="Voice Assistant"
        aria-label="Voice Assistant"
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

      {/* One app-wide instance; both sync badges open it via openSyncIssues() */}
      <SyncIssuesDialog />

      {/* Ctrl/Cmd+K command palette (and its own add-transaction drawer) */}
      <CommandPalette
        actions={{
          addIncome: () => setPaletteDrawer("income"),
          addExpense: () => setPaletteDrawer("expense"),
          openVoice: () => setVoiceOpen(true),
        }}
      />
      <AddTransactionDrawer
        open={paletteDrawer !== null}
        onOpenChange={(o) => !o && setPaletteDrawer(null)}
        defaultType={paletteDrawer ?? "expense"}
      />
    </div>
  );
}
