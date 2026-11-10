import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  OUTBOX_CHANGED_EVENT,
  OutboxItem,
  discardOutboxItems,
  getOutbox,
  processOutboxSync,
  retryOutboxItems,
} from "@/lib/offlineSync";

const OPEN_EVENT = "takaflow_open_sync_issues";

/** Opens the (single, app-wide) Sync Issues dialog. */
export function openSyncIssues(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

function describeItem(item: OutboxItem): { title: string; detail: string } {
  const tx = item.payload?.transaction;
  const wallet = item.payload?.wallet;
  switch (item.type) {
    case "CREATE_TRANSACTION":
      return {
        title: `${tx?.type === "income" ? "Income" : "Expense"} ৳${Number(tx?.amount || 0).toLocaleString()}`,
        detail: [tx?.category, tx?.date, tx?.note].filter(Boolean).join(" · "),
      };
    case "CREATE_WALLET":
      return { title: `New wallet "${wallet?.name ?? ""}"`, detail: `${wallet?.currency ?? ""} opening balance ${wallet?.balance ?? 0}` };
    case "DELETE_TRANSACTION":
      return { title: "Delete a transaction", detail: "" };
    case "REVERSE_TRANSACTION":
      return { title: "Reverse a transaction", detail: "" };
    case "DELETE_WALLET":
      return { title: "Delete a wallet", detail: "" };
    default:
      return { title: item.type, detail: "" };
  }
}

/** Queued transactions that can only sync after this wallet item does. */
function dependentsOf(item: OutboxItem, all: OutboxItem[]): OutboxItem[] {
  if (item.type !== "CREATE_WALLET" || !item.payload?.tempId) return [];
  return all.filter((i) => i.type === "CREATE_TRANSACTION" && i.payload?.transaction?.wallet_id === item.payload.tempId);
}

export default function SyncIssuesDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState<OutboxItem | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const refresh = () => setItems(getOutbox());
    const handleOpen = () => {
      refresh();
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, handleOpen);
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(OPEN_EVENT, handleOpen);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
    };
  }, []);

  const failed = items.filter((i) => i.status === "failed");
  const blocked = items.filter((i) => i.status !== "failed" && i.blockedBy);

  const retry = async (ids: string[]) => {
    setRetrying(true);
    try {
      retryOutboxItems(ids);
      await processOutboxSync(qc, { force: true });
    } finally {
      setRetrying(false);
      setItems(getOutbox());
    }
  };

  const discard = (item: OutboxItem) => {
    const ids = [item.id, ...dependentsOf(item, items).map((d) => d.id)];
    discardOutboxItems(ids);
    // Drop the optimistic rows/balances that belonged to the discarded changes.
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["wallets"] });
    setConfirmDiscard(null);
  };

  const pendingDependents = confirmDiscard ? dependentsOf(confirmDiscard, items) : [];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Sync issues
            </DialogTitle>
            <DialogDescription>
              These offline changes were rejected by the server. They are still saved on this device. Retry them, or
              discard the ones you no longer want.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {failed.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No failed changes. 🎉</p>
            )}
            {failed.map((item) => {
              const { title, detail } = describeItem(item);
              return (
                <div key={item.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{title}</p>
                      {detail && <p className="text-xs text-muted-foreground truncate">{detail}</p>}
                      <p className="text-xs text-destructive mt-1 break-words">
                        {item.lastError}
                        {item.lastErrorCode ? ` (${item.lastErrorCode})` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" disabled={retrying} onClick={() => retry([item.id])}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(item)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {blocked.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {blocked.length} more {blocked.length === 1 ? "change is" : "changes are"} waiting for a wallet above to
                sync first.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            {failed.length > 0 && (
              <Button disabled={retrying} onClick={() => retry(failed.map((i) => i.id))}>
                <RefreshCw className={retrying ? "h-4 w-4 mr-1 animate-spin" : "h-4 w-4 mr-1"} /> Retry all
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDiscard} onOpenChange={(o) => !o && setConfirmDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this change?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDiscard ? describeItem(confirmDiscard).title : ""} will be permanently removed from this device and
              will never reach your account.
              {pendingDependents.length > 0 &&
                ` ${pendingDependents.length} queued ${
                  pendingDependents.length === 1 ? "transaction belongs" : "transactions belong"
                } to this wallet and will be discarded too.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDiscard && discard(confirmDiscard)}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
