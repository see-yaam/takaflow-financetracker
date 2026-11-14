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
    <div className="vault-card p-4 grid grid-cols-2 gap-3">
      <div>
        <p className="wallet-label">Safe daily allowance</p>
        {allowance ? (
          <>
            <p className={`text-xl font-bold tabular-nums ${allowance.remaining < 0 ? "text-destructive" : "text-foreground"}`}>
              {formatMoney(allowance.perDay)}
            </p>
            <p className="text-xs text-muted-foreground">
              {allowance.remaining < 0
                ? `Over budget by ${formatMoney(-allowance.remaining)}`
                : `${formatMoney(allowance.remaining)} left · ${allowance.daysLeft} days`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Set a monthly budget in Goals to see this.</p>
        )}
      </div>
      <div>
        <p className="wallet-label">Budget runway</p>
        {runway !== null ? (
          <>
            <p className="text-xl font-bold tabular-nums">{runway} days</p>
            <p className="text-xs text-muted-foreground">at this month's average daily spend</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Appears once you log spending this month.</p>
        )}
      </div>
    </div>
  );
}
