import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useCreateRecurring } from "@/hooks/useRecurringTransactions";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import CategoryPicker from "@/components/CategoryPicker";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "income" | "expense";
  defaultDate?: string;
}

export default function AddTransactionDrawer({ open, onOpenChange, defaultType = "expense", defaultDate }: Props) {
  const { data: wallets } = useWallets();
  const createTx = useCreateTransaction();
  const createRecurring = useCreateRecurring();
  const [type, setType] = useState<"income" | "expense">(defaultType);
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(defaultDate || format(new Date(), "yyyy-MM-dd"));
  const [recurring, setRecurring] = useState(false);


  useEffect(() => {
    if (open) {
      setType(defaultType);
      setAmount("");
      setWalletId(wallets?.[0]?.id || "");
      setCategory("");
      setNote("");
      setDate(defaultDate || format(new Date(), "yyyy-MM-dd"));
      setRecurring(false);
    }
  }, [open, defaultType, defaultDate, wallets]);

  const handleSubmit = async () => {
    if (!category.trim()) {
      toast.error("Please enter a category");
      return;
    }
    if (!amount || !walletId) {
      toast.error("Fill in required fields");
      return;
    }
    try {
      await createTx.mutateAsync({
        wallet_id: walletId,
        type,
        amount: parseFloat(amount),
        category: category.trim(),
        note: note || undefined,
        date,
      });

      if (recurring) {
        const dayOfMonth = new Date(date).getDate();
        await createRecurring.mutateAsync({
          wallet_id: walletId,
          type,
          amount: parseFloat(amount),
          category: category.trim(),
          note: note || undefined,
          day_of_month: dayOfMonth,
        });
        toast.success("Transaction committed & recurring set");
      } else {
        toast.success("Transaction committed");
      }

      onOpenChange(false);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const isSubmitting = createTx.isPending || createRecurring.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] w-[95vw] max-h-[92vh] overflow-y-auto p-5 sm:p-6 bg-card border-border shadow-2xl rounded-2xl gap-4">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{type === "income" ? "Add Income" : "Add Expense"}</span>
            <span
              className={cn(
                "text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border",
                type === "income"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-500 border-rose-500/20"
              )}
            >
              {type}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter transaction details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Type Toggle Tabs */}
          <div className="grid grid-cols-2 p-1 bg-secondary/70 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={cn(
                "py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5",
                type === "expense"
                  ? "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowDownRight className="h-3.5 w-3.5" /> Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={cn(
                "py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5",
                type === "income"
                  ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Income
            </button>
          </div>

          {/* Amount Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Amount (৳)</Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                ৳
              </span>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9 bg-secondary/60 border-border text-2xl h-12 sm:h-14 font-bold tabular-nums focus:ring-2 focus:ring-primary/20"
                step="0.01"
              />
            </div>
          </div>

          {/* 2-Column: Category & Wallet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Category</Label>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="bg-secondary/60 border-border h-10 text-xs">
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {wallets?.map((w) => (
                    <SelectItem key={w.id} value={w.id} className="text-xs">
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 2-Column: Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-secondary/60 border-border h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Details / merchant..."
                className="bg-secondary/60 border-border h-10 text-xs"
              />
            </div>
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 border border-border/40">
            <div>
              <p className="text-xs font-medium text-foreground">Repeat every month?</p>
              <p className="text-[11px] text-muted-foreground">Auto-adds on same day each month</p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 border-border text-foreground hover:bg-muted/50 text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={cn(
                "flex-[2] h-11 text-xs font-semibold shadow-md",
                type === "expense"
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              )}
            >
              {isSubmitting
                ? "Committing..."
                : type === "expense"
                ? "Add Expense"
                : "Add Income"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
