import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@/hooks/useWallets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { transferSchema } from "@/lib/validations";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

export default function SettingsTransferSection() {
  const { data: wallets } = useWallets();
  const qc = useQueryClient();
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferring, setTransferring] = useState(false);

  const handleTransfer = async () => {
    const amt = parseFloat(transferAmount);
    try {
      const parsed = transferSchema.parse({
        fromWalletId: transferFrom,
        toWalletId: transferTo,
        amount: amt,
      });

      const fromWallet = wallets?.find((w) => w.id === parsed.fromWalletId);
      if (fromWallet && Number(fromWallet.balance) < parsed.amount) {
        toast.error("Insufficient balance");
        return;
      }

      setTransferring(true);
      const toWallet = wallets?.find((w) => w.id === parsed.toWalletId);
      const newFromBal = Number(fromWallet?.balance || 0) - parsed.amount;
      const newToBal = Number(toWallet?.balance || 0) + parsed.amount;

      const { error: e1 } = await supabase
        .from("wallets")
        .update({ balance: newFromBal })
        .eq("id", parsed.fromWalletId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("wallets")
        .update({ balance: newToBal })
        .eq("id", parsed.toWalletId);
      if (e2) throw e2;

      toast.success("Transfer completed");
      setTransferAmount("");
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (e) {
      toast.error(mapSupabaseError(e));
    } finally {
      setTransferring(false);
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
                {w.name}
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
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          value={transferAmount}
          onChange={(e) => setTransferAmount(e.target.value)}
          placeholder="Amount"
          className="bg-secondary border-border"
        />
      </div>
      <Button
        onClick={handleTransfer}
        disabled={transferring}
        className="mt-3 bg-primary text-primary-foreground"
      >
        {transferring ? "Transferring..." : "Execute Transfer"}
      </Button>
    </div>
  );
}
