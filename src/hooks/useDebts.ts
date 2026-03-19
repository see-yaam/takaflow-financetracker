import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useDebts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["debts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debts" as any)
        .select("*, wallets(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useDebtPayments(debtId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["debt_payments", debtId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_payments" as any)
        .select("*")
        .eq("debt_id", debtId!)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user && !!debtId,
  });
}

export function useAllDebtPayments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["debt_payments_all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_payments" as any)
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useCreateDebt() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (debt: {
      type: "borrowed" | "lent";
      person_name: string;
      amount: number;
      wallet_id: string;
      date: string;
      note?: string;
    }) => {
      // Create debt record
      const { data, error } = await supabase
        .from("debts" as any)
        .insert({
          ...debt,
          remaining_amount: debt.amount,
          user_id: user!.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Update wallet balance: borrowed → increase, lent → decrease
      // We do this via a transaction record so the trigger handles it
      const txType = debt.type === "borrowed" ? "income" : "expense";
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user!.id,
        wallet_id: debt.wallet_id,
        type: txType,
        amount: debt.amount,
        category: debt.type === "borrowed" ? "Debt Borrowed" : "Debt Lent",
        note: `${debt.type === "borrowed" ? "Borrowed from" : "Lent to"} ${debt.person_name}`,
        date: debt.date,
      });
      if (txErr) throw txErr;

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useAddDebtPayment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      debtId,
      amount,
      date,
      note,
      debtType,
      walletId,
      personName,
      currentRemaining,
    }: {
      debtId: string;
      amount: number;
      date: string;
      note?: string;
      debtType: "borrowed" | "lent";
      walletId: string;
      personName: string;
      currentRemaining: number;
    }) => {
      // Insert payment record
      const { error: payErr } = await supabase
        .from("debt_payments" as any)
        .insert({
          debt_id: debtId,
          user_id: user!.id,
          amount,
          date,
          note: note || null,
        });
      if (payErr) throw payErr;

      // Update remaining amount
      const newRemaining = currentRemaining - amount;
      const updates: any = { remaining_amount: newRemaining };
      if (newRemaining <= 0) updates.settled = true;

      const { error: upErr } = await supabase
        .from("debts" as any)
        .update(updates)
        .eq("id", debtId);
      if (upErr) throw upErr;

      // Update wallet: borrowed repayment → expense, lent recovery → income
      const txType = debtType === "borrowed" ? "expense" : "income";
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user!.id,
        wallet_id: walletId,
        type: txType,
        amount,
        category: debtType === "borrowed" ? "Debt Repayment" : "Debt Recovery",
        note: `${debtType === "borrowed" ? "Repaid to" : "Recovered from"} ${personName}`,
        date,
      });
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["debt_payments"] });
      qc.invalidateQueries({ queryKey: ["debt_payments_all"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
