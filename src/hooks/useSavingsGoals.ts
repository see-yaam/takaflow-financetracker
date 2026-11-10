import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { requireOnline } from "@/lib/onlineOnly";
import { savingsGoalCreateSchema } from "@/lib/validations";

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
    mutationFn: async (goal: {
      title: string;
      target_amount: number;
      deadline?: string;
      emoji?: string;
      opening_balance?: number;
      has_opening_balance?: boolean;
    }) => {
      const parsed = savingsGoalCreateSchema.parse({
        title: goal.title,
        target_amount: goal.target_amount,
        deadline: goal.deadline,
        emoji: goal.emoji,
      });
      const opening = goal.has_opening_balance ? Number(goal.opening_balance || 0) : 0;
      const insertPayload: any = {
        ...parsed,
        user_id: user!.id,
        has_opening_balance: !!goal.has_opening_balance,
        opening_balance: opening,
        saved_amount: opening,
      };
      const { data, error } = await supabase
        .from("savings_goals")
        .insert(insertPayload)
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
    mutationFn: async ({
      goalId,
      amount,
      walletId,
      userId,
      deductFromWallet = true,
    }: {
      goalId: string;
      amount: number;
      walletId?: string;
      userId: string;
      deductFromWallet?: boolean;
    }) => {
      if (!amount || amount <= 0) throw new Error("Amount must be greater than zero");
      if (deductFromWallet && !walletId) throw new Error("Please select a wallet");
      requireOnline("Adding to a savings goal");
      // Atomic: optional wallet debit + saved_amount increment + completion flag, computed on the
      // locked row (no read-modify-write race, no wallet debited without goal credit).
      const { data, error } = await supabase.rpc("contribute_savings_goal", {
        p_goal: goalId,
        p_amount: amount,
        p_wallet: deductFromWallet ? walletId : undefined,
        p_date: new Date().toLocaleDateString("en-CA"),
      });
      throwIfSupabaseError(error);
      return data as { saved_amount: number; completed: boolean } | null;
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
