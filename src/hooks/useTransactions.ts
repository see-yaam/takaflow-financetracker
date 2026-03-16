import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useTransactions(filters?: { month?: string; walletId?: string; category?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", user?.id, filters],
    queryFn: async () => {
      let query = supabase.from("transactions").select("*, wallets(name)").order("date", { ascending: false }).order("created_at", { ascending: false });
      if (filters?.month) {
        const [y, m] = filters.month.split("-");
        const start = `${y}-${m}-01`;
        const end = new Date(+y, +m, 0).toISOString().split("T")[0];
        query = query.gte("date", start).lte("date", end);
      }
      if (filters?.walletId) query = query.eq("wallet_id", filters.walletId);
      if (filters?.category) query = query.eq("category", filters.category);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (tx: { wallet_id: string; type: string; amount: number; category: string; note?: string; date?: string }) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...tx, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}
