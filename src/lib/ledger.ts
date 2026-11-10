/** Pure helpers for the /transactions ledger: filtering and RFC 4180 CSV export. */

export interface LedgerRow {
  id: string;
  date: string;
  type: string;
  amount: number | string;
  category: string;
  note?: string | null;
  wallet_id: string;
  is_reversed?: boolean | null;
  transfer_id?: string | null;
  _isOfflinePending?: boolean;
}

export interface LedgerFilters {
  search?: string;
  walletId?: string;
  type?: "income" | "expense" | "";
  category?: string;
  from?: string; // yyyy-MM-dd inclusive
  to?: string; // yyyy-MM-dd inclusive
  includeReversed?: boolean;
}

export function filterLedger<T extends LedgerRow>(rows: T[] | null | undefined, f: LedgerFilters): T[] {
  const q = (f.search || "").trim().toLowerCase();
  return (rows || []).filter((t) => {
    if (!f.includeReversed && t.is_reversed) return false;
    if (f.walletId && t.wallet_id !== f.walletId) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (q) {
      const hay = `${t.note || ""} ${t.category || ""} ${t.amount}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** RFC 4180: quote fields containing comma, quote, CR or LF; double embedded quotes; CRLF line breaks. */
export function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of text fields).
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function ledgerToCsv(
  rows: LedgerRow[],
  walletInfo: (walletId: string) => { name: string; currency: string } | undefined
): string {
  const header = ["Date", "Type", "Amount", "Currency", "Category", "Wallet", "Note", "Status", "Transfer"];
  const lines = [header.map(csvField).join(",")];
  for (const t of rows) {
    const w = walletInfo(t.wallet_id);
    lines.push(
      [
        t.date,
        t.type,
        Number(t.amount).toFixed(2),
        w?.currency || "BDT",
        t.category,
        w?.name || "",
        t.note || "",
        t.is_reversed ? "reversed" : t._isOfflinePending ? "pending sync" : "",
        t.transfer_id ? "yes" : "",
      ]
        .map(csvField)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Triggers a browser download (BOM so Excel opens UTF-8 Bangla text correctly). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
