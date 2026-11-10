import { useEffect, useMemo, useState } from "react";
import { useWallets } from "@/hooks/useWallets";
import { useTransferFunds } from "@/hooks/useTransfers";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { transferSchema } from "@/lib/validations";
import { convertAmount } from "@/lib/fx";
import { formatMoney } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowRightLeft, WifiOff } from "lucide-react";

export default function SettingsTransferSection() {
  const { data: wallets } = useWallets();
  const { data: rates } = useCurrencyRates();
  const transfer = useTransferFunds();
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [convertedInput, setConvertedInput] = useState("");
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const fromWallet = wallets?.find((w) => w.id === transferFrom);
  const toWallet = wallets?.find((w) => w.id === transferTo);
  const fromCur = fromWallet?.currency || "BDT";
  const toCur = toWallet?.currency || "BDT";
  const crossCurrency = !!fromWallet && !!toWallet && fromCur !== toCur;
  const amountNum = parseFloat(transferAmount);
  const suggested = useMemo(
    () => (crossCurrency && amountNum > 0 ? convertAmount(amountNum, fromCur, toCur, rates) : null),
    [crossCurrency, amountNum, fromCur, toCur, rates]
  );

  // Prefill the credited amount from the live rate whenever inputs change; the user can edit it.
  useEffect(() => {
    setConvertedInput(suggested != null ? String(suggested) : "");
  }, [suggested]);

  const handleTransfer = async () => {
    try {
      const parsed = transferSchema.parse({
        fromWalletId: transferFrom,
        toWalletId: transferTo,
        amount: amountNum,
      });

      if (fromWallet && Number(fromWallet.balance) < parsed.amount) {
        toast.error("Insufficient balance");
        return;
      }
      const converted = crossCurrency ? parseFloat(convertedInput) : undefined;
      if (crossCurrency && !(converted && converted > 0)) {
        toast.error(`Enter how much ${toCur} the ${toWallet?.name} wallet receives`);
        return;
      }

      await transfer.mutateAsync({
        fromWalletId: parsed.fromWalletId,
        toWalletId: parsed.toWalletId,
        amount: parsed.amount,
        convertedAmount: converted,
      });
      toast.success(
        crossCurrency
          ? `Transferred ${formatMoney(parsed.amount, fromCur)} → ${formatMoney(converted as number, toCur)}`
          : "Transfer completed"
      );
      setTransferAmount("");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4 flex items-center gap-2">
        <ArrowRightLeft className="h-3 w-3" /> Transfer Between Wallets
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select value={transferFrom} onValueChange={setTransferFrom}>
          <SelectTrigger className="bg-secondary border-border">
            <SelectValue placeholder="From" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {wallets?.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} ({w.currency || "BDT"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={transferTo} onValueChange={setTransferTo}>
          <SelectTrigger className="bg-secondary border-border">
            <SelectValue placeholder="To" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {wallets?.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} ({w.currency || "BDT"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          value={transferAmount}
          onChange={(e) => setTransferAmount(e.target.value)}
          placeholder={`Amount (${fromCur})`}
          aria-label="Transfer amount"
          className="bg-secondary border-border"
        />
      </div>

      {crossCurrency && (
        <div className="mt-3 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="transfer-converted">
            {toWallet?.name} receives ({toCur}){suggested != null ? " — prefilled from today's rate, edit if your rate differs" : ""}
          </label>
          <Input
            id="transfer-converted"
            type="number"
            value={convertedInput}
            onChange={(e) => setConvertedInput(e.target.value)}
            placeholder={`Amount in ${toCur}`}
            className="bg-secondary border-border"
          />
        </div>
      )}

      {!online && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-500">
          <WifiOff className="h-3.5 w-3.5" /> Transfers need a connection so both wallets update together.
        </p>
      )}

      <Button
        onClick={handleTransfer}
        disabled={transfer.isPending || !online}
        className="mt-3 bg-primary text-primary-foreground"
      >
        {transfer.isPending ? "Transferring..." : "Execute Transfer"}
      </Button>
    </div>
  );
}
