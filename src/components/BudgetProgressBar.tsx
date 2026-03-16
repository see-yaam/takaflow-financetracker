import { motion } from "framer-motion";

interface BudgetProgressBarProps {
  budget: number;
  spent: number;
}

export default function BudgetProgressBar({ budget, spent }: BudgetProgressBarProps) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const color = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-accent" : "bg-primary";

  return (
    <div className="vault-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="wallet-label">Budget Progress</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          ৳{spent.toLocaleString("en-US", { minimumFractionDigits: 2 })} / ৳{budget.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1 tabular-nums">{pct.toFixed(0)}% utilized</p>
    </div>
  );
}
