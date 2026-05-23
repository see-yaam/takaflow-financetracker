import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { debtAdditionSchema, debtCreateSchema, debtPaymentSchema } from "@/lib/validations";

export function useDebts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["debts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debts" as any)
        .select("*, wallets(name)")
        .order("created_at", { ascending: false });
      throwIfSupabaseError(error);
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
      throwIfSupabaseError(error);
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
      throwIfSupabaseError(error);
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
      const parsed = debtCreateSchema.parse(debt);
      const { data, error } = await supabase
        .from("debts" as any)
        .insert({
          ...parsed,
          remaining_amount: parsed.amount,
          user_id: user!.id,
        })
        .select()
        .single();
      throwIfSupabaseError(error);

      const txType = parsed.type === "borrowed" ? "income" : "expense";
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user!.id,
        wallet_id: parsed.wallet_id,
        type: txType,
        amount: parsed.amount,
        category: parsed.type === "borrowed" ? "Debt Borrowed" : "Debt Lent",
        note: `${parsed.type === "borrowed" ? "Borrowed from" : "Lent to"} ${parsed.person_name}`,
        date: parsed.date,
      });
      throwIfSupabaseError(txErr);

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
      const parsed = debtPaymentSchema.parse({
        debtId,
        amount,
        date,
        note,
        debtType,
        walletId,
        personName,
        currentRemaining,
      });

      const { error: payErr } = await supabase.from("debt_payments" as any).insert({
        debt_id: parsed.debtId,
        user_id: user!.id,
        amount: parsed.amount,
        date: parsed.date,
        note: parsed.note || null,
      });
      throwIfSupabaseError(payErr);

      const newRemaining = parsed.currentRemaining - parsed.amount;
      const updates: any = { remaining_amount: newRemaining };
      if (newRemaining <= 0) updates.settled = true;

      const { error: upErr } = await supabase.from("debts" as any).update(updates).eq("id", parsed.debtId);
      throwIfSupabaseError(upErr);

      const txType = parsed.debtType === "borrowed" ? "expense" : "income";
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user!.id,
        wallet_id: parsed.walletId,
        type: txType,
        amount: parsed.amount,
        category: parsed.debtType === "borrowed" ? "Debt Repayment" : "Debt Recovery",
        note: `${parsed.debtType === "borrowed" ? "Repaid to" : "Recovered from"} ${parsed.personName}`,
        date: parsed.date,
      });
      throwIfSupabaseError(txErr);
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

export function useAllDebtAdditions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["debt_additions_all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_additions" as any)
        .select("*")
        .order("date", { ascending: false });
      throwIfSupabaseError(error);
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useAddDebtAddition() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      debtId,
      amount,
      date,
      note,
      walletId,
      debtType,
      personName,
    }: {
      debtId: string;
      amount: number;
      date: string;
      note?: string;
      walletId: string;
      debtType: "borrowed" | "lent";
      personName: string;
    }) => {
      const parsed = debtAdditionSchema.parse({
        debtId,
        amount,
        date,
        note,
        walletId,
        debtType,
        personName,
      });

      const { error } = await supabase.from("debt_additions" as any).insert({
        debt_id: parsed.debtId,
        user_id: user!.id,
        amount: parsed.amount,
        date: parsed.date,
        note: parsed.note || null,
        wallet_id: parsed.walletId,
      });
      throwIfSupabaseError(error);

      const txType = parsed.debtType === "borrowed" ? "income" : "expense";
      const category =
        parsed.debtType === "borrowed" ? `Borrowed - ${parsed.personName}` : `Lent - ${parsed.personName}`;
      const txNote =
        parsed.note ||
        `${parsed.debtType === "borrowed" ? "Additional borrowed from" : "Additional lent to"} ${parsed.personName}`;
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user!.id,
        wallet_id: parsed.walletId,
        type: txType,
        amount: parsed.amount,
        category,
        note: txNote,
        date: parsed.date,
      });
      throwIfSupabaseError(txErr);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["debt_additions_all"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
