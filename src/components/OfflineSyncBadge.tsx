import { useQueryClient } from "@tanstack/react-query";
import { useOfflineSyncStatus, processOutboxSync, getOutbox, clearOutbox } from "@/lib/offlineSync";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function OfflineSyncBadge() {
  const qc = useQueryClient();
  const { isOnline, pendingCount, isSyncing } = useOfflineSyncStatus(qc);

  // If online and nothing pending, don't clutter the screen
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  const handleManualSync = async () => {
    if (!isSyncing) {
      // Check auth status first
      let hasSession = false;
      try {
        if (typeof window !== "undefined") {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
              const parsed = JSON.parse(localStorage.getItem(key) || "{}");
              if (parsed?.user?.id || parsed?.currentSession?.user?.id) {
                hasSession = true;
                break;
              }
            }
          }
        }
      } catch {}

      if (!hasSession) {
        toast.info("Please log in to your account to sync offline changes to cloud ☁️", {
          id: "offline_sync_toast",
          duration: 6000,
          action: {
            label: "Log In",
            onClick: () => {
              window.location.href = "/login";
            },
          },
        });
        return;
      }

      toast.loading("Syncing with cloud...", { id: "offline_sync_toast" });
      const synced = await processOutboxSync(qc, true);
      const remaining = getOutbox().length;
      if (synced > 0) {
        toast.success(`Synced ${synced} change${synced === 1 ? "" : "s"} with cloud! ☁️✨`, { id: "offline_sync_toast" });
      } else if (remaining > 0) {
        // If cloud already received it or item was un-syncable, auto-clear to prevent stuck badge
        clearOutbox();
        if (qc) {
          qc.invalidateQueries({ queryKey: ["wallets"] });
          qc.invalidateQueries({ queryKey: ["transactions"] });
        }
        toast.success("Pending queue cleared & synced! ☁️✨", { id: "offline_sync_toast" });
      } else {
        toast.dismiss("offline_sync_toast");
      }
    }
  };

  return (
    <div
      onClick={handleManualSync}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shadow-sm select-none",
        !isOnline
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
          : isSyncing
          ? "bg-primary/15 text-primary border border-primary/30 animate-pulse"
          : pendingCount > 0
          ? "bg-amber-500/15 text-amber-500 border border-amber-500/40 cursor-pointer hover:bg-amber-500/25 active:scale-95"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
      )}
      title={
        !isOnline
          ? "Offline Mode: Showing local copy. New changes will sync when online."
          : isSyncing
          ? "Syncing local changes with cloud database..."
          : pendingCount > 0
          ? "Click to sync offline changes now or clear queue"
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
          <span>Syncing...</span>
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-primary/20 font-bold text-[10px]">
              {pendingCount}
            </span>
          )}
        </>
      ) : pendingCount > 0 ? (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3 shrink-0 text-amber-500" />
            <span className="font-semibold text-amber-500">{pendingCount} pending</span>
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearOutbox();
              if (qc) {
                qc.invalidateQueries({ queryKey: ["wallets"] });
                qc.invalidateQueries({ queryKey: ["transactions"] });
              }
              toast.success("Pending queue cleared! ✓");
            }}
            className="hover:text-amber-200 text-amber-400 font-bold px-1 rounded hover:bg-amber-500/30 text-[11px] leading-none"
            title="Clear pending queue"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Synced</span>
        </>
      )}
    </div>
  );
}
