import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallets, useCreateWallet, useUpdateWallet, useDeleteWallet } from "@/hooks/useWallets";
import { useRecurringTransactions, useDeleteRecurring } from "@/hooks/useRecurringTransactions";
import { useStreaks } from "@/hooks/useStreaks";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import { CURRENCIES } from "@/hooks/useCurrencyRates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, ArrowRightLeft, Repeat, Award } from "lucide-react";
import { motion } from "framer-motion";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { data: wallets } = useWallets();
  const createWallet = useCreateWallet();
  const updateWallet = useUpdateWallet();
  const deleteWallet = useDeleteWallet();
  const currentMonth = format(new Date(), "yyyy-MM");
  const { data: recurrings } = useRecurringTransactions();
  const deleteRecurring = useDeleteRecurring();
  const { badges } = useStreaks();

  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletBalance, setNewWalletBalance] = useState("");
  const [newWalletCurrency, setNewWalletCurrency] = useState("BDT");
  const [budgetInput, setBudgetInput] = useState("");
  const [editingWallet, setEditingWallet] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState("");

  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const handleResetAccount = async () => {
    if (resetConfirm !== "RESET" || !user) return;
    setResetting(true);
    try {
      const tables = [
        "debt_additions",
        "debt_payments",
        "debts",
        "monthly_snapshots",
        "recurring_transactions",
        "budget_goals",
        "savings_goals",
        "transactions",
        "wallets",
      ] as const;

      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq("user_id", user.id);
        if (error) throw error;
      }

      await queryClient.clear();
      await signOut();

      toast.success("Account reset successfully. Starting fresh!");
      setResetOpen(false);
      setResetConfirm("");
      window.location.href = "/login";
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResetting(false);
    }
  };

  const handleAddWallet = async () => {
    if (!newWalletName.trim()) return;
    try {
      await createWallet.mutateAsync({ name: newWalletName.trim(), balance: parseFloat(newWalletBalance) || 0, currency: newWalletCurrency });
      setNewWalletName("");
      setNewWalletBalance("");
      setNewWalletCurrency("BDT");
      toast.success("Wallet added");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRename = async () => {
    if (!editingWallet || !editName.trim()) return;
    try {
      await updateWallet.mutateAsync({ id: editingWallet.id, name: editName.trim() });
      setEditingWallet(null);
      toast.success("Wallet renamed");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this wallet and all its transactions?")) return;
    try {
      await deleteWallet.mutateAsync(id);
      toast.success("Wallet deleted");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSetBudget = async () => {
    const val = parseFloat(budgetInput);
    if (!val || val <= 0) return;
    try {
      await upsertBudget.mutateAsync({ month: currentMonth, monthly_budget: val });
      setBudgetInput("");
      toast.success("Budget goal set");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleTransfer = async () => {
    const amt = parseFloat(transferAmount);
    if (!transferFrom || !transferTo || !amt || transferFrom === transferTo) {
      toast.error("Select different wallets and enter amount");
      return;
    }
    const fromWallet = wallets?.find((w) => w.id === transferFrom);
    if (fromWallet && Number(fromWallet.balance) < amt) {
      toast.error("Insufficient balance");
      return;
    }
    try {
      await supabase.from("transactions").insert([
        { user_id: user!.id, wallet_id: transferFrom, type: "expense", amount: amt, category: "Transfer", note: `Transfer to ${wallets?.find(w => w.id === transferTo)?.name}`, date: format(new Date(), "yyyy-MM-dd") },
        { user_id: user!.id, wallet_id: transferTo, type: "income", amount: amt, category: "Transfer", note: `Transfer from ${wallets?.find(w => w.id === transferFrom)?.name}`, date: format(new Date(), "yyyy-MM-dd") },
      ]);
      toast.success("Transfer completed");
      setTransferAmount("");
      window.location.reload();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Settings</h2>

      {/* Manage wallets */}
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
                    <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{(w as any).currency}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">৳{Number(w.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingWallet(w); setEditName(w.name); }} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(w.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <Dialog open={!!editingWallet} onOpenChange={(open) => !open && setEditingWallet(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Rename Wallet</DialogTitle></DialogHeader>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary border-border" />
            <Button onClick={handleRename} className="bg-primary text-primary-foreground">Save</Button>
          </DialogContent>
        </Dialog>

        <div className="flex gap-2 mt-4">
          <Input value={newWalletName} onChange={(e) => setNewWalletName(e.target.value)} placeholder="Wallet name" className="bg-secondary border-border" />
          <Input type="number" value={newWalletBalance} onChange={(e) => setNewWalletBalance(e.target.value)} placeholder="Balance" className="bg-secondary border-border w-28" />
          <Select value={newWalletCurrency} onValueChange={setNewWalletCurrency}>
            <SelectTrigger className="bg-secondary border-border w-20"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleAddWallet} size="icon" className="bg-primary text-primary-foreground shrink-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transfer */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4 flex items-center gap-2"><ArrowRightLeft className="h-3 w-3" /> Transfer Between Wallets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select value={transferFrom} onValueChange={setTransferFrom}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="From" /></SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {wallets?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={transferTo} onValueChange={setTransferTo}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="To" /></SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {wallets?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="Amount" className="bg-secondary border-border" />
        </div>
        <Button onClick={handleTransfer} className="mt-3 bg-primary text-primary-foreground">Execute Transfer</Button>
      </div>

      {/* Budget goal */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4">Monthly Budget Goal</h3>
        {budgetGoal && (
          <p className="text-sm text-muted-foreground mb-3 tabular-nums">
            Current: ৳{Number(budgetGoal.monthly_budget).toLocaleString("en-US", { minimumFractionDigits: 2 })} for {format(new Date(), "MMMM yyyy")}
          </p>
        )}
        <div className="flex gap-2">
          <Input type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="Monthly budget" className="bg-secondary border-border" />
          <Button onClick={handleSetBudget} className="bg-primary text-primary-foreground">Set</Button>
        </div>
      </div>

      {/* Recurring Transactions */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4 flex items-center gap-2"><Repeat className="h-3 w-3" /> Recurring Transactions</h3>
        {!recurrings?.length ? (
          <p className="text-sm text-muted-foreground">No recurring transactions. Toggle "Repeat monthly" when adding a transaction.</p>
        ) : (
          <div className="space-y-2">
            {recurrings.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.category}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.type === "income" ? "+" : "-"}৳{Number(r.amount).toLocaleString()} · Day {r.day_of_month} · {(r as any).wallets?.name}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <button onClick={() => deleteRecurring.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4 flex items-center gap-2"><Award className="h-3 w-3" /> Badges</h3>
        <div className="grid grid-cols-2 gap-3">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`p-3 rounded-xl border border-border/30 ${b.earned ? "bg-primary/10" : "bg-secondary/30 opacity-50"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{b.emoji}</span>
                <span className="text-sm font-medium text-foreground">{b.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{b.description}</p>
              {b.earned && <p className="text-[10px] text-primary mt-1 font-medium">Earned!</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4">Account</h3>
        <p className="text-sm text-muted-foreground mb-4">{user?.email}</p>
        <Button onClick={() => setSignOutOpen(true)} variant="outline" className="border-border text-foreground hover:bg-destructive/10 hover:text-destructive">
          Sign Out
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="vault-card p-5 border border-destructive/30">
        <h3 className="wallet-label mb-2 text-destructive flex items-center gap-2">⚠️ Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">Permanently delete all your data and start over.</p>
        <Button onClick={() => setResetOpen(true)} variant="destructive">
          Reset Account
        </Button>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reset Everything?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete all your wallets, transactions, goals, recurring transactions, and monthly snapshots. This action cannot be undone.
          </p>
          <div className="space-y-2">
            <Label className="text-foreground">Type <span className="font-bold text-destructive">RESET</span> to confirm</Label>
            <Input
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="RESET"
              className="bg-secondary border-border"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setResetOpen(false); setResetConfirm(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={resetConfirm !== "RESET" || resetting}
              onClick={handleResetAccount}
            >
              {resetting ? "Resetting..." : "Yes, Reset Everything"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SignOutConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onConfirm={signOut}
      />
    </div>
  );
}
