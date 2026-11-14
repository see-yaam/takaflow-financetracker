import { describe, it, expect, beforeEach } from "vitest";
import { budgetRunwayDays, daysLeftInMonth, safeDailyAllowance } from "@/lib/finance";
import { DEFAULT_PRESETS, defaultQuickWallet, loadPresets, sanitizePresets, savePresets } from "@/lib/quickLog";

const nov10 = new Date(2026, 10, 10);

describe("safe daily allowance & runway", () => {
  it("spreads the remaining budget over the days left incl. today", () => {
    expect(daysLeftInMonth(nov10)).toBe(21);
    expect(safeDailyAllowance(21000, 10500, nov10)).toEqual({ remaining: 10500, perDay: 500, daysLeft: 21 });
  });
  it("is zero per day once over budget", () => {
    expect(safeDailyAllowance(1000, 1500, nov10)).toMatchObject({ remaining: -500, perDay: 0 });
  });
  it("runway = balance / average daily spend so far", () => {
    expect(budgetRunwayDays(30000, 10000, nov10)).toBe(30); // 1000/day
    expect(budgetRunwayDays(30000, 0, nov10)).toBeNull();
  });
});

describe("quick-log presets", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to Rickshaw/Chai/Lunch and persists edits", () => {
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    savePresets([{ id: "x", label: "Bus", amount: 25, category: "Transport" }]);
    expect(loadPresets()).toEqual([{ id: "x", label: "Bus", amount: 25, category: "Transport" }]);
  });
  it("drops invalid presets and falls back to defaults when empty", () => {
    expect(sanitizePresets([{ label: "", amount: 5, category: "x" }, { label: "Tea", amount: -1, category: "x" }])).toEqual(DEFAULT_PRESETS);
  });
  it("prefers a cash wallet for quick logs", () => {
    expect(defaultQuickWallet([{ id: "1", name: "bKash" }, { id: "2", name: "Cash" }])?.id).toBe("2");
    expect(defaultQuickWallet([{ id: "1", name: "bKash" }])?.id).toBe("1");
  });
});
