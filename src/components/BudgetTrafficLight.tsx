import { getDaysInMonth } from "date-fns";
import { motion } from "framer-motion";

interface Props {
  budget: number;
  todaySpend: number;
}

export default function BudgetTrafficLight({ budget, todaySpend }: Props) {
  const daysInMonth = getDaysInMonth(new Date());
  const dailyBudget = budget / daysInMonth;
  const ratio = dailyBudget > 0 ? todaySpend / dailyBudget : 0;

  let color: string;
  let bgColor: string;
  let message: string;
  let emoji: string;

  if (ratio <= 0.8) {
    color = "text-primary";
    bgColor = "bg-primary/15";
    message = "You're on track today";
    emoji = "✅";
  } else if (ratio <= 1.2) {
    color = "text-accent";
    bgColor = "bg-accent/15";
    message = "Getting close to limit";
    emoji = "⚠️";
  } else {
    color = "text-destructive";
    bgColor = "bg-destructive/15";
    message = "Over budget today!";
    emoji = "❌";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`vault-card p-4 flex items-center gap-3 ${bgColor}`}
    >
      <span className="text-2xl">{emoji}</span>
      <div className="flex-1">
        <p className={`text-sm font-medium ${color}`}>{message}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Today: ৳{todaySpend.toLocaleString("en-US", { minimumFractionDigits: 2 })} / Daily budget: ৳{dailyBudget.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
      </div>
    </motion.div>
  );
}
