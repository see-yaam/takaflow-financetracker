import { describe, it, expect } from "vitest";
import { csvField, filterLedger, ledgerToCsv, LedgerRow } from "@/lib/ledger";

const rows: LedgerRow[] = [
  { id: "1", date: "2026-11-01", type: "expense", amount: 120, category: "Food & Dining", note: "Kacchi, Star", wallet_id: "w1" },
  { id: "2", date: "2026-10-15", type: "income", amount: 50000, category: "Salary", note: null, wallet_id: "w2" },
  { id: "3", date: "2026-11-05", type: "expense", amount: 30, category: "Transport", note: 'Rickshaw "short"', wallet_id: "w1", is_reversed: true },
  { id: "4", date: "2026-11-06", type: "expense", amount: 500, category: "Transfer", note: "=HYPERLINK(evil)", wallet_id: "w1", transfer_id: "t" },
];

describe("filterLedger", () => {
  it("searches note and category, case-insensitively", () => {
    expect(filterLedger(rows, { search: "kacchi" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterLedger(rows, { search: "SALARY" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("combines wallet, type, category and inclusive date range", () => {
    expect(filterLedger(rows, { walletId: "w1", type: "expense", from: "2026-11-01", to: "2026-11-06" }).map((r) => r.id)).toEqual(["1", "4"]);
    expect(filterLedger(rows, { category: "Salary" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("hides reversed rows unless asked", () => {
    expect(filterLedger(rows, {}).some((r) => r.id === "3")).toBe(false);
    expect(filterLedger(rows, { includeReversed: true }).some((r) => r.id === "3")).toBe(true);
  });
});

describe("RFC 4180 CSV", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField(null)).toBe("");
  });
  it("neutralises formula injection but keeps negative numbers", () => {
    expect(csvField("=HYPERLINK(evil)")).toBe("'=HYPERLINK(evil)");
    expect(csvField("-25.50")).toBe("-25.50");
  });
  it("exports header + one CRLF line per row with wallet name and currency", () => {
    const csv = ledgerToCsv(rows.slice(0, 2), (id) => (id === "w1" ? { name: "bKash", currency: "BDT" } : { name: "Payoneer", currency: "USD" }));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Date,Type,Amount,Currency,Category,Wallet,Note,Status,Transfer");
    expect(lines[1]).toBe('2026-11-01,expense,120.00,BDT,Food & Dining,bKash,"Kacchi, Star",,');
    expect(lines[2]).toBe("2026-10-15,income,50000.00,USD,Salary,Payoneer,,,");
    expect(lines[3]).toBe("");
  });
});
