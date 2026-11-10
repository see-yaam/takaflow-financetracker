import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/** P3-03: local reminders 48 h before each recurring expense is due (native only). */

export interface ReminderRule {
  id: string;
  type: string;
  amount: number;
  category: string;
  day_of_month: number;
  last_applied_month: string | null;
}

export const REMINDERS_ENABLED_KEY = "takaflow_bill_reminders";
const ID_BASE = 700000; // notification id range reserved for bill reminders
const ID_RANGE = 100000;

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Next due date (local midnight) that has not been applied yet. */
export function nextDueDate(rule: Pick<ReminderRule, "day_of_month" | "last_applied_month">, today: Date): Date {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let i = 0; i < 24; i++) {
    const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const due = new Date(month.getFullYear(), month.getMonth(), Math.min(rule.day_of_month, days));
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const alreadyApplied = !!rule.last_applied_month && rule.last_applied_month >= monthKey(due);
    if (due >= todayMidnight && !alreadyApplied) return due;
  }
  return new Date(today.getFullYear(), today.getMonth() + 1, Math.min(rule.day_of_month, 28));
}

/** Reminder time: 48 h before the due date, at 09:00 local. */
export function reminderTime(due: Date): Date {
  return new Date(due.getFullYear(), due.getMonth(), due.getDate() - 2, 9, 0, 0);
}

/** Stable notification id per rule. */
export function reminderId(ruleId: string): number {
  let h = 0;
  for (let i = 0; i < ruleId.length; i++) h = (Math.imul(31, h) + ruleId.charCodeAt(i)) | 0;
  return ID_BASE + (Math.abs(h) % ID_RANGE);
}

export function remindersEnabled(): boolean {
  try {
    return localStorage.getItem(REMINDERS_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (enabled && Capacitor.isNativePlatform()) {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;
  }
  try {
    localStorage.setItem(REMINDERS_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
  if (!enabled) await cancelBillReminders();
  return enabled;
}

export async function cancelBillReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + ID_RANGE);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
}

/** Replaces all scheduled bill reminders with one per recurring expense rule. */
export async function scheduleBillReminders(rules: ReminderRule[], now = new Date()): Promise<number> {
  if (!Capacitor.isNativePlatform() || !remindersEnabled()) return 0;
  await cancelBillReminders();
  const notifications = rules
    .filter((r) => r.type === "expense")
    .map((r) => {
      const due = nextDueDate(r, now);
      return { r, due, at: reminderTime(due) };
    })
    .filter(({ at }) => at.getTime() > now.getTime())
    .map(({ r, due, at }) => ({
      id: reminderId(r.id),
      title: `Bill due ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${r.category}`,
      body: `৳${Number(r.amount).toLocaleString()} will be recorded automatically on the due date.`,
      schedule: { at, allowWhileIdle: true },
    }));
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return notifications.length;
}
