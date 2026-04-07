import { useState } from "react";
import { useBudgetGoal, useUpsertBudgetGoal } from "@/hooks/useBudgetGoals";
import { useTransactions } from "@/hooks/useTransactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Wallet, Pencil } from "lucide-react";

export default function MonthlyBudgetCard() {
  const currentMonth = format(new Date(), "yyyy-MM");
  const { data: budgetGoal } = useBudgetGoal(currentMonth);
  const { data: monthTx } = useTransactions({ month: currentMonth });
  const upsertBudget = useUpsertBudgetGoal();

  const [showDialog, setShowDialog] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  const monthExpense = (monthTx || [])
    .filter((t: any) => t.type === "expense" && !t.is_reversed)
    .reduce((s: number, t: any) => s + Number(t.amount), 0);

  const budget = budgetGoal ? Number(budgetGoal.monthly_budget) : 0;
  const pct = budget > 0 ? Math.min((monthExpense / budget) * 100, 100) : 0;
  const color = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-accent" : "bg-primary";

  const handleSet = async () => {
    const val = parseFloat(budgetInput);
    if (!val || val <= 0) { toast.error("Enter a valid amount"); return; }
    try {
      await upsertBudget.mutateAsync({ month: currentMonth, monthly_budget: val });
      setBudgetInput("");
      setShowDialog(false);
      toast.success("Budget goal set");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <div className="vault-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="wallet-label flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Monthly Budget
          </h3>
          <Button
            onClick={() => { setShowDialog(true); setBudgetInput(budget > 0 ? String(budget) : ""); }}
            size="sm"
            className="bg-primary/15 text-primary hover:bg-primary/25 border-0"
          >
            <Pencil className="h-3 w-3 mr-1" /> {budget > 0 ? "Edit" : "Set Budget"}
          </Button>
        </div>

        {budget > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              Spent ৳{monthExpense.toLocaleString("en-US", { minimumFractionDigits: 2 })} of ৳{budget.toLocaleString("en-US", { minimumFractionDigits: 2 })} budget ({pct.toFixed(0)}% used)
            </p>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${color}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {format(new Date(), "MMMM yyyy")} · ৳{Math.max(budget - monthExpense, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} remaining
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Set a monthly budget to track your spending</p>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Set Monthly Budget</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="e.g. 30000"
              className="bg-secondary border-border"
            />
            <Button onClick={handleSet} disabled={upsertBudget.isPending} className="w-full bg-primary text-primary-foreground">
              {upsertBudget.isPending ? "Saving..." : "Save Budget"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
