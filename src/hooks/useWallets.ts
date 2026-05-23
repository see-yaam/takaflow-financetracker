import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { walletCreateSchema, walletUpdateSchema } from "@/lib/validations";

export function useWallets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .order("created_at", { ascending: true });
      throwIfSupabaseError(error);
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateWallet() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ name, balance, icon, currency }: { name: string; balance: number; icon?: string; currency?: string }) => {
      const parsed = walletCreateSchema.parse({ name, balance, icon, currency: currency || "BDT" });
      const { data, error } = await supabase
        .from("wallets")
        .insert({
          name: parsed.name,
          balance: parsed.balance,
          icon: parsed.icon || "wallet",
          user_id: user!.id,
          currency: parsed.currency,
        } as any)
        .select()
        .single();
      throwIfSupabaseError(error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
  });
}

export function useUpdateWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, balance }: { id: string; name?: string; balance?: number }) => {
      const parsed = walletUpdateSchema.parse({ id, name, balance });
      const updates: { name?: string; balance?: number } = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.balance !== undefined) updates.balance = parsed.balance;
      const { error } = await supabase.from("wallets").update(updates).eq("id", parsed.id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
  });
}

export function useDeleteWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wallets").delete().eq("id", id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
