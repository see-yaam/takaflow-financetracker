import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parse } from "date-fns";
import { Printer, ArrowLeft } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { useWallets } from "@/hooks/useWallets";
import { useMonthlySnapshots } from "@/hooks/useMonthlySnapshots";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import { reportableTransactions } from "@/lib/finance";

/** P3-03: printable monthly statement ("Save as PDF" via the browser / Android print dialog). */
export default function StatementPage() {
  const { month = format(new Date(), "yyyy-MM") } = useParams();
  const navigate = useNavigate();
  const { data: txs } = useTransactions({ month });
  const { data: wallets } = useWallets();
  const { data: snapshots } = useMonthlySnapshots(month);
  const walletOf = (id: string) => wallets?.find((w) => w.id === id);
  const label = format(parse(month, "yyyy-MM", new Date()), "MMMM yyyy");

  const rows = useMemo(() => [...(txs || [])].sort((a, b) => a.date.localeCompare(b.date)), [txs]);
  const reportable = reportableTransactions(rows);
  const byCategory = useMemo(() => {
    const m = new Map<string, { income: number; expense: number }>();
    for (const t of reportable) {
      const e = m.get(t.category) || { income: 0, expense: 0 };
      if (t.type === "income") e.income += Number(t.amount);
      else e.expense += Number(t.amount);
      m.set(t.category, e);
    }
    return [...m.entries()].sort((a, b) => b[1].expense + b[1].income - (a[1].expense + a[1].income));
  }, [reportable]);
  const totalIn = reportable.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = reportable.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="statement p-4 md:p-8 max-w-4xl mx-auto space-y-5 pb-28 print:p-0 print:pb-0">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" /> Save as PDF / Print
        </Button>
      </div>

      <header>
        <h1 className="text-2xl font-bold">TakaFlow statement · {label}</h1>
        <p className="text-sm text-muted-foreground">Generated {format(new Date(), "d MMM yyyy, HH:mm")}</p>
      </header>

      <section className="grid grid-cols-3 gap-3 text-sm">
        <div className="vault-card p-3"><p className="text-muted-foreground">Income</p><p className="font-bold">{formatMoney(totalIn)}</p></div>
        <div className="vault-card p-3"><p className="text-muted-foreground">Expense</p><p className="font-bold">{formatMoney(totalOut)}</p></div>
        <div className="vault-card p-3"><p className="text-muted-foreground">Net</p><p className="font-bold">{formatMoney(totalIn - totalOut)}</p></div>
      </section>

      {!!snapshots?.length && (
        <section>
          <h2 className="wallet-label mb-2">Wallets</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th>Wallet</th><th className="text-right">Opening</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Closing</th></tr></thead>
            <tbody>
              {snapshots.map((s) => {
                const w = walletOf(s.wallet_id);
                const cur = w?.currency || "BDT";
                const closing = Number(s.opening_balance) + Number(s.total_income) - Number(s.total_expense);
                return (
                  <tr key={s.id} className="border-t border-border/50">
                    <td>{w?.name || "Wallet"}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(s.opening_balance), cur)}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(s.total_income), cur)}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(s.total_expense), cur)}</td>
                    <td className="text-right tabular-nums">{formatMoney(closing, cur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2 className="wallet-label mb-2">By category</h2>
        <table className="w-full text-sm">
          <tbody>
            {byCategory.map(([cat, v]) => (
              <tr key={cat} className="border-t border-border/50">
                <td>{cat}</td>
                <td className="text-right tabular-nums text-primary">{v.income ? `+${formatMoney(v.income)}` : ""}</td>
                <td className="text-right tabular-nums">{v.expense ? `-${formatMoney(v.expense)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="wallet-label mb-2">Transactions ({rows.length})</h2>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th>Date</th><th>Category</th><th>Wallet</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {rows.map((t) => {
              const w = walletOf(t.wallet_id);
              return (
                <tr key={t.id} className={`border-t border-border/50 ${t.is_reversed ? "line-through opacity-60" : ""}`}>
                  <td>{t.date}</td>
                  <td>{t.category}{t.transfer_id ? " (transfer)" : ""}</td>
                  <td>{w?.name}</td>
                  <td className="max-w-[16rem] truncate">{t.note}</td>
                  <td className="text-right tabular-nums">{t.type === "income" ? "+" : "-"}{formatMoney(Number(t.amount), w?.currency || "BDT")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
