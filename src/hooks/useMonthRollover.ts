import { useEffect } from "react";
import { format, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { computeRolloverSnapshot, monthBounds } from "@/lib/finance";

// Recompute the previous month's snapshot once per app session (per user), so
// late entries, reversals or a previously wrong snapshot heal themselves.
const rolledOver = new Set<string>();

export function useMonthRollover() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const prevMonth = format(subMonths(new Date(), 1), "yyyy-MM");
    const key = `${user.id}:${prevMonth}`;
    if (rolledOver.has(key)) return;
    rolledOver.add(key);

    const run = async () => {
      const { data: wallets, error: walletError } = await supabase.from("wallets").select("id, balance");
      if (walletError) throw walletError;
      if (!wallets?.length) return;

      // Everything dated from the start of last month onward (this month and future-dated
      // entries too): today's balance already includes them, so they must be backed out.
      const { start } = monthBounds(prevMonth);
      const { data: txs, error: txError } = await supabase
        .from("transactions")
        .select("wallet_id, type, amount, is_reversed, date")
        .gte("date", start);
      if (txError) throw txError;

      const rows = wallets.map((w) => {
        const snap = computeRolloverSnapshot(
          Number(w.balance),
          (txs || []).filter((t) => t.wallet_id === w.id),
          prevMonth
        );
        return {
          user_id: user.id,
          wallet_id: w.id,
          month: prevMonth,
          opening_balance: snap.opening_balance,
          total_income: snap.total_income,
          total_expense: snap.total_expense,
        };
      });

      // One upsert for every wallet (the old code skipped all wallets once any snapshot existed).
      const { error: upsertError } = await supabase
        .from("monthly_snapshots")
        .upsert(rows, { onConflict: "user_id,wallet_id,month" });
      if (upsertError) throw upsertError;

      qc.invalidateQueries({ queryKey: ["monthly_snapshots"] });
    };

    run().catch((err) => {
      rolledOver.delete(key); // retry on the next Dashboard visit
      console.error("Month rollover failed:", err);
    });
  }, [user, qc]);
}
