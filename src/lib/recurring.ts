import { format } from "date-fns";

/** Pure scheduling logic for recurring transactions (catch-up + idempotent ids). */

export interface RecurringRuleLike {
  id: string;
  day_of_month: number;
  last_applied_month: string | null;
  created_at: string;
}

export interface DueOccurrence {
  month: string; // yyyy-MM
  date: string; // yyyy-MM-dd (due day, clamped to the month's last day)
}

export const MAX_CATCH_UP_OCCURRENCES = 12;

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Every occurrence that is due by `today` and not applied yet, oldest first,
 * capped to the most recent `max`.
 *  - Months after `last_applied_month`. For legacy rules where it is null, start
 *    after the creation month: every creation path logs that month's transaction
 *    together with the rule.
 *  - Due day = min(day_of_month, days in that month): a "31st" rule still fires
 *    on Feb 28/29 and on the 30th in 30-day months.
 *  - Never before the rule existed, never in the future.
 */
export function dueOccurrences(rule: RecurringRuleLike, today: Date, max = MAX_CATCH_UP_OCCURRENCES): DueOccurrence[] {
  const todayStr = format(today, "yyyy-MM-dd");
  const currentMonth = todayStr.slice(0, 7);
  const createdDate = rule.created_at ? format(new Date(rule.created_at), "yyyy-MM-dd") : "0000-01-01";
  const day = Math.min(Math.max(1, Math.trunc(rule.day_of_month || 1)), 31);

  let month = nextMonth(rule.last_applied_month || createdDate.slice(0, 7));
  const out: DueOccurrence[] = [];
  // Hard stop guards against corrupt dates looping forever (~100 years).
  for (let guard = 0; month <= currentMonth && guard < 1200; guard++, month = nextMonth(month)) {
    const dd = Math.min(day, daysInMonth(month));
    const date = `${month}-${String(dd).padStart(2, "0")}`;
    if (date <= todayStr && date >= createdDate) out.push({ month, date });
  }
  return out.slice(-max);
}

/** cyrb128: fast, well-distributed 128-bit string hash (not cryptographic; used as an idempotency key). */
function hash128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * Deterministic UUID (RFC 9562 v8 layout) for "rule X in month M". Every tab and
 * device computes the same id, so a second insert hits the primary key (23505)
 * instead of creating a duplicate entry.
 */
export function recurringTxId(ruleId: string, month: string): string {
  const hex = hash128(`takaflow:recurring:${ruleId}:${month}`)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("")
    .split("");
  hex[12] = "8"; // version 8 (custom)
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16); // RFC variant
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
