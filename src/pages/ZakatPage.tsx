import { useEffect, useMemo, useState } from "react";
import { useWallets } from "@/hooks/useWallets";
import { useDebts } from "@/hooks/useDebts";
import { useCurrencyRates, convertToBDT } from "@/hooks/useCurrencyRates";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeZakat, NISAB_GRAMS, NisabBasis } from "@/lib/zakat";
import { formatMoney } from "@/lib/utils";

const SETTINGS_KEY = "takaflow_zakat_v1";

interface Saved {
  basis: NisabBasis;
  price: string;
  other: string;
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { basis: "silver", price: "", other: "", ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { basis: "silver", price: "", other: "" };
}

/** P2-06: যাকাত ক্যালকুলেটর. */
export default function ZakatPage() {
  const { data: wallets } = useWallets();
  const { data: debts } = useDebts();
  const { data: rates } = useCurrencyRates();
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [includeReceivables, setIncludeReceivables] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
    } catch {
      // ignore
    }
  }, [saved]);

  const walletRows = (wallets || []).map((w) => ({
    id: w.id,
    name: w.name,
    bdt: convertToBDT(Number(w.balance), w.currency || "BDT", rates),
  }));
  const cashAndBank = walletRows.filter((w) => !excluded.has(w.id) && w.bdt > 0).reduce((s, w) => s + w.bdt, 0);
  const active = (debts || []).filter((d: { settled?: boolean | null }) => !d.settled);
  const receivables = active.filter((d: { type: string }) => d.type === "lent").reduce((s: number, d: { remaining_amount: number }) => s + Number(d.remaining_amount), 0);
  const payables = active.filter((d: { type: string }) => d.type === "borrowed").reduce((s: number, d: { remaining_amount: number }) => s + Number(d.remaining_amount), 0);

  const result = useMemo(
    () =>
      computeZakat({
        cashAndBank,
        otherAssets: Number(saved.other) || 0,
        receivables: includeReceivables ? receivables : 0,
        shortTermDebts: payables,
        basis: saved.basis,
        pricePerGram: Number(saved.price) || 0,
      }),
    [cashAndBank, saved, includeReceivables, receivables, payables]
  );

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4 pb-28">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Zakat Calculator · যাকাত</h1>
        <p className="text-sm text-muted-foreground">
          2.5% of zakatable wealth held for a lunar year, once it reaches Nisab. Consult a scholar for your specific situation.
        </p>
      </div>

      <div className="vault-card p-4 space-y-3">
        <h2 className="wallet-label">Nisab</h2>
        <div className="grid grid-cols-2 gap-2">
          <Select value={saved.basis} onValueChange={(v) => setSaved({ ...saved, basis: v as NisabBasis })}>
            <SelectTrigger aria-label="Nisab basis" className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="silver">Silver ({NISAB_GRAMS.silver} g / 52.5 tola)</SelectItem>
              <SelectItem value="gold">Gold ({NISAB_GRAMS.gold} g / 7.5 tola)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            aria-label="Price per gram (BDT)"
            placeholder={`Today's ${saved.basis} price per gram (৳)`}
            value={saved.price}
            onChange={(e) => setSaved({ ...saved, price: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
        <p className="text-xs text-muted-foreground">Nisab: {formatMoney(result.nisab)}</p>
      </div>

      <div className="vault-card p-4 space-y-2">
        <h2 className="wallet-label">Cash, MFS & bank (converted to BDT)</h2>
        {walletRows.map((w) => (
          <label key={w.id} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Checkbox
                checked={!excluded.has(w.id)}
                onCheckedChange={(v) =>
                  setExcluded((prev) => {
                    const next = new Set(prev);
                    if (v === true) next.delete(w.id);
                    else next.add(w.id);
                    return next;
                  })
                }
              />
              {w.name}
            </span>
            <span className="tabular-nums">{formatMoney(w.bdt)}</span>
          </label>
        ))}
        <Input
          type="number"
          aria-label="Other zakatable assets"
          placeholder="Other zakatable assets: gold/silver value, savings, stock (৳)"
          value={saved.other}
          onChange={(e) => setSaved({ ...saved, other: e.target.value })}
          className="bg-secondary border-border"
        />
      </div>

      <div className="vault-card p-4 space-y-2 text-sm">
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Checkbox checked={includeReceivables} onCheckedChange={(v) => setIncludeReceivables(v === true)} />
            Recoverable money you lent
          </span>
          <span className="tabular-nums">+{formatMoney(receivables)}</span>
        </label>
        <div className="flex items-center justify-between">
          <span>Short-term debts you owe</span>
          <span className="tabular-nums">-{formatMoney(payables)}</span>
        </div>
      </div>

      <div className={`vault-card p-5 ${result.eligible ? "border-primary/50" : ""}`}>
        <p className="text-sm text-muted-foreground">Net zakatable wealth: {formatMoney(result.netWealth)}</p>
        {!Number(saved.price) ? (
          <p className="mt-1 font-medium">Enter today's {saved.basis} price per gram to check Nisab.</p>
        ) : result.eligible ? (
          <p className="mt-1 text-2xl font-bold text-primary">Zakat due: {formatMoney(result.due)}</p>
        ) : (
          <p className="mt-1 font-medium">Below Nisab, so no Zakat is due.</p>
        )}
      </div>
    </div>
  );
}
