import { useQueryClient } from "@tanstack/react-query";
import { useOfflineSyncStatus } from "@/lib/offlineSync";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OfflineSyncBadge() {
  const qc = useQueryClient();
  const { isOnline, pendingCount, isSyncing } = useOfflineSyncStatus(qc);

  // If online and nothing pending, don't clutter the screen
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shadow-sm",
        !isOnline
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
          : isSyncing
          ? "bg-primary/15 text-primary border border-primary/30 animate-pulse"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
      )}
      title={
        !isOnline
          ? "Offline Mode: Showing local copy. New changes will sync when online."
          : isSyncing
          ? "Syncing local changes with cloud database..."
          : "All local changes synced"
      }
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3 w-3 shrink-0" />
          <span>Offline</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-500/20 font-bold text-[10px]">
              {pendingCount} pending
            </span>
          )}
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
          <span>Syncing to Cloud...</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-primary/20 font-bold text-[10px]">
              {pendingCount}
            </span>
          )}
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Synced</span>
        </>
      )}
    </div>
  );
}
