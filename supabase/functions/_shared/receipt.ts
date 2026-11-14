// Pure receipt-OCR schema + sanitizer (no Deno globals) shared by scan-receipt and tests.

export interface ReceiptScan {
  merchant: string | null;
  total: number | null;
  date: string | null; // yyyy-MM-dd
  vat: number | null;
  category: string | null;
  currency: string | null;
  items: Array<{ name: string; amount: number }>;
}

export const RECEIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant: { type: "STRING", nullable: true },
    total: { type: "NUMBER", nullable: true },
    date: { type: "STRING", nullable: true, description: "Purchase date as YYYY-MM-DD" },
    vat: { type: "NUMBER", nullable: true },
    category: { type: "STRING", nullable: true, description: "English spending category, e.g. Groceries, Food & Dining" },
    currency: { type: "STRING", nullable: true },
    items: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { name: { type: "STRING" }, amount: { type: "NUMBER" } }, required: ["name", "amount"] },
    },
  },
  required: ["total"],
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const str = (v: unknown, max = 80): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function sanitizeReceipt(raw: unknown): ReceiptScan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const date = str(r.date, 10);
  return {
    merchant: str(r.merchant),
    total: num(r.total),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    vat: num(r.vat),
    category: str(r.category, 40),
    currency: str(r.currency, 5),
    items: Array.isArray(r.items)
      ? r.items
          .map((i) => ({ name: str((i as Record<string, unknown>)?.name, 60), amount: num((i as Record<string, unknown>)?.amount) }))
          .filter((i): i is { name: string; amount: number } => !!i.name && i.amount !== null)
          .slice(0, 50)
      : [],
  };
}
