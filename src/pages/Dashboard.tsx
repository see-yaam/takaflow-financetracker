import { useState, useEffect } from "react";
import { useWallets } from "@/hooks/useWallets";
import { useTransactions } from "@/hooks/useTransactions";
import { useBudgetGoal } from "@/hooks/useBudgetGoals";
import { useMonthRollover } from "@/hooks/useMonthRollover";
import { useApplyRecurring } from "@/hooks/useRecurringTransactions";

import { useCurrencyRates, convertToBDT } from "@/hooks/useCurrencyRates";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Smartphone, Landmark, Wallet, Plus, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddTransactionDrawer from "@/components/AddTransactionDrawer";
import BudgetProgressBar from "@/components/BudgetProgressBar";


const iconMap: Record<string, React.ElementType> = {
  smartphone: Smartphone,
  bank: Landmark,
  wallet: Wallet,
};

export default function Dashboard() {
  const { data: wallets, isLoading: wLoading } = useWallets();
  const { data: rates } = useCurrencyRates();
  const currentMonth = format(new Date(), "yyyy-MM");
  
  const { data: transactions } = useTransactions({ month: currentMonth });
  const { data: budgetGoal } = useBudgetGoal(currentMonth);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<"income" | "expense">("expense");
  
  const applyRecurring = useApplyRecurring();

  // Auto-rollover snapshots
  useMonthRollover();

  // Apply recurring transactions on load
  useEffect(() => {
    applyRecurring.mutate();
  }, []); // eslint-disable-line

  if (wLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">Loading...</div>;
  }

  if (wallets && wallets.length === 0) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">Loading...</div>;
  }

  const totalBalance = wallets?.reduce((s, w) => {
    const currency = (w as any).currency || "BDT";
    return s + convertToBDT(Number(w.balance), currency, rates);
  }, 0) || 0;

  const monthIncome = transactions?.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0) || 0;
  const monthExpense = transactions?.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0) || 0;
  const net = monthIncome - monthExpense;

  

  const openDrawer = (type: "income" | "expense") => {
    setDrawerType(type);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Hero balance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="vault-card p-8 relative overflow-hidden"
      >
        <div className="currency-watermark -top-12 -right-12 rotate-[15deg] text-accent/[0.04]">৳</div>
        <p className="wallet-label mb-2">Total Balance</p>
        <h2 className="text-balance-hero text-foreground">
          ৳{totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </h2>
      </motion.div>

      {/* Wallet cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {wallets?.map((w, i) => {
          const Icon = iconMap[w.icon || "wallet"] || Wallet;
          const currency = (w as any).currency || "BDT";
          const bdtEquiv = convertToBDT(Number(w.balance), currency, rates);
          return (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="vault-card p-5 relative overflow-hidden"
            >
              <div className="absolute top-2 right-3 text-foreground/[0.04] text-6xl font-bold pointer-events-none select-none">৳</div>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="h-4 w-4 text-accent" />
                <span className="wallet-label">{w.name}</span>
                {currency !== "BDT" && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{currency}</span>
                )}
              </div>
              <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {currency !== "BDT" ? `${currency} ` : "৳"}{Number(w.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              {currency !== "BDT" && (
                <p className="text-xs text-muted-foreground tabular-nums mt-1">
                  ≈ ৳{bdtEquiv.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Budget progress */}
      {budgetGoal && (
        <BudgetProgressBar budget={budgetGoal.monthly_budget} spent={monthExpense} />
      )}

      {/* Month summary + actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="vault-card p-5 space-y-3">
          <h3 className="wallet-label mb-3">This Month</h3>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-primary" /> Income</span>
            <span className="text-sm font-medium tabular-nums text-primary">+৳{monthIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown className="h-4 w-4 text-destructive" /> Expense</span>
            <span className="text-sm font-medium tabular-nums text-foreground">-৳{monthExpense.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="border-t border-border/30 pt-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowUpDown className="h-4 w-4" /> Net</span>
            <span className={`text-sm font-bold tabular-nums ${net >= 0 ? "text-primary" : "text-destructive"}`}>
              {net >= 0 ? "+" : ""}৳{net.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="vault-card p-5 flex flex-col justify-center gap-3">
          <h3 className="wallet-label mb-1">Quick Actions</h3>
          <Button onClick={() => openDrawer("income")} className="bg-primary/15 text-primary hover:bg-primary/25 border-0">
            <Plus className="h-4 w-4 mr-2" /> Add Income
          </Button>
          <Button onClick={() => openDrawer("expense")} variant="outline" className="border-border text-foreground hover:bg-muted/50">
            <Plus className="h-4 w-4 mr-2" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4">Recent Transactions</h3>
        {!transactions?.length ? (
          <p className="text-sm text-muted-foreground">No transactions yet. Start tracking your spending.</p>
        ) : (
          <div className="space-y-0">
            {transactions.slice(0, 10).map((t) => (
              <div key={t.id} className="transaction-row">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${t.type === "income" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                    {t.type === "income" ? "+" : "-"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.category}</p>
                    <p className="text-xs text-muted-foreground">{t.note || (t as any).wallets?.name} · {format(new Date(t.date), "MMM d")}</p>
                  </div>
                </div>
                <span className={`text-sm font-medium tabular-nums ${t.type === "income" ? "text-primary" : "text-foreground"}`}>
                  {t.type === "income" ? "+" : "-"}৳{Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddTransactionDrawer open={drawerOpen} onOpenChange={setDrawerOpen} defaultType={drawerType} />
    </div>
  );
}
