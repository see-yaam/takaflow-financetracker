import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { budgetGoalSchema } from "@/lib/validations";
import { handleOfflineUpsertBudget, isNetworkError } from "@/lib/offlineSync";

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
      throwIfSupabaseError(error);
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
      const parsed = budgetGoalSchema.parse({ month, monthly_budget });
      const row = { user_id: user!.id, month: parsed.month, monthly_budget: parsed.monthly_budget };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        handleOfflineUpsertBudget(row, qc);
        return { ...row, _isOfflinePending: true };
      }
      try {
        const { data, error } = await supabase.from("budget_goals").upsert(row, { onConflict: "user_id,month" }).select().single();
        if (error && isNetworkError(error)) {
          handleOfflineUpsertBudget(row, qc);
          return { ...row, _isOfflinePending: true };
        }
        throwIfSupabaseError(error);
        return data;
      } catch (err) {
        if (isNetworkError(err)) {
          handleOfflineUpsertBudget(row, qc);
          return { ...row, _isOfflinePending: true };
        }
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget_goal"] }),
  });
}
