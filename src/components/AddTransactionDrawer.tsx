import { useState, useEffect, useRef, useMemo } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction, useTransactions } from "@/hooks/useTransactions";
import { useCreateRecurring } from "@/hooks/useRecurringTransactions";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { format } from "date-fns";
import { Plus } from "lucide-react";

const PREBUILT_CATEGORIES = ["🍔 Food", "🏠 Home Rent", "🚌 Transport"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "income" | "expense";
  defaultDate?: string;
}

export default function AddTransactionDrawer({ open, onOpenChange, defaultType = "expense", defaultDate }: Props) {
  const { data: wallets } = useWallets();
  const { data: allTransactions } = useTransactions();
  const createTx = useCreateTransaction();
  const createRecurring = useCreateRecurring();
  const [type, setType] = useState<"income" | "expense">(defaultType);
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(defaultDate || format(new Date(), "yyyy-MM-dd"));
  const [recurring, setRecurring] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pastCategories = useMemo(() => {
    if (!allTransactions) return [];
    const unique = [...new Set(allTransactions.map((t: any) => t.category))];
    return unique.sort();
  }, [allTransactions]);

  const filteredCategories = useMemo(() => {
    if (!category) return pastCategories;
    return pastCategories.filter((c) => c.toLowerCase().includes(category.toLowerCase()));
  }, [pastCategories, category]);

  const filteredPrebuilt = useMemo(() => {
    if (!category) return PREBUILT_CATEGORIES;
    return PREBUILT_CATEGORIES.filter((c) => c.toLowerCase().includes(category.toLowerCase()));
  }, [category]);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setAmount("");
      setWalletId(wallets?.[0]?.id || "");
      setCategory("");
      setNote("");
      setDate(defaultDate || format(new Date(), "yyyy-MM-dd"));
      setRecurring(false);
      setCategoryDropdownOpen(false);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          categoryInputRef.current && !categoryInputRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={false}>
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
          <div className="space-y-2 relative">
            <Label>Category</Label>
            <Input
              ref={categoryInputRef}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCategoryDropdownOpen(true);
              }}
              onFocus={() => setCategoryDropdownOpen(true)}
              placeholder="Type or select a category..."
              className="bg-secondary border-border min-h-[44px]"
              autoComplete="off"
            />
            {categoryDropdownOpen && (
              <div
                ref={dropdownRef}
                className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
              >
                {filteredPrebuilt.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                      Suggestions
                    </div>
                    {filteredPrebuilt.map((c) => (
                      <button
                        key={`pb-${c}`}
                        type="button"
                        onClick={() => {
                          setCategory(c);
                          setCategoryDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors min-h-[44px] flex items-center"
                      >
                        {c}
                      </button>
                    ))}
                  </>
                )}
                {filteredCategories.length > 0 && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-t border-border">
                    Your Categories
                  </div>
                )}
                {filteredCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategory(c);
                      setCategoryDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors min-h-[44px] flex items-center"
                  >
                    {c}
                  </button>
                ))}
                {category.trim() &&
                  !pastCategories.includes(category.trim()) &&
                  !PREBUILT_CATEGORIES.includes(category.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted/50 transition-colors flex items-center gap-1 border-t border-border min-h-[44px]"
                  >
                    <Plus className="h-3 w-3" /> Add "{category.trim()}"
                  </button>
                )}
              </div>
            )}
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
