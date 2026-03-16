import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useMonthlySnapshots(month?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["monthly_snapshots", user?.id, month],
    queryFn: async () => {
      let query = supabase.from("monthly_snapshots").select("*").order("month", { ascending: false });
      if (month) query = query.eq("month", month);
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}

export function useCreateSnapshot() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (snapshot: { wallet_id: string; month: string; opening_balance: number; total_income: number; total_expense: number }) => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .upsert({ ...snapshot, user_id: user!.id }, { onConflict: "user_id,wallet_id,month" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly_snapshots"] }),
  });
}
