import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useRecurringTransactions } from "@/hooks/useRecurringTransactions";
import { scheduleBillReminders, ReminderRule } from "@/lib/billReminders";

/** Keeps native bill reminders in sync with recurring rules (app start, rule changes, toggle). */
export function useBillReminderSync() {
  const { data: rules } = useRecurringTransactions();
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !rules) return;
    const run = () => {
      scheduleBillReminders(rules as ReminderRule[]).catch((err) => console.warn("Bill reminder scheduling failed:", err));
    };
    run();
    window.addEventListener("takaflow_reschedule_reminders", run);
    return () => window.removeEventListener("takaflow_reschedule_reminders", run);
  }, [rules]);
}
