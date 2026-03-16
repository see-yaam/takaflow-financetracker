import { useEffect, useRef } from "react";
import { format, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export function useMonthRollover() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (!user || ran.current) return;
    ran.current = true;

    const run = async () => {
      const now = new Date();
      const prevMonth = format(subMonths(now, 1), "yyyy-MM");

      // Check if snapshots already exist for previous month
      const { data: existing } = await supabase
        .from("monthly_snapshots")
        .select("id")
        .eq("month", prevMonth)
        .limit(1);

      if (existing && existing.length > 0) return;

      // Get all wallets
      const { data: wallets } = await supabase.from("wallets").select("*");
      if (!wallets?.length) return;

      // Get previous month transactions
      const [y, m] = prevMonth.split("-");
      const start = `${y}-${m}-01`;
      const end = new Date(+y, +m, 0).toISOString().split("T")[0];

      const { data: txs } = await supabase
        .from("transactions")
        .select("*")
        .gte("date", start)
        .lte("date", end);

      for (const w of wallets) {
        const walletTxs = (txs || []).filter((t: any) => t.wallet_id === w.id);
        const totalIncome = walletTxs.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const totalExpense = walletTxs.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const openingBalance = Number(w.balance) - totalIncome + totalExpense;

        await supabase.from("monthly_snapshots").upsert(
          {
            user_id: user.id,
            wallet_id: w.id,
            month: prevMonth,
            opening_balance: openingBalance,
            total_income: totalIncome,
            total_expense: totalExpense,
          },
          { onConflict: "user_id,wallet_id,month" }
        );
      }

      qc.invalidateQueries({ queryKey: ["monthly_snapshots"] });
    };

    run().catch(console.error);
  }, [user, qc]);
}
