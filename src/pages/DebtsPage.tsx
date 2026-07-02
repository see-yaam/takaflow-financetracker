import { useState } from "react";
import { useDebts, useAllDebtPayments, useCreateDebt, useAddDebtPayment, useAllDebtAdditions, useAddDebtAddition } from "@/hooks/useDebts";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Handshake, ChevronDown, ChevronUp, PlusCircle } from "lucide-react";
import { format } from "date-fns";

export default function DebtsPage() {
  const { user } = useAuth();
  const { data: debts, isLoading } = useDebts();
  const { data: allPayments } = useAllDebtPayments();
  const { data: allAdditions } = useAllDebtAdditions();
  const { data: wallets } = useWallets();
  const createDebt = useCreateDebt();
  const addPayment = useAddDebtPayment();
  const addAddition = useAddDebtAddition();

  const [showCreate, setShowCreate] = useState(false);
  const [debtType, setDebtType] = useState<"borrowed" | "lent">("borrowed");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [debtDate, setDebtDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [debtNote, setDebtNote] = useState("");
  const [affectsWallet, setAffectsWallet] = useState(true);

  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [payNote, setPayNote] = useState("");
  const [payWalletId, setPayWalletId] = useState("");

  const [addMoreDialog, setAddMoreDialog] = useState<any>(null);
  const [addMoreAmount, setAddMoreAmount] = useState("");
  const [addMoreDate, setAddMoreDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [addMoreNote, setAddMoreNote] = useState("");
  const [addMoreWalletId, setAddMoreWalletId] = useState("");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleCreate = async () => {
    if (!personName.trim() || !amount || !walletId) {
      toast.error("Fill in all required fields");
      return;
    }
    const amt = parseFloat(amount);
    if (debtType === "lent" && affectsWallet) {
      const w = wallets?.find((w) => w.id === walletId);
      if (w && Number(w.balance) < amt) {
        toast.error("Insufficient wallet balance");
        return;
      }
    }
    try {
      await createDebt.mutateAsync({
        type: debtType,
        person_name: personName.trim(),
        amount: amt,
        wallet_id: walletId,
        date: debtDate,
        note: debtNote || undefined,
        affects_wallet: affectsWallet,
      });
      toast.success("Debt recorded!");
      setShowCreate(false);
      setPersonName("");
      setAmount("");
      setDebtNote("");
      setAffectsWallet(true);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const handlePayment = async () => {
    if (!payDialog || !payAmount) {
      toast.error("Enter payment amount");
      return;
    }
    if (!payWalletId) {
      toast.error("Please select a wallet");
      return;
    }
    const amt = parseFloat(payAmount);
    if (amt > payDialog.remaining_amount) {
      toast.error("Amount exceeds remaining balance");
      return;
    }
    if (payDialog.type === "borrowed") {
      const w = wallets?.find((w) => w.id === payWalletId);
      if (w && Number(w.balance) < amt) {
        toast.error("Insufficient wallet balance");
        return;
      }
    }
    try {
      await addPayment.mutateAsync({
        debtId: payDialog.id,
        amount: amt,
        date: payDate,
        note: payNote || undefined,
        debtType: payDialog.type,
        walletId: payWalletId,
        personName: payDialog.person_name,
        currentRemaining: payDialog.remaining_amount,
      });
      toast.success("Payment recorded!");
      setPayDialog(null);
      setPayAmount("");
      setPayNote("");
      setPayWalletId("");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const handleAddMore = async () => {
    if (!addMoreDialog || !addMoreAmount || !addMoreWalletId) {
      toast.error("Fill in all required fields");
      return;
    }
    const amt = parseFloat(addMoreAmount);
    if (amt <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    if (addMoreDialog.type === "lent") {
      const w = wallets?.find((w) => w.id === addMoreWalletId);
      if (w && Number(w.balance) < amt) {
        toast.error("Insufficient wallet balance");
        return;
      }
    }
    try {
      await addAddition.mutateAsync({
        debtId: addMoreDialog.id,
        amount: amt,
        date: addMoreDate,
        note: addMoreNote || undefined,
        walletId: addMoreWalletId,
        debtType: addMoreDialog.type,
        personName: addMoreDialog.person_name,
      });
      toast.success("Amount added to debt!");
      setAddMoreDialog(null);
      setAddMoreAmount("");
      setAddMoreNote("");
      setAddMoreWalletId("");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const borrowed = debts?.filter((d: any) => d.type === "borrowed") || [];
  const lent = debts?.filter((d: any) => d.type === "lent") || [];

  const totalBorrowed = borrowed.reduce((s: number, d: any) => s + Number(d.amount), 0);
  const totalLent = lent.reduce((s: number, d: any) => s + Number(d.amount), 0);
  const totalBorrowedRemaining = borrowed.reduce((s: number, d: any) => s + Number(d.remaining_amount), 0);
  const totalLentRemaining = lent.reduce((s: number, d: any) => s + Number(d.remaining_amount), 0);
  const totalPaidBack = totalBorrowed - totalBorrowedRemaining;
  const totalRecovered = totalLent - totalLentRemaining;
  const netPosition = totalBorrowedRemaining - totalLentRemaining;

  const getPaymentsForDebt = (debtId: string) =>
    (allPayments || []).filter((p: any) => p.debt_id === debtId);

  const getAdditionsForDebt = (debtId: string) =>
    (allAdditions || []).filter((a: any) => a.debt_id === debtId);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">Loading debts...</div>;
  }

  const renderDebtCard = (d: any, i: number) => {
    const pct = Number(d.amount) > 0 ? Math.min(((Number(d.amount) - Number(d.remaining_amount)) / Number(d.amount)) * 100, 100) : 0;
    const payments = getPaymentsForDebt(d.id);
    const additions = getAdditionsForDebt(d.id);
    const totalAdditions = additions.reduce((s: number, a: any) => s + Number(a.amount), 0);
    const isExpanded = expanded[d.id];
    const originalAmount = Number(d.amount) - totalAdditions;

    return (
      <motion.div
        key={d.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.05 }}
        className={`vault-card p-5 ${d.settled ? "opacity-60" : ""}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-medium text-foreground">{d.person_name}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(d.date), "MMM d, yyyy")}</p>
          </div>
          {d.settled ? (
            <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">Settled</span>
          ) : (
            <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium">Ongoing</span>
          )}
        </div>

        <div className="space-y-1 mb-3 text-sm">
          {totalAdditions > 0 ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original</span>
                <span className="tabular-nums text-foreground">৳{originalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Added</span>
                <span className="tabular-nums text-accent">+৳{totalAdditions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="tabular-nums text-foreground font-medium">৳{Number(d.amount).toLocaleString()}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original</span>
              <span className="tabular-nums text-foreground">৳{Number(d.amount).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{d.type === "borrowed" ? "Paid back" : "Recovered"}</span>
            <span className="tabular-nums text-primary">৳{(Number(d.amount) - Number(d.remaining_amount)).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining</span>
            <span className="tabular-nums text-foreground font-medium">৳{Number(d.remaining_amount).toLocaleString()}</span>
          </div>
        </div>

        <div className="mb-3">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${d.settled ? "bg-primary" : "bg-accent"}`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">{pct.toFixed(0)}% {d.type === "borrowed" ? "repaid" : "recovered"}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!d.settled && (
            <>
              <Button
                onClick={() => {
                  setPayDialog(d);
                  setPayDate(new Date().toLocaleDateString("en-CA"));
                }}
                size="sm"
                className="bg-accent/15 text-accent hover:bg-accent/25 border-0"
              >
                {d.type === "borrowed" ? "Add Repayment" : "Add Recovery"}
              </Button>
              <Button
                onClick={() => {
                  setAddMoreDialog(d);
                  setAddMoreDate(new Date().toLocaleDateString("en-CA"));
                  setAddMoreWalletId(d.wallet_id || "");
                }}
                size="sm"
                className="bg-primary/15 text-primary hover:bg-primary/25 border-0"
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add More
              </Button>
            </>
          )}
          {(payments.length > 0 || additions.length > 0) && (
            <Button
              onClick={() => setExpanded((prev) => ({ ...prev, [d.id]: !prev[d.id] }))}
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 text-xs">History</span>
            </Button>
          )}
        </div>

        {isExpanded && (payments.length > 0 || additions.length > 0) && (
          <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
            {additions.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Additions</p>
                {additions.map((a: any) => {
                  const additionWalletName = wallets?.find((w) => w.id === a.wallet_id)?.name;

                  return (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-muted-foreground">{format(new Date(a.date), "MMM d, yyyy")}</span>
                        {additionWalletName && <span className="text-muted-foreground ml-2">· {additionWalletName}</span>}
                        {a.note && <span className="text-muted-foreground ml-2">· {a.note}</span>}
                      </div>
                      <span className="tabular-nums text-accent font-medium">+৳{Number(a.amount).toLocaleString()}</span>
                    </div>
                  );
                })}
              </>
            )}
            {payments.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-2">Payments</p>
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-muted-foreground">{format(new Date(p.date), "MMM d, yyyy")}</span>
                      {p.note && <span className="text-muted-foreground ml-2">· {p.note}</span>}
                    </div>
                    <span className="tabular-nums text-primary font-medium">৳{Number(p.amount).toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  const sortedDebts = (list: any[]) => {
    const ongoing = list.filter((d) => !d.settled);
    const settled = list.filter((d) => d.settled);
    return [...ongoing, ...settled];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Handshake className="h-5 w-5 text-accent" /> Debts
        </h2>
        <Button onClick={() => setShowCreate(true)} className="bg-primary/15 text-primary hover:bg-primary/25 border-0">
          <Plus className="h-4 w-4 mr-2" /> New Debt
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="vault-card p-4">
          <p className="wallet-label mb-1">Total Borrowed</p>
          <p className="text-lg font-bold tabular-nums text-foreground">৳{totalBorrowed.toLocaleString()}</p>
        </div>
        <div className="vault-card p-4">
          <p className="wallet-label mb-1">Paid Back</p>
          <p className="text-lg font-bold tabular-nums text-primary">৳{totalPaidBack.toLocaleString()}</p>
        </div>
        <div className="vault-card p-4">
          <p className="wallet-label mb-1">Total Lent</p>
          <p className="text-lg font-bold tabular-nums text-foreground">৳{totalLent.toLocaleString()}</p>
        </div>
        <div className="vault-card p-4">
          <p className="wallet-label mb-1">Recovered</p>
          <p className="text-lg font-bold tabular-nums text-primary">৳{totalRecovered.toLocaleString()}</p>
        </div>
      </div>

      <div className="vault-card p-4">
        <div className="flex items-center justify-between">
          <p className="wallet-label">Net Debt Position</p>
          <p className={`text-lg font-bold tabular-nums ${netPosition > 0 ? "text-destructive" : netPosition < 0 ? "text-primary" : "text-muted-foreground"}`}>
            {netPosition > 0 ? "You owe " : netPosition < 0 ? "Owed to you " : ""}৳{Math.abs(netPosition).toLocaleString()}
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {netPosition > 0 ? "You owe more than others owe you" : netPosition < 0 ? "Others owe you more" : "All balanced"}
        </p>
      </div>

      <Tabs defaultValue="borrowed">
        <TabsList className="bg-secondary">
          <TabsTrigger value="borrowed">Borrowed ({borrowed.length})</TabsTrigger>
          <TabsTrigger value="lent">Lent ({lent.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="borrowed" className="space-y-4 mt-4">
          {borrowed.length === 0 ? (
            <div className="vault-card p-8 text-center">
              <p className="text-muted-foreground">No borrowed debts yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {sortedDebts(borrowed).map((d: any, i: number) => renderDebtCard(d, i))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        <TabsContent value="lent" className="space-y-4 mt-4">
          {lent.length === 0 ? (
            <div className="vault-card p-8 text-center">
              <p className="text-muted-foreground">No lent debts yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {sortedDebts(lent).map((d: any, i: number) => renderDebtCard(d, i))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Record New Debt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={() => setDebtType("borrowed")}
                variant={debtType === "borrowed" ? "default" : "outline"}
                className={debtType === "borrowed" ? "bg-primary text-primary-foreground" : "border-border"}
                size="sm"
              >
                Borrowed
              </Button>
              <Button
                onClick={() => setDebtType("lent")}
                variant={debtType === "lent" ? "default" : "outline"}
                className={debtType === "lent" ? "bg-primary text-primary-foreground" : "border-border"}
                size="sm"
              >
                Lent
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Person Name</Label>
              <Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="e.g. Rahim" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {wallets?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} (৳{Number(w.balance).toLocaleString()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={debtDate} onChange={(e) => setDebtDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={debtNote} onChange={(e) => setDebtNote(e.target.value)} placeholder="Reason..." className="bg-secondary border-border" />
            </div>
            <Button onClick={handleCreate} disabled={createDebt.isPending} className="w-full bg-primary text-primary-foreground">
              {createDebt.isPending ? "Saving..." : "Save Debt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!payDialog}
        onOpenChange={(open) => {
          if (!open) {
            setPayDialog(null);
            setPayWalletId("");
          }
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {payDialog?.type === "borrowed" ? "Add Repayment" : "Add Recovery"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {payDialog?.type === "borrowed" ? "Paying back" : "Receiving from"} <strong className="text-foreground">{payDialog?.person_name}</strong>
              <br />Remaining: <strong className="text-foreground">৳{Number(payDialog?.remaining_amount || 0).toLocaleString()}</strong>
            </p>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="1000"
                max={payDialog?.remaining_amount}
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Wallet</Label>
              <Select value={payWalletId} onValueChange={setPayWalletId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {wallets?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} (৳{Number(w.balance).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Payment note..." className="bg-secondary border-border" />
            </div>
            <Button onClick={handlePayment} disabled={addPayment.isPending} className="w-full bg-accent text-accent-foreground">
              {addPayment.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!addMoreDialog}
        onOpenChange={(open) => {
          if (!open) {
            setAddMoreDialog(null);
            setAddMoreWalletId("");
          }
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Add More to Debt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Adding more {addMoreDialog?.type === "borrowed" ? "borrowed amount from" : "lent amount to"} <strong className="text-foreground">{addMoreDialog?.person_name}</strong>
              <br />Current total: <strong className="text-foreground">৳{Number(addMoreDialog?.amount || 0).toLocaleString()}</strong>
            </p>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={addMoreAmount}
                onChange={(e) => setAddMoreAmount(e.target.value)}
                placeholder="1000"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Wallet</Label>
              <Select value={addMoreWalletId} onValueChange={setAddMoreWalletId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {wallets?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} (৳{Number(w.balance).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={addMoreDate} onChange={(e) => setAddMoreDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={addMoreNote} onChange={(e) => setAddMoreNote(e.target.value)} placeholder="e.g. Second loan" className="bg-secondary border-border" />
            </div>
            <Button onClick={handleAddMore} disabled={addAddition.isPending} className="w-full bg-primary text-primary-foreground">
              {addAddition.isPending ? "Adding..." : "Add Amount"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
