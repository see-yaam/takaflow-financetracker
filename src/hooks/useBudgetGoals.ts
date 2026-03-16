import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export function useBudgetGoal(month?: string) {
  const { user } = useAuth();
  const m = month || format(new Date(), "yyyy-MM");
  return useQuery({
    queryKey: ["budget_goal", user?.id, m],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_goals")
        .select("*")
        .eq("month", m)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useUpsertBudgetGoal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ month, monthly_budget }: { month: string; monthly_budget: number }) => {
      const { data, error } = await supabase
        .from("budget_goals")
        .upsert({ user_id: user!.id, month, monthly_budget }, { onConflict: "user_id,month" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget_goal"] }),
  });
}
