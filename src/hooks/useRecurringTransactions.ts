import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { recurringCreateSchema } from "@/lib/validations";

export function useRecurringTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recurring_transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .select("*, wallets(name)")
        .order("day_of_month", { ascending: true });
      throwIfSupabaseError(error);
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: { wallet_id: string; type: string; amount: number; category: string; note?: string; day_of_month: number }) => {
      const parsed = recurringCreateSchema.parse(r);
      const { data, error } = await supabase
        .from("recurring_transactions")
        .insert({ ...parsed, user_id: user!.id })
        .select()
        .single();
      throwIfSupabaseError(error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_transactions"] }),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_transactions"] }),
  });
}

export function useApplyRecurring() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const today = new Date();
      const dayOfMonth = today.getDate();
      const currentMonth = format(today, "yyyy-MM");

      const { data: recurrings, error: fetchError } = await supabase
        .from("recurring_transactions")
        .select("*")
        .eq("day_of_month", dayOfMonth);
      throwIfSupabaseError(fetchError);

      if (!recurrings?.length) return;

      for (const r of recurrings) {
        if (r.last_applied_month === currentMonth) continue;

        const { error: insertError } = await supabase.from("transactions").insert({
          user_id: user.id,
          wallet_id: r.wallet_id,
          type: r.type,
          amount: r.amount,
          category: r.category,
          note: r.note ? `${r.note} (recurring)` : "Recurring transaction",
          date: format(today, "yyyy-MM-dd"),
        });
        throwIfSupabaseError(insertError);

        const { error: updateError } = await supabase
          .from("recurring_transactions")
          .update({ last_applied_month: currentMonth })
          .eq("id", r.id);
        throwIfSupabaseError(updateError);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["recurring_transactions"] });
    },
  });
}
