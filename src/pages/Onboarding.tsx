import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateWallet } from "@/hooks/useWallets";
import { CURRENCIES } from "@/hooks/useCurrencyRates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Smartphone, Landmark, Wallet } from "lucide-react";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { onboardingWalletSchema } from "@/lib/validations";
import { motion } from "framer-motion";

const presets = [
  { name: "BKash", icon: "smartphone" },
  { name: "Bank", icon: "bank" },
  { name: "Pocket", icon: "wallet" },
];

const iconMap: Record<string, React.ElementType> = {
  smartphone: Smartphone,
  bank: Landmark,
  wallet: Wallet,
};

interface WalletEntry {
  name: string;
  balance: string;
  icon: string;
  currency: string;
}

export default function Onboarding() {
  const [wallets, setWallets] = useState<WalletEntry[]>(
    presets.map((p) => ({ name: p.name, balance: "0", icon: p.icon, currency: "BDT" }))
  );
  const createWallet = useCreateWallet();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const addWallet = () => {
    setWallets([...wallets, { name: "", balance: "0", icon: "wallet", currency: "BDT" }]);
  };

  const removeWallet = (i: number) => {
    setWallets(wallets.filter((_, idx) => idx !== i));
  };

  const updateWallet = (i: number, field: keyof WalletEntry, value: string) => {
    const updated = [...wallets];
    updated[i] = { ...updated[i], [field]: value };
    setWallets(updated);
  };

  const handleSubmit = async () => {
    const valid = wallets.filter((w) => w.name.trim());
    if (!valid.length) {
      toast.error("Add at least one wallet");
      return;
    }
    setSaving(true);
    try {
      for (const w of valid) {
        const parsed = onboardingWalletSchema.parse({
          name: w.name.trim(),
          balance: parseFloat(w.balance) || 0,
          icon: w.icon,
          currency: w.currency,
        }) as { name: string; balance: number; icon: string; currency: string };
        await createWallet.mutateAsync(parsed);
      }
      toast.success("Wallets initialized!");
      navigate("/");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
    setSaving(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden p-4">
      <div className="currency-watermark top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg] animate-pulse-gold">৳</div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="vault-card p-5 sm:p-8 w-full max-w-lg relative z-10"
      >
        <h1 className="text-xl sm:text-2xl font-bold tracking-tighter text-foreground mb-1.5 sm:mb-2">Initialize Your Wallets</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mb-5 sm:mb-6">Set up your wallets to start tracking your finances.</p>

        <div className="space-y-4">
          {wallets.map((w, i) => {
            const Icon = iconMap[w.icon] || Wallet;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-3.5 rounded-xl bg-secondary/50 border border-border/30 space-y-2.5 sm:space-y-0 sm:flex sm:items-end sm:gap-3"
              >
                <div className="flex items-center justify-between sm:hidden pb-1 border-b border-border/20">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-accent shrink-0" />
                    <span className="text-xs font-semibold text-foreground">Wallet #{i + 1}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWallet(i)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Remove wallet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="hidden sm:block">
                  <Icon className="h-5 w-5 text-accent mb-2 shrink-0" />
                </div>

                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={w.name}
                    onChange={(e) => updateWallet(i, "name", e.target.value)}
                    placeholder="Wallet name (e.g. bKash)"
                    className="bg-background border-border h-9"
                  />
                </div>

                <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-3">
                  <div className="w-full sm:w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">Balance</Label>
                    <Input
                      type="number"
                      value={w.balance}
                      onChange={(e) => updateWallet(i, "balance", e.target.value)}
                      placeholder="0.00"
                      className="bg-background border-border h-9"
                    />
                  </div>
                  <div className="w-full sm:w-20 space-y-1">
                    <Label className="text-xs text-muted-foreground">Currency</Label>
                    <Select value={w.currency} onValueChange={(v) => updateWallet(i, "currency", v)}>
                      <SelectTrigger className="bg-background border-border h-9"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWallet(i)}
                    className="hidden sm:block text-muted-foreground hover:text-destructive mb-2 p-1"
                    title="Remove wallet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        <button
          onClick={addWallet}
          className="flex items-center gap-2 text-sm text-primary mt-4 hover:underline"
        >
          <Plus className="h-4 w-4" /> Add custom wallet
        </button>

        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full mt-8 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saving ? "Initializing..." : "Initialize Wallets"}
        </Button>
      </motion.div>
    </div>
  );
}
