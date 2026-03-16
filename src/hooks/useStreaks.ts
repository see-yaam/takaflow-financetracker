import { useMemo } from "react";
import { useTransactions } from "./useTransactions";
import { format, subDays, differenceInCalendarDays, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  earned: boolean;
}

export function useStreaks() {
  const { data: allTx } = useTransactions();

  return useMemo(() => {
    if (!allTx?.length) return { streak: 0, badges: getDefaultBadges(false, 0, 0, 0) };

    // Get unique transaction dates
    const txDates = new Set(allTx.map((t: any) => t.date));
    const sortedDates = Array.from(txDates).sort().reverse();

    // Calculate current streak
    let streak = 0;
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

    // Start from today or yesterday
    let checkDate = txDates.has(today) ? new Date() : txDates.has(yesterday) ? subDays(new Date(), 1) : null;

    if (checkDate) {
      while (txDates.has(format(checkDate, "yyyy-MM-dd"))) {
        streak++;
        checkDate = subDays(checkDate, 1);
      }
    }

    // Check if user logged every day this month
    const now = new Date();
    const monthStart = startOfMonth(now);
    const daysThisMonth = eachDayOfInterval({ start: monthStart, end: now });
    const loggedEveryDay = daysThisMonth.every((d) => txDates.has(format(d, "yyyy-MM-dd")));

    // Calculate savings rate for current month
    const currentMonth = format(now, "yyyy-MM");
    const monthTx = allTx.filter((t: any) => t.date.startsWith(currentMonth));
    const monthIncome = monthTx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const monthExpense = monthTx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;

    const badges = getDefaultBadges(loggedEveryDay, streak, allTx.length, savingsRate);

    return { streak, badges };
  }, [allTx]);
}

function getDefaultBadges(loggedEveryDay: boolean, streak: number, totalTx: number, savingsRate: number): Badge[] {
  return [
    {
      id: "first-step",
      name: "First Step",
      emoji: "👣",
      description: "Logged first transaction",
      earned: totalTx > 0,
    },
    {
      id: "week-warrior",
      name: "Week Warrior",
      emoji: "⚔️",
      description: "7 day logging streak",
      earned: streak >= 7,
    },
    {
      id: "monthly-master",
      name: "Monthly Master",
      emoji: "👑",
      description: "Logged every day this month",
      earned: loggedEveryDay,
    },
    {
      id: "saving-hero",
      name: "Saving Hero",
      emoji: "🦸",
      description: "Saved 20%+ of income this month",
      earned: savingsRate >= 20,
    },
  ];
}
