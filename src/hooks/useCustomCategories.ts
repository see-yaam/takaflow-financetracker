import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";

export interface CustomCategory {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  display_order: number;
  created_at: string;
}

const DEFAULTS: { name: string; emoji: string }[] = [
  { name: "Food", emoji: "🍔" },
  { name: "Home Rent", emoji: "🏠" },
  { name: "Transport", emoji: "🚌" },
];

export function useCustomCategories() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["custom_categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_categories")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      throwIfSupabaseError(error);
      return (data || []) as CustomCategory[];
    },
    enabled: !!user,
  });

  // Seed defaults on first load if user has none
  useEffect(() => {
    if (!user || !query.data) return;
    if (query.data.length > 0) return;
    (async () => {
      const rows = DEFAULTS.map((d, i) => ({
        user_id: user.id,
        name: d.name,
        emoji: d.emoji,
        display_order: i,
      }));
      const { error } = await supabase.from("custom_categories").insert(rows);
      if (!error) qc.invalidateQueries({ queryKey: ["custom_categories"] });
    })();
  }, [user, query.data, qc]);

  return query;
}

export function useCreateCustomCategory() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; emoji?: string | null; display_order?: number }) => {
      const { data, error } = await supabase
        .from("custom_categories")
        .insert({
          user_id: user!.id,
          name: input.name.trim(),
          emoji: input.emoji?.trim() || null,
          display_order: input.display_order ?? 9999,
        })
        .select()
        .single();
      throwIfSupabaseError(error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_categories"] }),
  });
}

export function useUpdateCustomCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; emoji?: string | null; display_order?: number }) => {
      const patch: { name?: string; emoji?: string | null; display_order?: number } = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.emoji !== undefined) patch.emoji = input.emoji?.toString().trim() || null;
      if (input.display_order !== undefined) patch.display_order = input.display_order;
      const { error } = await supabase.from("custom_categories").update(patch as any).eq("id", input.id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_categories"] }),
  });
}

export function useDeleteCustomCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_categories").delete().eq("id", id);
      throwIfSupabaseError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_categories"] }),
  });
}

export function useReorderCustomCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; display_order: number }[]) => {
      // Update sequentially to keep it simple
      for (const row of ordered) {
        const { error } = await supabase
          .from("custom_categories")
          .update({ display_order: row.display_order })
          .eq("id", row.id);
        throwIfSupabaseError(error);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_categories"] }),
  });
}

export function formatCategoryLabel(c: Pick<CustomCategory, "name" | "emoji">) {
  return c.emoji ? `${c.emoji} ${c.name}` : c.name;
}