import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogOut, AlertTriangle } from "lucide-react";
import { getOutbox } from "@/lib/offlineSync";

interface SignOutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function SignOutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: SignOutConfirmDialogProps) {
  const pendingCount = getOutbox().length;

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
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-semibold block mb-0.5">Unsynced Offline Changes!</strong>
              You have {pendingCount} offline {pendingCount === 1 ? "change" : "changes"} that haven't synced to cloud yet. Please connect to internet to sync before signing out.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 w-full mt-2">
          <AlertDialogCancel className="w-full h-10 border border-border/70 text-foreground hover:bg-muted/50 text-xs font-semibold rounded-xl mt-0">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="w-full h-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold shadow-sm rounded-xl"
          >
            Sign Out
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
