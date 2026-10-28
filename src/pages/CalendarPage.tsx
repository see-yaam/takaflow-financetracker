import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths } from "date-fns";
import { useTransactions, useReverseTransaction } from "@/hooks/useTransactions";
import { ChevronLeft, ChevronRight, Plus, Undo2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import AddTransactionDrawer from "@/components/AddTransactionDrawer";
import EditCategoryDialog from "@/components/EditCategoryDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);

  const month = format(currentDate, "yyyy-MM");
  const { data: transactions } = useTransactions({ month });
  const reverseMutation = useReverseTransaction();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  const txByDate = useMemo(() => {
    return (transactions || []).reduce((acc, t) => {
      const d = t.date;
      if (!acc[d]) acc[d] = [];
      acc[d].push(t);
      return acc;
    }, {} as Record<string, typeof transactions>);
  }, [transactions]);

  const dailyTotals = useMemo(() => {
    const totals: Record<string, { income: number; expense: number }> = {};
    for (const [date, txs] of Object.entries(txByDate)) {
      if (!txs) continue;
      let income = 0, expense = 0;
      for (const t of txs) {
        if ((t as any).is_reversed) continue;
        if (t.type === "income") income += Number(t.amount);
        else expense += Number(t.amount);
      }
      totals[date] = { income, expense };
    }
    return totals;
  }, [txByDate]);

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedTxs = selectedKey ? txByDate[selectedKey] || [] : [];

  const handleReverse = () => {
    if (!reverseTarget) return;
    reverseMutation.mutate(reverseTarget.id, {
      onSuccess: () => {
        toast.success("Transaction reversed");
        setReverseTarget(null);
      },
      onError: () => toast.error("Failed to reverse transaction"),
    });
  };

  const calendarGrid = (
    <div className="vault-card p-4">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPadding }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const totals = dailyTotals[key];
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          return (
            <button
              key={key}
              onClick={() => setSelectedDate(day)}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors p-0.5 min-h-[44px] md:max-h-16
                ${isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/50"}
              `}
            >
              <span className="text-xs font-medium">{day.getDate()}</span>
              {totals && (
                <div className="flex flex-col items-center leading-none mt-0.5">
                  {totals.income > 0 && (
                    <span className={`text-[8px] md:text-[9px] font-semibold tabular-nums ${isSelected ? "text-primary-foreground/80" : "text-primary"}`}>
                      +{totals.income >= 1000 ? `${(totals.income / 1000).toFixed(1)}k` : totals.income}
                    </span>
                  )}
                  {totals.expense > 0 && (
                    <span className={`text-[8px] md:text-[9px] font-semibold tabular-nums ${isSelected ? "text-primary-foreground/80" : "text-destructive"}`}>
                      -{totals.expense >= 1000 ? `${(totals.expense / 1000).toFixed(1)}k` : totals.expense}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const detailPanel = (
    <AnimatePresence mode="wait">
      {selectedDate && (
        <motion.div
          key={selectedKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="vault-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="wallet-label">{format(selectedDate, "EEEE, MMMM d")}</h3>
            <Button
              size="sm"
              onClick={() => setDrawerOpen(true)}
              className="bg-primary/15 text-primary hover:bg-primary/25 border-0 h-8 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>

          {selectedKey && dailyTotals[selectedKey] && (
            <div className="flex gap-4 mb-4 text-sm">
              {dailyTotals[selectedKey].income > 0 && (
                <span className="text-primary font-medium tabular-nums">
                  +৳{dailyTotals[selectedKey].income.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              )}
              {dailyTotals[selectedKey].expense > 0 && (
                <span className="text-destructive font-medium tabular-nums">
                  -৳{dailyTotals[selectedKey].expense.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}

          {selectedTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions on this date.</p>
          ) : (
            <div className="space-y-0">
              {selectedTxs.map((t: any) => {
                const isReversed = t.is_reversed;
                return (
                  <div key={t.id} className={`transaction-row ${isReversed ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${t.type === "income" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                        {t.type === "income" ? "+" : "-"}
                      </div>
                      <div>
                        <p className={`text-sm font-medium text-foreground ${isReversed ? "line-through" : ""}`}>
                          {t.category}
                          {isReversed && <span className="ml-2 text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded no-underline inline-block">Reversed</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.wallets?.name}{t.note ? ` · ${t.note}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium tabular-nums ${isReversed ? "line-through text-muted-foreground" : t.type === "income" ? "text-primary" : "text-destructive"}`}>
                        {t.type === "income" ? "+" : "-"}৳{Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                      {!isReversed && (
                        <button
                          onClick={() => setEditTarget(t)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit category"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!isReversed && (
                        <button
                          onClick={() => setReverseTarget(t)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Reverse"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-6">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="text-muted-foreground hover:text-foreground p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{format(currentDate, "MMMM yyyy")}</h2>
        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="text-muted-foreground hover:text-foreground p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop: two-column layout */}
      <div className="hidden md:grid md:grid-cols-[480px_1fr] gap-6">
        <div>{calendarGrid}</div>
        <div>{detailPanel}</div>
      </div>

      {/* Mobile: stacked layout */}
      <div className="md:hidden space-y-6">
        {calendarGrid}
        {detailPanel}
      </div>

      <AddTransactionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        defaultDate={selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined}
      />
      <EditCategoryDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        transactionId={editTarget?.id ?? null}
        currentCategory={editTarget?.category ?? ""}
      />

      {/* Reverse confirmation dialog */}
      <AlertDialog open={!!reverseTarget} onOpenChange={(open) => !open && setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will undo this transaction and restore your wallet balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReverse} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
