import { useState, useMemo, useEffect } from "react";
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
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useCreateDebt } from "@/hooks/useDebts";
import { useCreateRecurring } from "@/hooks/useRecurringTransactions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { formatMoney } from "@/lib/utils";
import { AlertCircle, ArrowRightLeft, HandCoins, ArrowRight, X } from "lucide-react";

export interface AttemptedExpense {
  walletId: string;
  amount: number;
  category: string;
  note?: string;
  date: string;
  recurring?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attemptedExpense: AttemptedExpense | null;
  onSuccess?: () => void;
}

export default function InsufficientBalanceModal({
  open,
  onOpenChange,
  attemptedExpense,
  onSuccess,
}: Props) {
  const { data: wallets } = useWallets();
  const createTx = useCreateTransaction();
  const createDebt = useCreateDebt();
  const createRecurring = useCreateRecurring();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"debt" | "transfer">("debt");
  const [sourceWalletId, setSourceWalletId] = useState("");
  const [customTransferAmount, setCustomTransferAmount] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [customDebtAmount, setCustomDebtAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const targetWallet = useMemo(() => {
    if (!attemptedExpense || !wallets) return null;
    return wallets.find((w) => w.id === attemptedExpense.walletId) || null;
  }, [attemptedExpense, wallets]);

  const currentBalance = Number(targetWallet?.balance || 0);
  const expenseAmount = attemptedExpense?.amount || 0;
  const shortage = Math.max(0, expenseAmount - currentBalance);

  // Initialize input fields with default shortage whenever opened or shortage changes
  useEffect(() => {
    if (open && shortage > 0) {
      setCustomDebtAmount(shortage.toString());
      setCustomTransferAmount(shortage.toString());
    }
  }, [open, shortage]);

  // Filter wallets that have available balance to transfer from
  const eligibleSourceWallets = useMemo(() => {
    if (!wallets || !targetWallet) return [];
    return wallets.filter(
      (w) => w.id !== targetWallet.id && Number(w.balance) > 0
    );
  }, [wallets, targetWallet]);

  // Set default source wallet if not chosen yet
  useEffect(() => {
    if (eligibleSourceWallets.length > 0 && !sourceWalletId) {
      setSourceWalletId(eligibleSourceWallets[0].id);
    }
  }, [eligibleSourceWallets, sourceWalletId]);

  // Action 1: Transfer from another wallet and complete expense
  const handleTransferAndSpend = async () => {
    if (!attemptedExpense || !targetWallet) return;
    if (!sourceWalletId) {
      toast.error("দয়া করে টাকা লোড করার ওয়ালেট সিলেক্ট করুন");
      return;
    }

    const transferAmt = parseFloat(customTransferAmount) || shortage;
    if (isNaN(transferAmt) || transferAmt <= 0) {
      toast.error("সঠিক ট্রান্সফার পরিমাণ লিখুন");
      return;
    }

    if (transferAmt < shortage) {
      toast.error(`এই খরচটি পূরণ করতে অন্তত ${formatMoney(shortage)} ট্রান্সফার প্রয়োজন`);
      return;
    }

    const sourceWallet = wallets?.find((w) => w.id === sourceWalletId);
    if (!sourceWallet || Number(sourceWallet.balance) < transferAmt) {
      toast.error(`${sourceWallet?.name || "সিলেক্টেড ওয়ালেটে"} পর্যাপ্ত ব্যালেন্স নেই`);
      return;
    }

    setIsProcessing(true);
    try {
      const newSourceBal = Number(sourceWallet.balance) - transferAmt;
      const newTargetBal = currentBalance + transferAmt;

      const { error: e1 } = await supabase
        .from("wallets")
        .update({ balance: newSourceBal })
        .eq("id", sourceWallet.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("wallets")
        .update({ balance: newTargetBal })
        .eq("id", targetWallet.id);
      if (e2) throw e2;

      await createTx.mutateAsync({
        wallet_id: targetWallet.id,
        type: "expense",
        amount: expenseAmount,
        category: attemptedExpense.category,
        note: attemptedExpense.note,
        date: attemptedExpense.date,
      });

      if (attemptedExpense.recurring) {
        const dayOfMonth = new Date(attemptedExpense.date).getDate();
        await createRecurring.mutateAsync({
          wallet_id: targetWallet.id,
          type: "expense",
          amount: expenseAmount,
          category: attemptedExpense.category,
          note: attemptedExpense.note,
          day_of_month: dayOfMonth,
        });
      }

      await qc.invalidateQueries({ queryKey: ["wallets"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });

      toast.success(
        `${sourceWallet.name} থেকে ${formatMoney(transferAmt)} লোড করে খরচ সফলভাবে সেভ করা হয়েছে!`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // Action 2: Borrow money (Debt) and complete expense
  const handleDebtAndSpend = async () => {
    if (!attemptedExpense || !targetWallet) return;

    const finalLender = lenderName.trim() || "বন্ধু / পরিচিত";
    const borrowAmt = parseFloat(customDebtAmount) || shortage;

    if (isNaN(borrowAmt) || borrowAmt <= 0) {
      toast.error("সঠিক ধারের পরিমাণ লিখুন");
      return;
    }

    if (borrowAmt < shortage) {
      toast.error(`ধারের পরিমাণ অন্তত ঘাটতি (${formatMoney(shortage)}) সমান হতে হবে।`);
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Record debt (borrowed) - automatically adds income into targetWallet
      await createDebt.mutateAsync({
        type: "borrowed",
        person_name: finalLender,
        amount: borrowAmt,
        wallet_id: targetWallet.id,
        date: attemptedExpense.date,
        note: `Borrowed for ${attemptedExpense.category} expense (${targetWallet.name})`,
        affects_wallet: true,
      });

      // 2. Commit the expense transaction
      await createTx.mutateAsync({
        wallet_id: targetWallet.id,
        type: "expense",
        amount: expenseAmount,
        category: attemptedExpense.category,
        note: attemptedExpense.note
          ? `${attemptedExpense.note} (Borrowed ${formatMoney(borrowAmt)} from ${finalLender})`
          : `Borrowed ${formatMoney(borrowAmt)} from ${finalLender}`,
        date: attemptedExpense.date,
      });

      if (attemptedExpense.recurring) {
        const dayOfMonth = new Date(attemptedExpense.date).getDate();
        await createRecurring.mutateAsync({
          wallet_id: targetWallet.id,
          type: "expense",
          amount: expenseAmount,
          category: attemptedExpense.category,
          note: attemptedExpense.note,
          day_of_month: dayOfMonth,
        });
      }

      await qc.invalidateQueries({ queryKey: ["wallets"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["debts"] });

      toast.success(
        `${finalLender}-এর থেকে ${formatMoney(borrowAmt)} ধার নিয়ে খরচ সম্পন্ন হয়েছে!`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!attemptedExpense || !targetWallet) return null;

  const currentDebtNumber = parseFloat(customDebtAmount) || shortage;
  const remainingAfterSpend = currentBalance + currentDebtNumber - expenseAmount;

  const currentTransferNumber = parseFloat(customTransferAmount) || shortage;
  const remainingAfterTransfer = currentBalance + currentTransferNumber - expenseAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] w-[95vw] max-h-[92vh] overflow-y-auto p-5 sm:p-6 bg-card border-border shadow-2xl rounded-2xl gap-4">
        <DialogHeader className="pr-6 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-rose-500/15 text-rose-500">
              <AlertCircle className="h-5 w-5" />
            </span>
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
              ব্যালেন্স কম আছে! (Insufficient Balance)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            আপনার ওয়ালেটে পর্যাপ্ত টাকা নেই। নিচের যেকোনো একটি উপায়ে খরচটি সম্পন্ন করুন:
          </DialogDescription>
        </DialogHeader>

        {/* Shortage Summary Card */}
        <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/70 space-y-2 text-xs">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>ওয়ালেট:</span>
            <span className="font-semibold text-foreground">{targetWallet.name}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>বর্তমান ব্যালেন্স:</span>
            <span className="font-mono font-medium text-foreground">{formatMoney(currentBalance)}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>খরচ করতে চান:</span>
            <span className="font-mono font-medium text-rose-400">-{formatMoney(expenseAmount)}</span>
          </div>
          <div className="border-t border-border/60 pt-2 flex justify-between items-center font-bold">
            <span className="text-destructive">ঘাটতি (আরও লাগবে):</span>
            <span className="text-sm font-mono text-destructive">{formatMoney(shortage)}</span>
          </div>
        </div>

        {/* Action Mode Toggle */}
        <div className="grid grid-cols-2 p-1 bg-secondary/70 rounded-xl border border-border/60">
          <button
            type="button"
            onClick={() => setActiveTab("debt")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "debt"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HandCoins className="h-3.5 w-3.5" /> কারও থেকে ধার নিন
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("transfer")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "transfer"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> অন্য ওয়ালেট থেকে লোড
          </button>
        </div>

        {/* OPTION 1: TAKE DEBT / BORROW */}
        {activeTab === "debt" && (
          <div className="space-y-3.5 pt-1">
            {/* Lender Name Input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                কার কাছ থেকে ধার নিচ্ছেন? (নাম / পরিচয়)
              </Label>
              <Input
                placeholder="যেমন: বন্ধু, ভাই, দোকানদার"
                value={lenderName}
                onChange={(e) => setLenderName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Borrow Amount Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  ধারের পরিমাণ (৳)
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  কমপক্ষে লাগবে: {formatMoney(shortage)}
                </span>
              </div>
              <Input
                type="number"
                step="any"
                min={shortage}
                placeholder={shortage.toString()}
                value={customDebtAmount}
                onChange={(e) => setCustomDebtAmount(e.target.value)}
                className="h-9 text-xs font-mono font-medium"
              />

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setCustomDebtAmount(shortage.toString())}
                  className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
                >
                  ঘাটতি: {formatMoney(shortage)}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomDebtAmount(expenseAmount.toString())}
                  className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
                >
                  পুরো খরচ: {formatMoney(expenseAmount)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(customDebtAmount) || shortage;
                    setCustomDebtAmount((current + 50).toString());
                  }}
                  className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
                >
                  +৳৫০
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(customDebtAmount) || shortage;
                    setCustomDebtAmount((current + 100).toString());
                  }}
                  className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
                >
                  +৳১০০
                </button>
              </div>
            </div>

            {/* Crystal-Clear Step-by-Step Summary */}
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs space-y-1.5 text-foreground">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>১. ধারের খাতায় যুক্ত হবে:</span>
                <span className="font-semibold text-primary">
                  {formatMoney(currentDebtNumber)} ({lenderName.trim() || "উনার কাছে দেনা"})
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>২. খরচ পরিশোধ হবে:</span>
                <span className="font-semibold text-rose-400">-{formatMoney(expenseAmount)}</span>
              </div>
              <div className="border-t border-primary/20 pt-1.5 flex justify-between items-center font-semibold">
                <span>খরচ শেষে {targetWallet.name}-এ থাকবে:</span>
                <span className="font-mono text-emerald-400">{formatMoney(remainingAfterSpend)}</span>
              </div>
            </div>

            <Button
              onClick={handleDebtAndSpend}
              disabled={isProcessing}
              className="w-full h-11 bg-primary text-primary-foreground font-semibold text-xs shadow-md mt-1"
            >
              <HandCoins className="h-4 w-4 mr-1.5" />
              {isProcessing
                ? "সেভ করা হচ্ছে..."
                : `${formatMoney(currentDebtNumber)} ধার নিয়ে খরচ সম্পন্ন করুন`}
            </Button>
          </div>
        )}

        {/* OPTION 2: LOAD FROM ANOTHER WALLET */}
        {activeTab === "transfer" && (
          <div className="space-y-3.5 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">কোন ওয়ালেট থেকে টাকা আনবেন?</Label>
              {eligibleSourceWallets.length === 0 ? (
                <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                  অন্য কোনো ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। দয়া করে "কারও থেকে ধার নিন" অপশনটি ব্যবহার করুন।
                </p>
              ) : (
                <Select value={sourceWalletId} onValueChange={setSourceWalletId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="ওয়ালেট বেছে নিন" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleSourceWallets.map((w) => (
                      <SelectItem key={w.id} value={w.id} className="text-xs">
                        {w.name} (আছে: {formatMoney(Number(w.balance))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">কত টাকা লোড করবেন? (৳)</Label>
                <span className="text-[10px] text-muted-foreground">
                  কমপক্ষে লাগবে: {formatMoney(shortage)}
                </span>
              </div>
              <Input
                type="number"
                step="any"
                min={shortage}
                placeholder={shortage.toString()}
                value={customTransferAmount}
                onChange={(e) => setCustomTransferAmount(e.target.value)}
                className="h-9 text-xs font-mono font-medium"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setCustomTransferAmount(shortage.toString())}
                  className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
                >
                  ঘাটতি: {formatMoney(shortage)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(customTransferAmount) || shortage;
                    setCustomTransferAmount((current + 50).toString());
                  }}
                  className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
                >
                  +৳৫০
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(customTransferAmount) || shortage;
                    setCustomTransferAmount((current + 100).toString());
                  }}
                  className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
                >
                  +৳১০০
                </button>
              </div>
            </div>

            {/* Crystal-Clear Transfer Summary */}
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs space-y-1.5 text-foreground">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>১. অন্য ওয়ালেট থেকে কমবে:</span>
                <span className="font-semibold text-rose-400">-{formatMoney(currentTransferNumber)}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>২. খরচ পরিশোধ হবে:</span>
                <span className="font-semibold text-rose-400">-{formatMoney(expenseAmount)}</span>
              </div>
              <div className="border-t border-primary/20 pt-1.5 flex justify-between items-center font-semibold">
                <span>খরচ শেষে {targetWallet.name}-এ থাকবে:</span>
                <span className="font-mono text-emerald-400">{formatMoney(remainingAfterTransfer)}</span>
              </div>
            </div>

            <Button
              onClick={handleTransferAndSpend}
              disabled={isProcessing || eligibleSourceWallets.length === 0}
              className="w-full h-11 bg-primary text-primary-foreground font-semibold text-xs shadow-md mt-1"
            >
              <ArrowRight className="h-4 w-4 mr-1.5" />
              {isProcessing
                ? "ট্রান্সফার হচ্ছে..."
                : `${formatMoney(currentTransferNumber)} ট্রান্সফার করে খরচ সম্পন্ন করুন`}
            </Button>
          </div>
        )}

        <div className="pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" /> বাতিল করুন (Cancel)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
