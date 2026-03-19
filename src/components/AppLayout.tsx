import { Outlet, useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Calendar, BarChart3, Settings, LogOut, Target, Handshake } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/goals", icon: Target, label: "Goals" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-secondary/50 border-r border-border p-4">
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold tracking-tighter text-foreground">TakaFlow</h1>
          <p className="text-xs text-muted-foreground mt-1">Finance Tracker</p>
        </div>
        <nav className="flex-1 space-y-1">
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
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen pb-20 md:pb-0">
        <div className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-secondary/95 backdrop-blur-lg border-t border-border flex justify-around py-2 z-50">
        {navItems.map((item) => (
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
    </div>
  );
}
