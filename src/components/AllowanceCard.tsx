import { budgetRunwayDays, safeDailyAllowance } from "@/lib/finance";
import { formatMoney } from "@/lib/utils";

interface Props {
  budget?: number | null;
  spent: number;
  totalBalance: number;
}

/** P2-05: "Safe Daily Allowance" (budget left / days left) + "Budget Runway" (balance / avg daily spend). */
export default function AllowanceCard({ budget, spent, totalBalance }: Props) {
  const today = new Date();
  const allowance = budget ? safeDailyAllowance(Number(budget), spent, today) : null;
  const runway = budgetRunwayDays(totalBalance, spent, today);
  if (!allowance && runway === null) return null;

  return (
    <div className="vault-card p-3 sm:p-4 grid grid-cols-2 gap-2 sm:gap-3 min-w-0">
      <div className="min-w-0">
        <p className="wallet-label truncate">Daily allowance</p>
        {allowance ? (
          <>
            <p className={`text-base sm:text-xl font-bold tabular-nums break-words ${allowance.remaining < 0 ? "text-destructive" : "text-foreground"}`}>
              {formatMoney(allowance.perDay)}
            </p>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug break-words">
              {allowance.remaining < 0
                ? `Over budget by ${formatMoney(-allowance.remaining)}`
                : `${formatMoney(allowance.remaining)} left · ${allowance.daysLeft} days`}
            </p>
          </>
        ) : (
          <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug break-words">Set a monthly budget in Goals to see this.</p>
        )}
      </div>
      <div className="min-w-0">
        <p className="wallet-label truncate">Budget runway</p>
        {runway !== null ? (
          <>
            <p className="text-base sm:text-xl font-bold tabular-nums break-words">{runway} days</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug break-words">at this month's average daily spend</p>
          </>
        ) : (
          <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug break-words">Appears once you log spending this month.</p>
        )}
      </div>
    </div>
  );
}
