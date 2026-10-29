import { useState } from "react";
import { useWallets, useCreateWallet, useUpdateWallet, useDeleteWallet } from "@/hooks/useWallets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "@/hooks/useCurrencyRates";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

export default function SettingsWalletsSection() {
  const { data: wallets } = useWallets();
  const createWallet = useCreateWallet();
  const updateWallet = useUpdateWallet();
  const deleteWallet = useDeleteWallet();

  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletBalance, setNewWalletBalance] = useState("");
  const [newWalletCurrency, setNewWalletCurrency] = useState("BDT");
  const [editingWallet, setEditingWallet] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddWallet = async () => {
    if (!newWalletName.trim()) return;
    try {
      await createWallet.mutateAsync({
        name: newWalletName.trim(),
        balance: parseFloat(newWalletBalance) || 0,
        currency: newWalletCurrency,
      });
      setNewWalletName("");
      setNewWalletBalance("");
      setNewWalletCurrency("BDT");
      toast.success("Wallet added");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const handleRename = async () => {
    if (!editingWallet || !editName.trim()) return;
    try {
      await updateWallet.mutateAsync({ id: editingWallet.id, name: editName.trim() });
      setEditingWallet(null);
      toast.success("Wallet renamed");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this wallet and all its transactions?")) return;
    setDeletingId(id);
    try {
      await deleteWallet.mutateAsync(id);
      toast.success("Wallet deleted");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4">Manage Wallets</h3>
      <div className="space-y-3">
        {wallets?.map((w, i) => (
          <motion.div
            key={w.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {w.name}
                {(w as any).currency && (w as any).currency !== "BDT" && (
                  <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {(w as any).currency}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                ৳{Number(w.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingWallet(w);
                  setEditName(w.name);
                }}
                disabled={deleteWallet.isPending}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(w.id)}
                disabled={deletingId === w.id || deleteWallet.isPending}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <Dialog open={!!editingWallet} onOpenChange={(open) => !open && setEditingWallet(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rename Wallet</DialogTitle>
          </DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary border-border" />
          <Button
            onClick={handleRename}
            disabled={updateWallet.isPending}
            className="bg-primary text-primary-foreground"
          >
            {updateWallet.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogContent>
      </Dialog>

      <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2 mt-4">
        <Input
          value={newWalletName}
          onChange={(e) => setNewWalletName(e.target.value)}
          placeholder="Wallet name (e.g. bKash)"
          className="bg-secondary border-border flex-1 min-w-0"
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={newWalletBalance}
            onChange={(e) => setNewWalletBalance(e.target.value)}
            placeholder="Balance"
            className="bg-secondary border-border flex-1 sm:w-28"
          />
          <Select value={newWalletCurrency} onValueChange={setNewWalletCurrency}>
            <SelectTrigger className="bg-secondary border-border w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleAddWallet}
            disabled={createWallet.isPending || !newWalletName.trim()}
            size="icon"
            className="bg-primary text-primary-foreground shrink-0"
            title="Add wallet"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
