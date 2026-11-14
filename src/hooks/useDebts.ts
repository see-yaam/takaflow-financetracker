import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { debtAdditionSchema, debtCreateSchema, debtPaymentSchema } from "@/lib/validations";
import { requireOnline } from "@/lib/onlineOnly";

export function useDebts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["debts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debts")
        .select("*, wallets(name)")
        .order("created_at", { ascending: false });
      throwIfSupabaseError(error);
      return data;
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
        .from("debt_payments")
        .select("*")
        .eq("debt_id", debtId!)
        .order("date", { ascending: false });
      throwIfSupabaseError(error);
      return data;
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
        .from("debt_payments")
        .select("*")
        .order("date", { ascending: false });
      throwIfSupabaseError(error);
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (debt: {
      type: "borrowed" | "lent";
      person_name: string;
      amount: number;
      wallet_id: string;
      date: string;
      note?: string;
      affects_wallet?: boolean;
    }) => {
      const { affects_wallet = true, ...rest } = debt;
      const parsed = debtCreateSchema.parse(rest);
      requireOnline("Adding a debt");
      // One database transaction: the debt row and its wallet transaction land together or not at all.
      const { data, error } = await supabase.rpc("create_debt", {
        p_type: parsed.type,
        p_person_name: parsed.person_name,
        p_amount: parsed.amount,
        p_wallet: parsed.wallet_id,
        p_date: parsed.date,
        p_note: parsed.note || undefined,
        p_affects_wallet: affects_wallet,
      });
      throwIfSupabaseError(error);
      return { id: data };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["debt_payments"] });
      qc.invalidateQueries({ queryKey: ["debt_payments_all"] });
      qc.invalidateQueries({ queryKey: ["debt_additions_all"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useAddDebtPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      debtId: string;
      amount: number;
      date: string;
      note?: string;
      debtType: "borrowed" | "lent";
      walletId: string;
      personName: string;
      currentRemaining: number;
    }) => {
      const parsed = debtPaymentSchema.parse(input);
      requireOnline("Recording a debt payment");
      // Payment row, remaining amount / settled flag and wallet transaction in one step;
      // the server computes the remaining amount from the locked row (no stale-cache overwrite).
      const { data, error } = await supabase.rpc("record_debt_payment", {
        p_debt: parsed.debtId,
        p_wallet: parsed.walletId,
        p_amount: parsed.amount,
        p_date: parsed.date,
        p_note: parsed.note || undefined,
      });
      throwIfSupabaseError(error);
      return data as { remaining_amount: number; settled: boolean; extra: number } | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["debt_payments"] });
      qc.invalidateQueries({ queryKey: ["debt_payments_all"] });
      qc.invalidateQueries({ queryKey: ["debt_additions_all"] });
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
        .from("debt_additions")
        .select("*")
        .order("date", { ascending: false });
      throwIfSupabaseError(error);
      return data;
    },
    enabled: !!user,
  });
}

export function useAddDebtAddition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      debtId: string;
      amount: number;
      date: string;
      note?: string;
      walletId: string;
      debtType: "borrowed" | "lent";
      personName: string;
    }) => {
      const parsed = debtAdditionSchema.parse(input);
      requireOnline("Adding to a debt");
      // debt_additions row (the trigger grows the debt) + wallet transaction in one step.
      const { error } = await supabase.rpc("add_to_debt", {
        p_debt: parsed.debtId,
        p_amount: parsed.amount,
        p_wallet: parsed.walletId,
        p_date: parsed.date,
        p_note: parsed.note || undefined,
      });
      throwIfSupabaseError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["debt_payments"] });
      qc.invalidateQueries({ queryKey: ["debt_payments_all"] });
      qc.invalidateQueries({ queryKey: ["debt_additions_all"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
