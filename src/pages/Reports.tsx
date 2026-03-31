import { useState, useMemo } from "react";
import { useTransactions } from "@/hooks/useTransactions";
import { useWallets } from "@/hooks/useWallets";
import { useMonthlySnapshots } from "@/hooks/useMonthlySnapshots";
import { format, subMonths, getDaysInMonth, parse } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { motion } from "framer-motion";
import AIInsights from "@/components/AIInsights";
import MoneyFlowChart from "@/components/MoneyFlowChart";

const CHART_COLORS = ["hsl(152,38%,52%)", "hsl(29,87%,67%)", "hsl(16,72%,61%)", "hsl(200,60%,50%)", "hsl(280,40%,60%)", "hsl(50,80%,55%)", "hsl(330,50%,55%)"];

export default function Reports() {
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(new Date(), i);
      return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
    });
  }, []);

  const [month, setMonth] = useState(months[0].value);
  const [filterWallet, setFilterWallet] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const { data: transactions } = useTransactions({ month, walletId: filterWallet === "all" ? undefined : filterWallet, category: filterCategory === "all" ? undefined : filterCategory });
  const { data: wallets } = useWallets();
  const { data: snapshots } = useMonthlySnapshots(month);

  // Previous month data for AI comparison
  const prevMonth = format(subMonths(parse(month, "yyyy-MM", new Date()), 1), "yyyy-MM");
  const { data: prevTx } = useTransactions({ month: prevMonth });

  const allTxRaw = useTransactions({ month }).data || [];
  const allTxForMonth = allTxRaw.filter((t: any) => !t.is_reversed);
  const totalIncome = allTxForMonth.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = allTxForMonth.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = totalIncome - totalExpense;
  const daysInMonth = getDaysInMonth(parse(month, "yyyy-MM", new Date()));
  const avgDaily = totalExpense / (daysInMonth || 1);
  const avgDailyIncome = totalIncome / (daysInMonth || 1);

  // Category data
  const expenseCategoryMap = useMemo(() => {
    const map: Record<string, number> = {};
    allTxForMonth.filter((t) => t.type === "expense").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount);
    });
    return map;
  }, [allTxForMonth]);

  const incomeCategoryMap = useMemo(() => {
    const map: Record<string, number> = {};
    allTxForMonth.filter((t) => t.type === "income").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount);
    });
    return map;
  }, [allTxForMonth]);

  // Daily bar chart data
  const dailyData = useMemo(() => {
    const map: Record<number, { income: number; expense: number }> = {};
    for (let d = 1; d <= daysInMonth; d++) map[d] = { income: 0, expense: 0 };
    allTxForMonth.forEach((t) => {
      const day = parseInt(t.date.split("-")[2], 10);
      if (map[day]) {
        if (t.type === "income") map[day].income += Number(t.amount);
        else map[day].expense += Number(t.amount);
      }
    });
    return Object.entries(map).map(([day, v]) => ({ day: +day, ...v }));
  }, [allTxForMonth, daysInMonth]);

  const categoryData = useMemo(() => {
    return Object.entries(expenseCategoryMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenseCategoryMap]);

  const categories = [...new Set(allTxForMonth.map((t) => t.category))];

  // Previous month summary for AI
  const prevMonthSummary = useMemo(() => {
    if (!prevTx?.length) return undefined;
    const activePrev = prevTx.filter((t: any) => !t.is_reversed);
    const prevCategories: Record<string, number> = {};
    activePrev.filter((t) => t.type === "expense").forEach((t) => {
      prevCategories[t.category] = (prevCategories[t.category] || 0) + Number(t.amount);
    });
    return {
      totalIncome: activePrev.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
      totalExpense: activePrev.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
      categories: prevCategories,
    };
  }, [prevTx]);

  // Wallet snapshots section
  const walletBreakdown = useMemo(() => {
    if (!snapshots?.length || !wallets?.length) return null;
    return snapshots.map((s: any) => {
      const w = wallets.find((w) => w.id === s.wallet_id);
      return {
        name: w?.name || "Unknown",
        openingBalance: Number(s.opening_balance),
        income: Number(s.total_income),
        expense: Number(s.total_expense),
        closingBalance: Number(s.opening_balance) + Number(s.total_income) - Number(s.total_expense),
      };
    });
  }, [snapshots, wallets]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Monthly Report</h2>

      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="w-48 bg-secondary border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border">
          {months.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Income", value: totalIncome, prefix: "+", color: "text-primary" },
          { label: "Total Expense", value: totalExpense, prefix: "-", color: "text-foreground" },
          { label: "Net Savings", value: net, prefix: net >= 0 ? "+" : "", color: net >= 0 ? "text-primary" : "text-destructive" },
          { label: "Avg Daily Spend", value: avgDaily, prefix: "", color: "text-muted-foreground" },
          { label: "Avg Daily Income", value: avgDailyIncome, prefix: "", color: "text-muted-foreground" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="vault-card p-4">
            <p className="wallet-label text-[10px] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>
              {s.prefix}৳{Math.abs(s.value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Wallet breakdown from snapshots */}
      {walletBreakdown && walletBreakdown.length > 0 && (
        <div className="vault-card p-5">
          <h3 className="wallet-label mb-4">Wallet Breakdown</h3>
          <div className="space-y-3">
            {walletBreakdown.map((wb) => (
              <div key={wb.name} className="p-3 rounded-xl bg-secondary/50 border border-border/30">
                <p className="text-sm font-medium text-foreground mb-2">{wb.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Opening</span>
                  <span className="tabular-nums text-right text-foreground">৳{wb.openingBalance.toLocaleString()}</span>
                  <span className="text-muted-foreground">+ Income</span>
                  <span className="tabular-nums text-right text-primary">+৳{wb.income.toLocaleString()}</span>
                  <span className="text-muted-foreground">- Expense</span>
                  <span className="tabular-nums text-right text-foreground">-৳{wb.expense.toLocaleString()}</span>
                  <span className="text-muted-foreground font-medium">= Closing</span>
                  <span className="tabular-nums text-right font-medium text-foreground">৳{wb.closingBalance.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bar chart */}
      <div className="vault-card p-5">
        <h3 className="wallet-label mb-4">Daily Income vs Expense</h3>
        <div className="h-64 overflow-x-auto">
          <ResponsiveContainer width="100%" height="100%" minWidth={500}>
            <BarChart data={dailyData}>
              <XAxis dataKey="day" tick={{ fill: "hsl(155,20%,60%)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "hsl(155,20%,60%)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(150,30%,12%)", border: "1px solid hsl(150,15%,20%)", borderRadius: "12px", color: "#fff" }} />
              <Bar dataKey="income" fill="hsl(152,38%,52%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="hsl(16,72%,61%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie chart */}
      {categoryData.length > 0 && (
        <div className="vault-card p-5">
          <h3 className="wallet-label mb-4">Expense by Category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12, color: "hsl(155,20%,60%)" }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(150,30%,12%)", border: "1px solid hsl(150,15%,20%)", borderRadius: "12px", color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Money Flow Chart */}
      {(Object.keys(incomeCategoryMap).length > 0 || Object.keys(expenseCategoryMap).length > 0) && (
        <MoneyFlowChart incomeByCategory={incomeCategoryMap} expenseByCategory={expenseCategoryMap} />
      )}

      {/* AI Insights */}
      {allTxForMonth.length > 0 && (
        <AIInsights
          summary={{
            totalIncome,
            totalExpense,
            net,
            categories: expenseCategoryMap,
            month,
          }}
          previousMonth={prevMonthSummary}
        />
      )}

      {/* Filtered transaction list */}
      <div className="vault-card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="wallet-label">Transactions</h3>
          <Select value={filterWallet} onValueChange={setFilterWallet}>
            <SelectTrigger className="w-32 bg-secondary border-border h-8 text-xs">
              <SelectValue placeholder="Wallet" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Wallets</SelectItem>
              {wallets?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-32 bg-secondary border-border h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!transactions?.length ? (
          <p className="text-sm text-muted-foreground">No transactions found.</p>
        ) : (
          <div className="space-y-0">
            {transactions.map((t: any) => (
              <div key={t.id} className="transaction-row">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.category}</p>
                  <p className="text-xs text-muted-foreground">{t.wallets?.name} · {format(new Date(t.date), "MMM d")}{t.note ? ` · ${t.note}` : ""}</p>
                </div>
                <span className={`text-sm font-medium tabular-nums ${t.type === "income" ? "text-primary" : "text-foreground"}`}>
                  {t.type === "income" ? "+" : "-"}৳{Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
