import { useMemo, useState } from "react";
import { format, startOfMonth, startOfYear, subMonths } from "date-fns";
import { Download, Search, Trash2, RotateCcw, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { useTransactions, useDeleteTransaction, useReverseTransaction, useUpdateTransactionCategory } from "@/hooks/useTransactions";
import { useWallets } from "@/hooks/useWallets";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { filterLedger, ledgerToCsv, downloadCsv } from "@/lib/ledger";
import { formatMoney } from "@/lib/utils";
import { mapSupabaseError } from "@/lib/supabaseErrors";

type Preset = "this-month" | "3-months" | "this-year" | "all" | "custom";
const ALL = "__all__";

function rangeFor(preset: Preset): { from?: string; to?: string } {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "this-month":
      return { from: fmt(startOfMonth(today)) };
    case "3-months":
      return { from: fmt(startOfMonth(subMonths(today, 2))) };
    case "this-year":
      return { from: fmt(startOfYear(today)) };
    default:
      return {};
  }
}

export default function TransactionsPage() {
  const [preset, setPreset] = useState<Preset>("3-months");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [walletId, setWalletId] = useState(ALL);
  const [type, setType] = useState<"" | "income" | "expense">("");
  const [category, setCategory] = useState(ALL);
  const [showReversed, setShowReversed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [confirm, setConfirm] = useState<null | "delete" | "reverse">(null);
  const [busy, setBusy] = useState(false);

  const range = preset === "custom" ? { from: customFrom || undefined, to: customTo || undefined } : rangeFor(preset);
  const { data: rows, isLoading } = useTransactions(range);
  const { data: wallets } = useWallets();
  const del = useDeleteTransaction();
  const reverse = useReverseTransaction();
  const recategorize = useUpdateTransactionCategory();

  const walletInfo = (id: string) => {
    const w = wallets?.find((x) => x.id === id);
    return w ? { name: w.name, currency: w.currency || "BDT" } : undefined;
  };

  const categories = useMemo(() => [...new Set((rows || []).map((r) => r.category))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      filterLedger(rows, {
        search,
        walletId: walletId === ALL ? undefined : walletId,
        type,
        category: category === ALL ? undefined : category,
        includeReversed: showReversed,
        ...range,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range is derived from preset/custom inputs below
    [rows, search, walletId, type, category, showReversed, preset, customFrom, customTo]
  );

  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = async (label: string, fn: (id: string) => Promise<unknown>, ids: string[]) => {
    setBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        await fn(id);
        ok++;
      }
      toast.success(`${label}: ${ok} ${ok === 1 ? "transaction" : "transactions"}`);
      setSelected(new Set());
    } catch (e) {
      toast.error(`${label} stopped after ${ok}: ${mapSupabaseError(e)}`);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const exportCsv = () => {
    const source = selectedRows.length ? selectedRows : filtered;
    if (!source.length) {
      toast.info("Nothing to export with the current filters");
      return;
    }
    downloadCsv(`takaflow-transactions-${format(new Date(), "yyyy-MM-dd")}.csv`, ledgerToCsv(source, walletInfo));
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <Button variant="outline" onClick={exportCsv} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV{selectedRows.length ? ` (${selectedRows.length})` : ""}
        </Button>
      </div>

      <div className="vault-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes, categories or amounts…"
            aria-label="Search transactions"
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger aria-label="Date range" className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This month</SelectItem>
              <SelectItem value="3-months">Last 3 months</SelectItem>
              <SelectItem value="this-year">This year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger aria-label="Wallet" className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All wallets</SelectItem>
              {wallets?.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type || ALL} onValueChange={(v) => setType(v === ALL ? "" : (v as "income" | "expense"))}>
            <SelectTrigger aria-label="Type" className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Income & expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Category" className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" aria-label="From date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-secondary border-border" />
            <Input type="date" aria-label="To date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-secondary border-border" />
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={showReversed} onCheckedChange={(v) => setShowReversed(v === true)} /> Show reversed
        </label>
      </div>

      {selectedRows.length > 0 && (
        <div className="vault-card p-3 flex flex-wrap items-center gap-2 border-primary/40">
          <span className="text-sm font-medium">{selectedRows.length} selected</span>
          <Input
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            placeholder="New category"
            aria-label="New category for selected"
            className="h-9 w-40 bg-secondary border-border"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !bulkCategory.trim()}
            onClick={() =>
              runBulk("Recategorized", (id) => recategorize.mutateAsync({ id, category: bulkCategory.trim() }), selectedRows.map((r) => r.id))
            }
            className="gap-1"
          >
            <Tag className="h-3.5 w-3.5" /> Categorize
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("reverse")} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> Reverse
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("delete")} className="gap-1 text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="vault-card divide-y divide-border/50">
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
          <Checkbox
            aria-label="Select all"
            checked={allSelected}
            onCheckedChange={(v) => setSelected(v === true ? new Set(filtered.map((r) => r.id)) : new Set())}
          />
          <span>{isLoading ? "Loading…" : `${filtered.length} ${filtered.length === 1 ? "transaction" : "transactions"}`}</span>
        </div>
        {filtered.map((t) => {
          const w = walletInfo(t.wallet_id);
          return (
            <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${t.is_reversed ? "opacity-50" : ""}`}>
              <Checkbox aria-label={`Select ${t.category} ${t.date}`} checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${t.is_reversed ? "line-through" : ""}`}>
                  {t.category}
                  {t.transfer_id && <span className="ml-1.5 text-[10px] bg-muted px-1.5 rounded">Transfer</span>}
                  {t._isOfflinePending && <span className="ml-1.5 text-[10px] bg-amber-500/20 text-amber-500 px-1.5 rounded">Pending sync</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.date} · {w?.name || "Wallet"}{t.note ? ` · ${t.note}` : ""}
                </p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${t.type === "income" ? "text-primary" : "text-foreground"}`}>
                {t.type === "income" ? "+" : "-"}
                {formatMoney(Number(t.amount), w?.currency || "BDT")}
              </span>
            </div>
          );
        })}
        {!isLoading && filtered.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No transactions match these filters.</p>}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? "Delete" : "Reverse"} {selectedRows.length} transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "They are removed permanently and their wallet balances are restored."
                : "They stay in the ledger as reversed and no longer affect balances."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirm === "delete"
                  ? runBulk("Deleted", (id) => del.mutateAsync(id), selectedRows.map((r) => r.id))
                  : runBulk("Reversed", (id) => reverse.mutateAsync(id), selectedRows.filter((r) => !r.is_reversed).map((r) => r.id))
              }
            >
              {confirm === "delete" ? "Delete" : "Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
