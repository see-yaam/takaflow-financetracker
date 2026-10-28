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
import { Sparkles, ClipboardPaste } from "lucide-react";
import { parseBangladeshFinancialSms } from "@/lib/smsParser";
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
  const [smsInput, setSmsInput] = useState("");
  const [showSmsBox, setShowSmsBox] = useState(false);

  const handleParseSms = (textToParse?: string) => {
    const text = (textToParse ?? smsInput).trim();
    if (!text) {
      toast.error("Please paste an SMS text first");
      return;
    }
    const parsed = parseBangladeshFinancialSms(text);
    if (!parsed) {
      toast.error("Could not find financial transaction details in this SMS");
      return;
    }
    setType(parsed.type);
    setAmount(parsed.amount.toString());
    if (wallets && wallets.length > 0) {
      const matched =
        wallets.find((w) => w.name.toLowerCase().includes(parsed.source.toLowerCase())) ||
        wallets.find((w) => parsed.source.toLowerCase().includes(w.name.toLowerCase()));
      if (matched) {
        setWalletId(matched.id);
      }
    }
    if (parsed.categorySuggestion) {
      setCategory(parsed.categorySuggestion);
    }
    const autoNote = `${parsed.source} ${parsed.merchantOrParty ? `(${parsed.merchantOrParty})` : ""} ${parsed.trxId ? `Trx: ${parsed.trxId}` : ""}`.trim();
    setNote(autoNote);
    setShowSmsBox(false);
    setSmsInput("");
    toast.success(`⚡ Parsed ${parsed.source}: ৳${parsed.amount.toLocaleString()} (${parsed.type})`);
  };

  const handleClipboardPaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          handleParseSms(clipText);
          return;
        }
      }
      setShowSmsBox((prev) => !prev);
    } catch {
      setShowSmsBox((prev) => !prev);
    }
  };

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
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={false} repositionInputs={false}>
      <DrawerContent className="bg-card border-border max-h-[80vh] md:max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="text-foreground tracking-tight">Add Transaction</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Quick SMS Auto-Fill Banner */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Auto-fill from bKash, Nagad or Bank SMS
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClipboardPaste}
                className="h-7 text-xs px-2 text-primary hover:bg-primary/10 gap-1"
              >
                <ClipboardPaste className="h-3 w-3" />
                {showSmsBox ? "Close" : "Paste SMS"}
              </Button>
            </div>

            {showSmsBox && (
              <div className="space-y-2 pt-1">
                <textarea
                  value={smsInput}
                  onChange={(e) => setSmsInput(e.target.value)}
                  placeholder="Paste SMS here (e.g. Payment of Tk 120.00 to Shawarma House successful...)"
                  className="w-full bg-secondary/80 border border-border rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary h-20 resize-none font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleParseSms()}
                  className="w-full h-8 text-xs bg-primary text-primary-foreground font-medium"
                >
                  ⚡ Parse & Auto-fill Fields
                </Button>
              </div>
            )}
          </div>

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

          {/* Category with CategoryPicker */}
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
