import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/utils";
import { mapSupabaseError } from "@/lib/supabaseErrors";

interface Props {
  wallet: { id: string; name: string; balance: number; currency?: string | null } | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * P2-05: set a wallet to its real balance with an explicit "Balance Adjustment"
 * transaction (never a silent balance overwrite, so the ledger always explains it).
 */
export default function ReconcileBalanceDialog({ wallet, onOpenChange }: Props) {
  const createTx = useCreateTransaction();
  const [actual, setActual] = useState("");
  const currency = wallet?.currency || "BDT";
  const diff = wallet && actual !== "" ? Math.round((Number(actual) - Number(wallet.balance)) * 100) / 100 : 0;

  const save = async () => {
    if (!wallet || !Number.isFinite(diff) || diff === 0) return;
    try {
      await createTx.mutateAsync({
        wallet_id: wallet.id,
        type: diff > 0 ? "income" : "expense",
        amount: Math.abs(diff),
        category: "Balance Adjustment",
        note: `Reconciled to ${formatMoney(Number(actual), currency)}`,
        date: format(new Date(), "yyyy-MM-dd"),
      });
      toast.success(`${wallet.name} reconciled (${diff > 0 ? "+" : "-"}${formatMoney(Math.abs(diff), currency)})`);
      setActual("");
      onOpenChange(false);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  return (
    <Dialog open={!!wallet} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reconcile {wallet?.name}</DialogTitle>
          <DialogDescription>
            TakaFlow shows {wallet ? formatMoney(Number(wallet.balance), currency) : ""}. Enter what the wallet really holds; the
            difference is recorded as a "Balance Adjustment" transaction.
          </DialogDescription>
        </DialogHeader>
        <Input type="number" step="0.01" aria-label="Actual balance" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Actual balance" />
        {actual !== "" && diff !== 0 && (
          <p className="text-xs text-muted-foreground">
            Adjustment: {diff > 0 ? "+" : "-"}
            {formatMoney(Math.abs(diff), currency)} ({diff > 0 ? "income" : "expense"})
          </p>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={!diff || createTx.isPending}>
            Record adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
