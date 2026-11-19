import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOfflineSyncStatus, processOutboxSync, readStoredSessionUserId, describeSyncWait, resetNetworkBackoff } from "@/lib/offlineSync";
import { openSyncIssues } from "@/components/SyncIssuesDialog";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** How long the green "Synced" confirmation stays up after a sync pass that sent something. */
export const SYNCED_FLASH_MS = 3000;

const SYNCED_FADE_MS = 400;
type SyncedFlash = "hidden" | "shown" | "fading";

/** "shown" for a few seconds after a sync pass actually delivered queued changes, then "fading". */
function useSyncedFlash(): SyncedFlash {
  const [phase, setPhase] = useState<SyncedFlash>("hidden");
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => timers.splice(0).forEach(clearTimeout);
    const onFinished = (e: Event) => {
      const synced = Number((e as CustomEvent<{ syncedCount?: number }>).detail?.syncedCount) || 0;
      if (synced <= 0) return;
      clearTimers();
      setPhase("shown");
      timers.push(setTimeout(() => setPhase("fading"), SYNCED_FLASH_MS - SYNCED_FADE_MS));
      timers.push(setTimeout(() => setPhase("hidden"), SYNCED_FLASH_MS));
    };
    window.addEventListener("takaflow_sync_finished", onFinished);
    return () => {
      clearTimers();
      window.removeEventListener("takaflow_sync_finished", onFinished);
    };
  }, []);
  return phase;
}

/**
 * Display-only sync status pill. It never deletes queued changes: tapping it
 * either forces a sync or opens the Sync Issues dialog for failed items.
 */
export default function OfflineSyncBadge({ compact = false }: {
  /**
   * Narrow phone header: long words become screen-reader-only so the pill
   * stays icon + count and can't push the header wider than the screen.
   */
  compact?: boolean;
} = {}) {
  const qc = useQueryClient();
  const long = compact ? "sr-only" : undefined;
  // Same text as before when not compact; compact keeps the word for screen readers only.
  const withWord = (n: number, word: string) =>
    compact ? <>{n}<span className="sr-only"> {word}</span></> : `${n} ${word}`;
  const { isOnline, pendingCount, failedCount, isSyncing } = useOfflineSyncStatus();
  const syncedFlash = useSyncedFlash();

  // Online with nothing queued: briefly confirm a finished sync, otherwise stay out of the way.
  if (isOnline && pendingCount === 0 && failedCount === 0 && !isSyncing && syncedFlash === "hidden") {
    return null;
  }
  const showingSynced = isOnline && pendingCount === 0 && failedCount === 0 && !isSyncing;

  const handleClick = async () => {
    if (failedCount > 0) {
      openSyncIssues();
      return;
    }
    if (isSyncing) {
      // Never a dead tap: say what the sync is waiting on.
      toast.info(`Syncing ${pendingCount} ${pendingCount === 1 ? "change" : "changes"}…`, {
        id: "offline_sync_toast",
        description: describeSyncWait(),
        duration: 5000,
      });
      return;
    }
    if (pendingCount === 0) return;

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
    resetNetworkBackoff(); // a manual "sync now" starts the retry schedule over
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
        "inline-flex shrink-0 items-center whitespace-nowrap py-1 rounded-full text-[11px] font-medium transition-all shadow-sm select-none",
        compact ? "gap-1 px-2" : "gap-1.5 px-2.5",
        failedCount > 0
          ? "bg-destructive/15 text-destructive border border-destructive/40 cursor-pointer hover:bg-destructive/25 active:scale-95"
          : !isOnline
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
          : isSyncing
          ? "bg-primary/15 text-primary border border-primary/30 animate-pulse cursor-pointer active:scale-95"
          : pendingCount > 0
          ? "bg-amber-500/15 text-amber-500 border border-amber-500/40 cursor-pointer hover:bg-amber-500/25 active:scale-95"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-in fade-in zoom-in-95",
        showingSynced && syncedFlash === "fading" && "opacity-0 scale-95 duration-300"
      )}
      title={
        failedCount > 0
          ? "Some offline changes couldn't sync. Tap to review."
          : !isOnline
          ? "Offline Mode: Showing local copy. New changes will sync when online."
          : isSyncing
          ? "Syncing local changes with cloud database. Tap for details."
          : pendingCount > 0
          ? "Tap to sync offline changes now"
          : "All local changes synced"
      }
    >
      {failedCount > 0 ? (
        <>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="font-semibold">{withWord(failedCount, "need attention")}</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-amber-500/20 text-amber-500 font-bold text-[10px]">
              {withWord(pendingCount, "pending")}
            </span>
          )}
        </>
      ) : !isOnline ? (
        <>
          <WifiOff className="h-3 w-3 shrink-0" />
          <span className={long}>Offline</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-amber-500/20 font-bold text-[10px]">
              {withWord(pendingCount, "pending")}
            </span>
          )}
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
          <span className={long}>Syncing...</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-primary/20 font-bold text-[10px]">{pendingCount}</span>
          )}
        </>
      ) : pendingCount > 0 ? (
        <>
          <RefreshCw className="h-3 w-3 shrink-0 text-amber-500" />
          <span className="font-semibold text-amber-500">{withWord(pendingCount, "pending")}</span>
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
