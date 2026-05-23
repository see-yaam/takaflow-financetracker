import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { savingsGoalContributionSchema, savingsGoalCreateSchema } from "@/lib/validations";

export function useSavingsGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["savings_goals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("*")
        .order("created_at", { ascending: false });
      throwIfSupabaseError(error);
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (goal: { title: string; target_amount: number; deadline?: string; emoji?: string }) => {
      const parsed = savingsGoalCreateSchema.parse(goal);
      const { data, error } = await supabase
        .from("savings_goals")
        .insert({ ...parsed, user_id: user!.id })
        .select()
        .single();
      throwIfSupabaseError(error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings_goals"] }),
  });
}

export function useAddToGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goalId, amount, walletId, userId }: { goalId: string; amount: number; walletId: string; userId: string }) => {
      const parsed = savingsGoalContributionSchema.parse({ goalId, amount, walletId, userId });

      const { error: txError } = await supabase.from("transactions").insert({
        user_id: parsed.userId,
        wallet_id: parsed.walletId,
        type: "expense",
        amount: parsed.amount,
        category: "Savings Goal",
        note: "Savings goal contribution",
        date: new Date().toLocaleDateString("en-CA"),
      });
      throwIfSupabaseError(txError);

      const { data: goal, error: getErr } = await supabase
        .from("savings_goals")
        .select("saved_amount, target_amount")
        .eq("id", parsed.goalId)
        .single();
      throwIfSupabaseError(getErr);

      const newSaved = Number(goal.saved_amount) + parsed.amount;
      const completed = newSaved >= Number(goal.target_amount);

      const { error: upErr } = await supabase
        .from("savings_goals")
        .update({ saved_amount: newSaved, completed })
        .eq("id", parsed.goalId);
      throwIfSupabaseError(upErr);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["savings_goals"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("savings_goals").delete().eq("id", id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings_goals"] }),
  });
}
