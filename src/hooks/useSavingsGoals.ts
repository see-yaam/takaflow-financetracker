import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useSavingsGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["savings_goals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("savings_goals")
        .insert({ ...goal, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings_goals"] }),
  });
}

export function useAddToGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goalId, amount, walletId, userId }: { goalId: string; amount: number; walletId: string; userId: string }) => {
      // Deduct from wallet via a transfer-like transaction
      const { error: txError } = await supabase.from("transactions").insert({
        user_id: userId,
        wallet_id: walletId,
        type: "expense",
        amount,
        category: "Savings Goal",
        note: "Savings goal contribution",
        date: new Date().toISOString().split("T")[0],
      });
      if (txError) throw txError;

      // Get current saved amount
      const { data: goal, error: getErr } = await supabase
        .from("savings_goals")
        .select("saved_amount, target_amount")
        .eq("id", goalId)
        .single();
      if (getErr) throw getErr;

      const newSaved = Number(goal.saved_amount) + amount;
      const completed = newSaved >= Number(goal.target_amount);

      const { error: upErr } = await supabase
        .from("savings_goals")
        .update({ saved_amount: newSaved, completed })
        .eq("id", goalId);
      if (upErr) throw upErr;
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
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings_goals"] }),
  });
}
