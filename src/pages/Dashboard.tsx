import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallets } from "@/hooks/useWallets";
import { useTransactions, useReverseTransaction } from "@/hooks/useTransactions";
import { useBudgetGoal } from "@/hooks/useBudgetGoals";
import { useMonthRollover } from "@/hooks/useMonthRollover";
import { useApplyRecurring } from "@/hooks/useRecurringTransactions";
import { useDebts } from "@/hooks/useDebts";
import { useCurrencyRates, convertToBDT } from "@/hooks/useCurrencyRates";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Smartphone,
  Landmark,
  Wallet,
  Plus,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Undo2,
  Pencil,
  Mic,
  ShieldCheck,
  Lock,
  Unlock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AddTransactionDrawer from "@/components/AddTransactionDrawer";
import EditCategoryDialog from "@/components/EditCategoryDialog";
import VoiceTransactionModal from "@/components/voice/VoiceTransactionModal";
import BudgetProgressBar from "@/components/BudgetProgressBar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { cn, formatMoney } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  smartphone: Smartphone,
  bank: Landmark,
  wallet: Wallet,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: wallets, isLoading: wLoading } = useWallets();
  const { data: rates } = useCurrencyRates();
  const { data: debts } = useDebts();
  const currentMonth = format(new Date(), "yyyy-MM");

  const { data: transactions } = useTransactions({ month: currentMonth });
  const { data: budgetGoal } = useBudgetGoal(currentMonth);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<"income" | "expense">("expense");
  const [reverseTarget, setReverseTarget] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Hold-to-Peek Spy Privacy State
  const [isPeeking, setIsPeeking] = useState(false);
  const [isPrivacyLocked, setIsPrivacyLocked] = useState(() => {
    return localStorage.getItem("takaflow_privacy_mode") !== "revealed";
  });

  const isDisguised = isPrivacyLocked && !isPeeking;

  const handlePeekStart = () => {
    if (!isPrivacyLocked) return;
    setIsPeeking(true);
    try {
      if (navigator.vibrate) navigator.vibrate(15);
    } catch {}
  };

  const handlePeekEnd = () => {
    if (isPeeking) {
      setIsPeeking(false);
      try {
        if (navigator.vibrate) navigator.vibrate(8);
      } catch {}
    }
  };

  const togglePrivacyLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isPrivacyLocked;
    setIsPrivacyLocked(next);
    localStorage.setItem("takaflow_privacy_mode", next ? "locked" : "revealed");
    if (next) {
      toast.success("🔒 Vault Privacy Active — Hold anywhere on card to peek!");
    } else {
      toast.success("👁️ Vault Unlocked — Balances are always visible");
    }
    try {
      if (navigator.vibrate) navigator.vibrate([15, 40, 15]);
    } catch {}
  };

  const applyRecurring = useApplyRecurring();
  const reverseMutation = useReverseTransaction();

  useMonthRollover();

  useEffect(() => {
    applyRecurring.mutate();
  }, []); // eslint-disable-line

  if (wLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">Loading...</div>;
  }

  if (wallets && wallets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
        <div className="p-4 rounded-full bg-primary/10 text-primary">
          <Wallet className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-semibold">No Wallets Found</h2>
        <p className="text-muted-foreground max-w-sm">
          You don't have any wallets set up yet. Create a wallet to start tracking your income and expenses.
        </p>
        <Button onClick={() => navigate("/onboarding")} className="mt-2">
          <Plus className="h-4 w-4 mr-2" /> Add a Wallet
        </Button>
      </div>
    );
  }

  const totalBalance = wallets?.reduce((s, w) => {
    const currency = (w as any).currency || "BDT";
    return s + convertToBDT(Number(w.balance), currency, rates);
  }, 0) || 0;

  const activeTx = transactions?.filter((t: any) => !t.is_reversed) || [];
  const monthIncome = activeTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = activeTx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = monthIncome - monthExpense;

  const openDrawer = (type: "income" | "expense") => {
    setDrawerType(type);
    setDrawerOpen(true);
  };

  const handleReverse = () => {
    if (!reverseTarget) return;
    reverseMutation.mutate(reverseTarget.id, {
      onSuccess: () => {
        toast.success("Transaction reversed");
        setReverseTarget(null);
      },
      onError: (e) => toast.error(mapSupabaseError(e)),
    });
  };

  return (
    <div className="space-y-6">
      {/* Hero balance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={handlePeekStart}
        onMouseUp={handlePeekEnd}
        onMouseLeave={handlePeekEnd}
        onTouchStart={handlePeekStart}
        onTouchEnd={handlePeekEnd}
        onTouchCancel={handlePeekEnd}
        onClick={() => {
          setIsPrivacyLocked((prev) => {
            const next = !prev;
            localStorage.setItem("takaflow_privacy_mode", next ? "locked" : "revealed");
            return next;
          });
        }}
        className="vault-card p-5 sm:p-8 relative overflow-hidden select-none cursor-pointer"
      >
        <div className="currency-watermark -top-12 -right-12 rotate-[15deg] text-accent/[0.04]">৳</div>
        <div className="flex items-center justify-between mb-2">
          <p className="wallet-label">Total Balance</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isPrivacyLocked ? (
              <span className="flex items-center gap-1 text-[11px] bg-secondary/80 px-2 py-0.5 rounded-full border border-border/40">
                <Lock className="h-3 w-3 text-amber-500" /> Tap to reveal
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] bg-secondary/80 px-2 py-0.5 rounded-full border border-border/40 text-primary">
                <Unlock className="h-3 w-3" /> Visible
              </span>
            )}
          </div>
        </div>
        <h2
          className={cn(
            "text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight tabular-nums transition-all duration-300",
            totalBalance < 0 ? "text-destructive" : "text-foreground",
            isDisguised ? "filter blur-lg select-none opacity-40" : "filter blur-0 opacity-100"
          )}
        >
          {formatMoney(totalBalance)}
        </h2>
      </motion.div>

      {/* Wallet Carousel Header */}
      <div className="flex items-center justify-between -mb-1">
        <p className="wallet-label text-[11px] sm:text-xs font-semibold text-muted-foreground tracking-wider">
          Wallets ({wallets?.length || 0})
        </p>
        <span className="text-[11px] text-muted-foreground/70 sm:hidden">
          Swipe ➔
        </span>
      </div>

      {/* Wallet cards: Horizontal Carousel on mobile, Grid on desktop */}
      <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory no-scrollbar">
        {wallets?.map((w, i) => {
          const Icon = iconMap[w.icon || "wallet"] || Wallet;
          const currency = (w as any).currency || "BDT";
          const bdtEquiv = convertToBDT(Number(w.balance), currency, rates);
          const isNegative = Number(w.balance) < 0;
          return (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onMouseDown={handlePeekStart}
              onMouseUp={handlePeekEnd}
              onMouseLeave={handlePeekEnd}
              onTouchStart={handlePeekStart}
              onTouchEnd={handlePeekEnd}
              onTouchCancel={handlePeekEnd}
              className="vault-card p-4 sm:p-5 relative overflow-hidden select-none cursor-pointer w-[65vw] min-w-[210px] max-w-[260px] sm:w-auto sm:min-w-0 sm:max-w-none shrink-0 snap-start transition-transform active:scale-[0.98]"
            >
              <div className="absolute top-1 right-2 text-foreground/[0.04] text-5xl font-bold pointer-events-none select-none">৳</div>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-accent shrink-0" />
                <span className="wallet-label truncate">{w.name}</span>
                {currency !== "BDT" && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-auto">{currency}</span>
                )}
                {isNegative && (
                  <span className="text-[10px] bg-destructive/15 text-destructive border border-destructive/25 px-1.5 py-0.2 rounded font-semibold ml-auto">
                    Overdrawn
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-xl sm:text-2xl font-bold tracking-tight tabular-nums transition-all duration-300",
                  isNegative ? "text-destructive" : "text-foreground",
                  isDisguised ? "filter blur-md select-none opacity-40" : "filter blur-0 opacity-100"
                )}
              >
                {formatMoney(Number(w.balance), currency)}
              </p>
              {currency !== "BDT" && (
                <p
                  className={cn(
                    "text-xs text-muted-foreground tabular-nums mt-0.5 transition-all duration-300",
                    isDisguised ? "filter blur-sm select-none opacity-40" : ""
                  )}
                >
                  ≈ {formatMoney(bdtEquiv, "BDT")}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Debt summary widget */}
      {debts && debts.length > 0 && (() => {
        const borrowedRemaining = debts.filter((d: any) => d.type === "borrowed" && !d.settled).reduce((s: number, d: any) => s + Number(d.remaining_amount), 0);
        const lentRemaining = debts.filter((d: any) => d.type === "lent" && !d.settled).reduce((s: number, d: any) => s + Number(d.remaining_amount), 0);
        return (
          <button onClick={() => navigate("/debts")} className="vault-card p-4 w-full text-left hover:bg-card/80 transition-colors">
            <div className="flex items-center justify-between">
              {borrowedRemaining > 0 && (
                <span className="text-sm text-destructive font-medium tabular-nums">You owe: ৳{borrowedRemaining.toLocaleString()}</span>
              )}
              {lentRemaining > 0 && (
                <span className="text-sm text-primary font-medium tabular-nums">Owed to you: ৳{lentRemaining.toLocaleString()}</span>
              )}
              {borrowedRemaining === 0 && lentRemaining === 0 && (
                <span className="text-sm text-muted-foreground">All debts settled</span>
              )}
            </div>
          </button>
        );
      })()}

      {/* Budget progress */}
      {budgetGoal && (
        <BudgetProgressBar budget={budgetGoal.monthly_budget} spent={monthExpense} />
      )}

      {/* Month summary + actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="vault-card p-5 space-y-3 select-none">
          <h3 className="wallet-label mb-3">This Month</h3>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-primary" /> Income</span>
            <span
              className={cn(
                "text-sm font-medium tabular-nums text-primary transition-all duration-300",
                isDisguised ? "filter blur-sm select-none opacity-40" : "filter blur-0 opacity-100"
              )}
            >
              +৳{monthIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown className="h-4 w-4 text-destructive" /> Expense</span>
            <span
              className={cn(
                "text-sm font-medium tabular-nums text-foreground transition-all duration-300",
                isDisguised ? "filter blur-sm select-none opacity-40" : "filter blur-0 opacity-100"
              )}
            >
              -৳{monthExpense.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="border-t border-border/30 pt-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowUpDown className="h-4 w-4" /> Net</span>
            <span
              className={cn(
                `text-sm font-bold tabular-nums transition-all duration-300 ${net >= 0 ? "text-primary" : "text-destructive"}`,
                isDisguised ? "filter blur-sm select-none opacity-40" : "filter blur-0 opacity-100"
              )}
            >
              {net >= 0 ? "+" : ""}৳{net.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="vault-card p-5 flex flex-col justify-center gap-2.5">
          <h3 className="wallet-label mb-1">Quick Actions</h3>
          <Button
            onClick={() => setVoiceOpen(true)}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
          >
            <Mic className="h-4 w-4" />
            <span>Voice Add</span>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => openDrawer("income")} size="sm" className="bg-primary/15 text-primary hover:bg-primary/25 border-0">
              <Plus className="h-3.5 w-3.5" />
              <span>Income</span>
            </Button>
            <Button onClick={() => openDrawer("expense")} size="sm" variant="outline" className="border-border text-foreground hover:bg-muted/50">
              <Plus className="h-3.5 w-3.5" />
              <span>Expense</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4">Recent Transactions</h3>
        {!transactions?.length ? (
          <p className="text-sm text-muted-foreground">No transactions yet. Start tracking your spending.</p>
        ) : (
          <div className="space-y-0">
            {transactions.slice(0, 10).map((t: any) => {
              const isReversed = t.is_reversed;
              return (
                <div key={t.id} className={`transaction-row ${isReversed ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${t.type === "income" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                      {t.type === "income" ? "+" : "-"}
                    </div>
                    <div>
                      <p className={`text-sm font-medium text-foreground ${isReversed ? "line-through" : ""}`}>
                        {t.category}
                        {isReversed && <span className="ml-2 text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded no-underline inline-block">Reversed</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{t.note || (t as any).wallets?.name} · {format(new Date(t.date), "MMM d")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium tabular-nums ${isReversed ? "line-through text-muted-foreground" : t.type === "income" ? "text-primary" : "text-foreground"}`}>
                      {t.type === "income" ? "+" : "-"}৳{Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    {!isReversed && (
                      <button
                        onClick={() => setEditTarget(t)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit category"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!isReversed && (
                      <button
                        onClick={() => setReverseTarget(t)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Reverse"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddTransactionDrawer open={drawerOpen} onOpenChange={setDrawerOpen} defaultType={drawerType} />
      <EditCategoryDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        transactionId={editTarget?.id ?? null}
        currentCategory={editTarget?.category ?? ""}
      />

      {/* Reverse confirmation dialog */}
      <AlertDialog open={!!reverseTarget} onOpenChange={(open) => !open && setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will undo this transaction and restore your wallet balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReverse}
              disabled={reverseMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {reverseMutation.isPending ? "Reversing..." : "Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VoiceTransactionModal open={voiceOpen} onOpenChange={setVoiceOpen} />
    </div>
  );
}
