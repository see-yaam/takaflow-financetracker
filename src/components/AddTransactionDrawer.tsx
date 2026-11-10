import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useWallets, useCreateWallet } from "@/hooks/useWallets";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useCreateRecurring } from "@/hooks/useRecurringTransactions";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import CategoryPicker from "@/components/CategoryPicker";
import InsufficientBalanceModal, { AttemptedExpense } from "@/components/InsufficientBalanceModal";
import { cn } from "@/lib/utils";
import { CASH_OUT_RATES, computeCashOutFee, isMfsWallet, smsToDraft } from "@/lib/mfs";
import { scanReceipt } from "@/lib/receiptScan";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "income" | "expense";
  defaultDate?: string;
}

export default function AddTransactionDrawer({ open, onOpenChange, defaultType = "expense", defaultDate }: Props) {
  const { data: wallets } = useWallets();
  const createWallet = useCreateWallet();
  const createTx = useCreateTransaction();
  const createRecurring = useCreateRecurring();
  const [type, setType] = useState<"income" | "expense">(defaultType);
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(defaultDate || format(new Date(), "yyyy-MM-dd"));
  const [recurring, setRecurring] = useState(false);
  // P2-02: paste an SMS to prefill the form
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [scanning, setScanning] = useState(false);
  // P2-04: optional MFS cash-out fee, recorded as its own expense
  const [includeFee, setIncludeFee] = useState(false);
  const [feeRate, setFeeRate] = useState<string>(String(CASH_OUT_RATES[1]));
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [insufficientData, setInsufficientData] = useState<AttemptedExpense | null>(null);
  const [quickAddWalletOpen, setQuickAddWalletOpen] = useState(false);
  const [quickWalletName, setQuickWalletName] = useState("");

  // Ensure default wallet is set whenever wallets load
  useEffect(() => {
    if (wallets && wallets.length > 0) {
      if (!walletId || !wallets.some((w) => w.id === walletId)) {
        setWalletId(wallets[0].id);
      }
    }
  }, [wallets, walletId]);

  // Reset the form only when the drawer opens (or its defaults change). It must NOT
  // depend on `wallets`: background refetches and quick-adding a wallet would
  // otherwise wipe what the user is typing. The effect above picks the wallet.
  useEffect(() => {
    if (open) {
      setType(defaultType);
      setAmount("");
      setWalletId("");
      setCategory("");
      setNote("");
      setDate(defaultDate || format(new Date(), "yyyy-MM-dd"));
      setRecurring(false);
      setPasteOpen(false);
      setPasteText("");
      setPasteError("");
      setIncludeFee(false);
      setQuickAddWalletOpen(false);
      setQuickWalletName("");
    }
  }, [open, defaultType, defaultDate]);

  const selectedWallet = wallets?.find((w) => w.id === walletId);
  const feeApplies = includeFee && type === "expense" && isMfsWallet(selectedWallet?.name);
  const cashOutFee = feeApplies ? computeCashOutFee(parseFloat(amount), Number(feeRate)) : 0;

  const applyPastedSms = () => {
    const draft = smsToDraft(pasteText, wallets || []);
    if (!draft) {
      setPasteError("Couldn't read a transaction from that SMS. Check the text and try again.");
      return;
    }
    setType(draft.type);
    setAmount(String(draft.amount));
    setCategory(draft.category);
    setNote(draft.note);
    if (draft.walletId) setWalletId(draft.walletId);
    setPasteError("");
    setPasteOpen(false);
  };

  // P3-02: receipt photo -> Gemini Vision (scan-receipt Edge Function) -> prefilled form for review.
  const handleReceipt = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    try {
      const r = await scanReceipt(file);
      if (!r.total) {
        toast.error("Couldn't find a total on this receipt. Please enter it manually.");
        return;
      }
      setType("expense");
      setAmount(String(r.total));
      if (r.category) setCategory(r.category);
      setNote([r.merchant, r.vat ? `VAT ৳${r.vat}` : ""].filter(Boolean).join(" · "));
      if (r.date) setDate(r.date);
      toast.success("Receipt read. Check the details, then save.");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    } finally {
      setScanning(false);
    }
  };

  const handleQuickAddWallet = async () => {
    const name = quickWalletName.trim();
    if (!name) return;
    try {
      const newW = await createWallet.mutateAsync({ name, balance: 0 });
      if (newW?.id) {
        setWalletId(newW.id);
      }
      setQuickWalletName("");
      setQuickAddWalletOpen(false);
      toast.success(`Wallet "${name}" created!`);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const handleSubmit = async () => {
    if (!category.trim()) {
      toast.error("Please enter a category");
      return;
    }
    if (!amount || !walletId) {
      toast.error("Fill in required fields");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Edge Case Protection: Taka can NEVER be negative!
    if (type === "expense") {
      const selectedWallet = wallets?.find((w) => w.id === walletId);
      const currentBal = Number(selectedWallet?.balance || 0);

      if (selectedWallet && currentBal < parsedAmount) {
        setInsufficientData({
          walletId,
          amount: parsedAmount,
          category: category.trim(),
          note: note || undefined,
          date,
          recurring,
        });
        setInsufficientOpen(true);
        return;
      }
    }

    try {
      await createTx.mutateAsync({
        wallet_id: walletId,
        type,
        amount: parsedAmount,
        category: category.trim(),
        note: note || undefined,
        date,
      });

      if (feeApplies && cashOutFee > 0) {
        await createTx.mutateAsync({
          wallet_id: walletId,
          type: "expense",
          amount: cashOutFee,
          category: "MFS Fee",
          note: `Cash-out fee ${Number(feeRate)}% on ৳${parsedAmount.toLocaleString()}`,
          date,
        });
      }

      if (recurring) {
        // Parse the day from "yyyy-MM-dd" directly: new Date(date) is UTC and shifts days west of GMT.
        const dayOfMonth = Number(date.slice(8, 10));
        await createRecurring.mutateAsync({
          wallet_id: walletId,
          type,
          amount: parsedAmount,
          category: category.trim(),
          note: note || undefined,
          day_of_month: dayOfMonth,
          // This transaction already covers its own month; the rule starts from the next one.
          last_applied_month: date.slice(0, 7),
        });
        toast.success("Transaction committed & recurring set");
      } else {
        toast.success("Transaction committed");
      }

      onOpenChange(false);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const isSubmitting = createTx.isPending || createRecurring.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] w-[95vw] max-h-[92vh] overflow-y-auto p-5 sm:p-6 bg-card border-border shadow-2xl rounded-2xl gap-4">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{type === "income" ? "Add Income" : "Add Expense"}</span>
            <span
              className={cn(
                "text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border",
                type === "income"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-500 border-rose-500/20"
              )}
            >
              {type}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter transaction details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Type Toggle Tabs */}
          <div className="grid grid-cols-2 p-1 bg-secondary/70 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={cn(
                "py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5",
                type === "expense"
                  ? "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowDownRight className="h-3.5 w-3.5" /> Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={cn(
                "py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5",
                type === "income"
                  ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Income
            </button>
          </div>

          {/* P2-02: paste a bKash/Nagad/Bank SMS to fill the form */}
          <div className="rounded-lg border border-border/50">
            <button
              type="button"
              onClick={() => setPasteOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"
              aria-expanded={pasteOpen}
            >
              <span>📋 Paste bKash/Nagad/Bank SMS</span>
              <span>{pasteOpen ? "▲" : "▼"}</span>
            </button>
            <label className="flex items-center justify-between px-3 py-2 border-t border-border/50 text-xs font-medium text-muted-foreground cursor-pointer">
              <span>{scanning ? "⏳ Reading receipt…" : "📷 Scan a receipt"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={scanning}
                aria-label="Scan receipt"
                onChange={(e) => {
                  handleReceipt(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {pasteOpen && (
              <div className="px-3 pb-3 space-y-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={3}
                  aria-label="Pasted SMS"
                  placeholder="Paste the full SMS here…"
                  className="w-full rounded-md bg-secondary/60 border border-border p-2 text-xs"
                />
                {pasteError && <p className="text-xs text-destructive">{pasteError}</p>}
                <Button type="button" size="sm" variant="outline" onClick={applyPastedSms} disabled={!pasteText.trim()}>
                  Fill from SMS
                </Button>
              </div>
            )}
          </div>

          {/* Amount Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Amount (৳)</Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                ৳
              </span>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9 bg-secondary/60 border-border text-2xl h-12 sm:h-14 font-bold tabular-nums focus:ring-2 focus:ring-primary/20"
                step="0.01"
              />
            </div>
          </div>

          {/* 2-Column: Category & Wallet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Category</Label>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Wallet</Label>
                <button
                  type="button"
                  onClick={() => setQuickAddWalletOpen((prev) => !prev)}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  {quickAddWalletOpen ? "Cancel" : "+ New"}
                </button>
              </div>

              {quickAddWalletOpen ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="text"
                    placeholder="Wallet name (e.g. Cash, bKash)"
                    value={quickWalletName}
                    onChange={(e) => setQuickWalletName(e.target.value)}
                    className="h-10 text-xs bg-secondary/60 border-border"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleQuickAddWallet();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleQuickAddWallet}
                    disabled={!quickWalletName.trim() || createWallet.isPending}
                    className="h-10 text-xs shrink-0 px-3"
                  >
                    Add
                  </Button>
                </div>
              ) : (
                <Select
                  value={walletId || (wallets?.[0]?.id ?? "")}
                  onValueChange={(val) => {
                    if (val === "__create_new__") {
                      setQuickAddWalletOpen(true);
                      return;
                    }
                    setWalletId(val);
                  }}
                >
                  <SelectTrigger className="bg-secondary/60 border-border h-10 text-xs">
                    <SelectValue placeholder={wallets && wallets.length > 0 ? "Select wallet" : "Creating default wallet..."} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border z-[100]">
                    {wallets && wallets.length > 0 ? (
                      wallets.map((w) => (
                        <SelectItem key={w.id} value={w.id} className="text-xs">
                          {w.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none__" disabled className="text-xs text-muted-foreground">
                        No wallets found
                      </SelectItem>
                    )}
                    <SelectItem value="__create_new__" className="text-xs text-primary font-semibold border-t border-border/40 mt-1 cursor-pointer">
                      + Create New Wallet
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* 2-Column: Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-secondary/60 border-border h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              {type === "expense" && isMfsWallet(selectedWallet?.name) && (
                <div className="mb-3 rounded-lg border border-border/50 p-3 space-y-2">
                  <label className="flex items-center justify-between text-xs font-medium">
                    <span>Include cash-out fee</span>
                    <Switch checked={includeFee} onCheckedChange={setIncludeFee} aria-label="Include cash-out fee" />
                  </label>
                  {includeFee && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {CASH_OUT_RATES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setFeeRate(String(r))}
                          className={cn(
                            "px-2 py-1 rounded-full border",
                            Number(feeRate) === r ? "border-primary text-primary" : "border-border text-muted-foreground"
                          )}
                        >
                          {r}%
                        </button>
                      ))}
                      <Input
                        type="number"
                        step="0.01"
                        value={feeRate}
                        onChange={(e) => setFeeRate(e.target.value)}
                        aria-label="Custom fee rate"
                        className="h-7 w-20 text-xs"
                      />
                      <span className="text-muted-foreground">= ৳{cashOutFee.toLocaleString()} saved as "MFS Fee"</span>
                    </div>
                  )}
                </div>
              )}
              <Label className="text-xs font-medium text-muted-foreground">Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Details / merchant..."
                className="bg-secondary/60 border-border h-10 text-xs"
              />
            </div>
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 border border-border/40">
            <div>
              <p className="text-xs font-medium text-foreground">Repeat every month?</p>
              <p className="text-[11px] text-muted-foreground">Auto-adds on same day each month</p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 border-border text-foreground hover:bg-muted/50 text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={cn(
                "flex-[2] h-11 text-xs font-semibold shadow-md",
                type === "expense"
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              )}
            >
              {isSubmitting
                ? "Committing..."
                : type === "expense"
                ? "Add Expense"
                : "Add Income"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <InsufficientBalanceModal
      open={insufficientOpen}
      onOpenChange={setInsufficientOpen}
      attemptedExpense={insufficientData}
      onSuccess={() => onOpenChange(false)}
    />
  </>
  );
}
