import { useState, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
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
import CategoryPicker from "@/components/CategoryPicker";

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
  }, [open]);

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
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={false} repositionInputs={false}>
      <DrawerContent className="bg-card border-border max-h-[80vh] md:max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="text-foreground tracking-tight">Add Transaction</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Type toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => setType("income")}
              className={`flex-1 min-h-[44px] ${type === "income" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              Income
            </Button>
            <Button
              type="button"
              onClick={() => setType("expense")}
              className={`flex-1 min-h-[44px] ${type === "expense" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              Expense
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="bg-secondary border-border text-2xl h-14 font-bold tabular-nums"
              step="0.01"
            />
          </div>

          <div className="space-y-2">
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger className="bg-secondary border-border min-h-[44px]">
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {wallets?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category with autocomplete */}
          <div className="space-y-2">
            <Label>Category</Label>
            <CategoryPicker value={category} onChange={setCategory} />
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-secondary border-border min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Transaction details..."
              className="bg-secondary border-border min-h-[44px]"
            />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border/30 min-h-[44px]">
            <div>
              <p className="text-sm font-medium text-foreground">Repeat every month?</p>
              <p className="text-xs text-muted-foreground">Auto-adds on same day each month</p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full min-h-[52px] bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSubmitting ? "Committing..." : "Commit Transaction"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto min-h-[52px] border-border text-foreground hover:bg-muted/50"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
