import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths } from "date-fns";
import { useTransactions } from "@/hooks/useTransactions";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import AddTransactionDrawer from "@/components/AddTransactionDrawer";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const month = format(currentDate, "yyyy-MM");
  const { data: transactions } = useTransactions({ month });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  const txByDate = (transactions || []).reduce((acc, t) => {
    const d = t.date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(t);
    return acc;
  }, {} as Record<string, typeof transactions>);

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedTxs = selectedKey ? txByDate[selectedKey] || [] : [];

  return (
    <div className="space-y-6">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="text-muted-foreground hover:text-foreground p-2">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{format(currentDate, "MMMM yyyy")}</h2>
        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="text-muted-foreground hover:text-foreground p-2">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar grid */}
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
            const hasTx = !!txByDate[key]?.length;
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            return (
              <button
                key={key}
                onClick={() => setSelectedDate(day)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors
                  ${isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/50"}
                `}
              >
                {day.getDate()}
                {hasTx && (
                  <div className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-accent"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail */}
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
            {selectedTxs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions on this date.</p>
            ) : (
              <div className="space-y-0">
                {selectedTxs.map((t: any) => (
                  <div key={t.id} className="transaction-row">
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.category}</p>
                      <p className="text-xs text-muted-foreground">{t.note || t.wallets?.name}</p>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${t.type === "income" ? "text-primary" : "text-foreground"}`}>
                      {t.type === "income" ? "+" : "-"}৳{Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AddTransactionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        defaultDate={selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined}
      />
    </div>
  );
}
