import { useState } from "react";
import { format } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction, useDeleteTransaction } from "@/hooks/useTransactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { defaultQuickWallet, loadPresets, QuickPreset, savePresets } from "@/lib/quickLog";
import { mapSupabaseError } from "@/lib/supabaseErrors";

/** P2-04: 1-tap micro-expense logging (works offline via the outbox). */
export default function QuickLogPills() {
  const { data: wallets } = useWallets();
  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();
  const [presets, setPresets] = useState<QuickPreset[]>(() => loadPresets());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuickPreset[]>([]);
  const wallet = defaultQuickWallet(wallets);

  const log = async (p: QuickPreset) => {
    if (!wallet) {
      toast.error("Add a wallet first");
      return;
    }
    try {
      const created = await createTx.mutateAsync({
        wallet_id: wallet.id,
        type: "expense",
        amount: p.amount,
        category: p.category,
        note: `${p.label} (quick log)`,
        date: format(new Date(), "yyyy-MM-dd"),
      });
      const createdId = (created as { id?: string } | null)?.id;
      toast.success(`${p.label} ৳${p.amount} logged from ${wallet.name}`, {
        action: createdId ? { label: "Undo", onClick: () => deleteTx.mutate(createdId) } : undefined,
      });
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const saveDraft = () => {
    savePresets(draft);
    setPresets(loadPresets());
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1" aria-label="Quick log">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => log(p)}
          disabled={createTx.isPending}
          className="shrink-0 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium hover:border-primary active:scale-95 transition"
        >
          {p.label} ৳{p.amount}
        </button>
      ))}
      <button
        type="button"
        aria-label="Edit quick-log presets"
        onClick={() => {
          setDraft(presets);
          setEditing(true);
        }}
        className="shrink-0 rounded-full border border-dashed border-border p-1.5 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick-log presets</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {draft.map((p, i) => (
              <div key={p.id} className="grid grid-cols-[1fr_80px_1fr_auto] gap-2">
                <Input aria-label="Label" value={p.label} onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, label: e.target.value } : d)))} />
                <Input aria-label="Amount" type="number" value={p.amount} onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, amount: Number(e.target.value) } : d)))} />
                <Input aria-label="Category" value={p.category} onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, category: e.target.value } : d)))} />
                <Button variant="ghost" size="icon" aria-label="Remove preset" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {draft.length < 8 && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setDraft([...draft, { id: `p${Date.now()}`, label: "", amount: 0, category: "Other" }])}>
                <Plus className="h-3.5 w-3.5" /> Add preset
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Logged from {wallet?.name ?? "your first wallet"}. Saved on this device.</p>
          </div>
          <DialogFooter>
            <Button onClick={saveDraft}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
