import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { transactionCreateSchema } from "@/lib/validations";

export function useTransactions(filters?: { month?: string; walletId?: string; category?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*, wallets(name)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (filters?.month) {
        const [y, m] = filters.month.split("-");
        const start = `${y}-${m}-01`;
        const lastDay = new Date(+y, +m, 0);
        const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
        query = query.gte("date", start).lte("date", end);
      }
      if (filters?.walletId) query = query.eq("wallet_id", filters.walletId);
      if (filters?.category) query = query.eq("category", filters.category);
      const { data, error } = await query;
      throwIfSupabaseError(error);
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
      const parsed = transactionCreateSchema.parse({
        ...tx,
        date: tx.date || new Date().toISOString().slice(0, 10),
      });
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...parsed, user_id: user!.id } as any)
        .select()
        .single();
      throwIfSupabaseError(error);
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
      throwIfSupabaseError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}

export function useReverseTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .update({ is_reversed: true } as any)
        .eq("id", id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}

export function useUpdateTransactionCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ category: category.trim() } as any)
        .eq("id", id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
