/** 1-tap micro-expense presets (stored per device). */
export interface QuickPreset {
  id: string;
  label: string;
  amount: number;
  category: string;
}

export const QUICK_LOG_KEY = "takaflow_quick_log_v1";

export const DEFAULT_PRESETS: QuickPreset[] = [
  { id: "rickshaw", label: "Rickshaw", amount: 30, category: "Transport" },
  { id: "chai", label: "Chai", amount: 20, category: "Food & Dining" },
  { id: "lunch", label: "Lunch", amount: 150, category: "Food & Dining" },
];

export function sanitizePresets(raw: unknown): QuickPreset[] {
  if (!Array.isArray(raw)) return DEFAULT_PRESETS;
  const list = raw
    .filter(
      (p): p is QuickPreset =>
        !!p && typeof p.label === "string" && p.label.trim() !== "" && Number(p.amount) > 0 && typeof p.category === "string"
    )
    .slice(0, 8)
    .map((p, i) => ({ id: String(p.id || `p${i}`), label: p.label.trim().slice(0, 20), amount: Number(p.amount), category: p.category.trim() || "Other" }));
  return list.length ? list : DEFAULT_PRESETS;
}

export function loadPresets(): QuickPreset[] {
  try {
    const raw = localStorage.getItem(QUICK_LOG_KEY);
    return raw ? sanitizePresets(JSON.parse(raw)) : DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresets(presets: QuickPreset[]): void {
  try {
    localStorage.setItem(QUICK_LOG_KEY, JSON.stringify(sanitizePresets(presets)));
  } catch {
    // private mode: presets just won't persist
  }
}

/** Prefer a cash-like wallet for pocket spending, else the first wallet. */
export function defaultQuickWallet<T extends { id: string; name: string }>(wallets: T[] | null | undefined): T | undefined {
  const list = wallets || [];
  return list.find((w) => /cash|pocket|নগদ টাকা|মানিব্যাগ/i.test(w.name)) || list[0];
}
