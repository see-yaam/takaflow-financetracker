import { useQueryClient } from "@tanstack/react-query";
import { useOfflineSyncStatus, processOutboxSync, readStoredSessionUserId } from "@/lib/offlineSync";
import { openSyncIssues } from "@/components/SyncIssuesDialog";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Display-only sync status pill. It never deletes queued changes: tapping it
 * either forces a sync or opens the Sync Issues dialog for failed items.
 */
export default function OfflineSyncBadge() {
  const qc = useQueryClient();
  const { isOnline, pendingCount, failedCount, isSyncing } = useOfflineSyncStatus();

  // If online and nothing queued, don't clutter the screen
  if (isOnline && pendingCount === 0 && failedCount === 0 && !isSyncing) {
    return null;
  }

  const handleClick = async () => {
    if (failedCount > 0) {
      openSyncIssues();
      return;
    }
    if (isSyncing || pendingCount === 0) return;

    if (!readStoredSessionUserId()) {
      toast.info("Please log in to your account to sync offline changes to cloud ☁️", {
        id: "offline_sync_toast",
        duration: 6000,
        action: { label: "Log In", onClick: () => (window.location.href = "/login") },
      });
      return;
    }
    if (!isOnline) {
      toast.info("You're offline. Changes are saved on this device and will sync automatically.", {
        id: "offline_sync_toast",
      });
      return;
    }

    toast.loading("Syncing with cloud...", { id: "offline_sync_toast" });
    const result = await processOutboxSync(qc, { force: true });
    if (result.synced > 0) {
      toast.dismiss("offline_sync_toast"); // processOutboxSync already shows the success toast
    } else if (result.failed > 0) {
      toast.dismiss("offline_sync_toast");
      openSyncIssues();
    } else if (result.pending > 0) {
      toast.info(
        result.skipped === "no-session"
          ? "Your session expired. Please log in again to sync. Your changes are kept on this device."
          : "Couldn't reach the server. Your changes are kept on this device and will retry automatically.",
        { id: "offline_sync_toast", duration: 6000 }
      );
    } else {
      toast.dismiss("offline_sync_toast");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shadow-sm select-none",
        failedCount > 0
          ? "bg-destructive/15 text-destructive border border-destructive/40 cursor-pointer hover:bg-destructive/25 active:scale-95"
          : !isOnline
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
          : isSyncing
          ? "bg-primary/15 text-primary border border-primary/30 animate-pulse"
          : pendingCount > 0
          ? "bg-amber-500/15 text-amber-500 border border-amber-500/40 cursor-pointer hover:bg-amber-500/25 active:scale-95"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
      )}
      title={
        failedCount > 0
          ? "Some offline changes couldn't sync. Tap to review."
          : !isOnline
          ? "Offline Mode: Showing local copy. New changes will sync when online."
          : isSyncing
          ? "Syncing local changes with cloud database..."
          : pendingCount > 0
          ? "Tap to sync offline changes now"
          : "All local changes synced"
      }
    >
      {failedCount > 0 ? (
        <>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="font-semibold">{failedCount} need attention</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-amber-500/20 text-amber-500 font-bold text-[10px]">
              {pendingCount} pending
            </span>
          )}
        </>
      ) : !isOnline ? (
        <>
          <WifiOff className="h-3 w-3 shrink-0" />
          <span>Offline</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-amber-500/20 font-bold text-[10px]">
              {pendingCount} pending
            </span>
          )}
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
          <span>Syncing...</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-primary/20 font-bold text-[10px]">{pendingCount}</span>
          )}
        </>
      ) : pendingCount > 0 ? (
        <>
          <RefreshCw className="h-3 w-3 shrink-0 text-amber-500" />
          <span className="font-semibold text-amber-500">{pendingCount} pending</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Synced</span>
        </>
      )}
    </button>
  );
}
