import { describe, it, expect } from "vitest";
import { nextDueDate, reminderId, reminderTime } from "@/lib/billReminders";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("bill reminder scheduling", () => {
  it("uses this month's due date until it passes or is applied", () => {
    expect(nextDueDate({ day_of_month: 15, last_applied_month: "2026-10" }, d(2026, 11, 10))).toEqual(d(2026, 11, 15));
    expect(nextDueDate({ day_of_month: 5, last_applied_month: "2026-10" }, d(2026, 11, 10))).toEqual(d(2026, 12, 5));
    expect(nextDueDate({ day_of_month: 15, last_applied_month: "2026-11" }, d(2026, 11, 10))).toEqual(d(2026, 12, 15));
  });
  it("clamps day 31 to short months", () => {
    expect(nextDueDate({ day_of_month: 31, last_applied_month: "2027-01" }, d(2027, 2, 1))).toEqual(d(2027, 2, 28));
  });
  it("reminds 48 h before at 09:00", () => {
    expect(reminderTime(d(2026, 11, 15))).toEqual(new Date(2026, 10, 13, 9, 0, 0));
  });
  it("gives each rule a stable id in the reserved range", () => {
    expect(reminderId("rule-1")).toBe(reminderId("rule-1"));
    expect(reminderId("rule-1")).not.toBe(reminderId("rule-2"));
    expect(reminderId("rule-1")).toBeGreaterThanOrEqual(700000);
  });
});
