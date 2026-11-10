import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogOut, AlertTriangle, RefreshCw } from "lucide-react";
import { getOutboxStats, processOutboxSync } from "@/lib/offlineSync";
import type { SignOutOptions } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SignOutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (opts?: SignOutOptions) => void | Promise<void>;
}

export default function SignOutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: SignOutConfirmDialogProps) {
  const qc = useQueryClient();
  const queuedCount = () => {
    const stats = getOutboxStats();
    return stats.pending + stats.failed;
  };
  const [pendingCount, setPendingCount] = useState(queuedCount);
  const [syncing, setSyncing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (open) {
      setPendingCount(queuedCount());
      setConfirmDiscard(false);
    }
  }, [open]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await processOutboxSync(qc, { force: true });
      const remaining = result.pending + result.failed;
      setPendingCount(remaining);
      if (remaining > 0 && result.synced === 0) {
        toast.info(
          result.failed > 0
            ? "Some changes were rejected by the server. Review them from the sync badge, or sign out and keep them on this device."
            : "Cloud server is currently unreachable. Your changes stay on this device if you sign out."
        );
      }
    } catch {
      toast.error("Sync encountered an issue. You can still sign out safely.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDiscardAndSignOut = async () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true); // require a second, explicit tap
      return;
    }
    onOpenChange(false);
    try {
      await onConfirm({ discardOfflineChanges: true });
      toast.info("Offline changes discarded");
    } catch (err) {
      console.warn("Sign out failed:", err);
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  const handleConfirmSignOut = async () => {
    onOpenChange(false);
    try {
      // Keeps this user's unsynced changes on the device; they sync at next sign-in.
      await onConfirm();
    } catch (err) {
      console.warn("Sign out failed:", err);
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[92vw] max-w-sm p-5 sm:p-6 bg-card border border-border shadow-2xl rounded-2xl gap-4">
        <AlertDialogHeader className="text-center sm:text-left flex flex-col items-center sm:items-start">
          <div className="p-2.5 rounded-xl bg-destructive/15 text-destructive w-fit mb-1">
            <LogOut className="h-5 w-5" />
          </div>
          <AlertDialogTitle className="text-base sm:text-lg font-bold text-foreground">
            Sign Out?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground mt-0.5">
            Are you sure you want to sign out of TakaFlow? You will need to log back in to access your vault.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {pendingCount > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="font-semibold block mb-0.5">Unsynced Offline Changes!</strong>
                You have {pendingCount} offline {pendingCount === 1 ? "change" : "changes"} that haven't synced to cloud yet.
                If you sign out, {pendingCount === 1 ? "it stays" : "they stay"} safely on this device and will sync the next
                time you sign in here.
              </div>
            </div>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="mt-1 w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-amber-500/30"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Syncing now..." : "Sync Changes to Cloud 🔄"}</span>
            </button>
            <button
              type="button"
              onClick={handleDiscardAndSignOut}
              className={`text-[11px] underline text-center pt-0.5 transition-colors ${
                confirmDiscard ? "text-destructive font-semibold" : "text-muted-foreground hover:text-destructive"
              }`}
            >
              {confirmDiscard
                ? `Tap again to permanently delete ${pendingCount} unsynced ${pendingCount === 1 ? "change" : "changes"} & sign out`
                : "Discard offline changes & Sign Out anyway"}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 w-full mt-2">
          <AlertDialogCancel className="w-full h-10 border border-border/70 text-foreground hover:bg-muted/50 text-xs font-semibold rounded-xl mt-0">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmSignOut}
            className="w-full h-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold shadow-sm rounded-xl"
          >
            Sign Out
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
