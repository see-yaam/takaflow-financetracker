import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { recurringCreateSchema } from "@/lib/validations";
import { dueOccurrences, recurringTxId } from "@/lib/recurring";
import { handleOfflineCreateRecurring, handleOfflineDeleteRecurring, isNetworkError } from "@/lib/offlineSync";
import { toast } from "sonner";

export function useRecurringTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recurring_transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .select("*, wallets(name)")
        .order("day_of_month", { ascending: true });
      throwIfSupabaseError(error);
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: {
      wallet_id: string;
      type: string;
      amount: number;
      category: string;
      note?: string;
      day_of_month: number;
      /** Month already covered by the transaction created together with this rule. */
      last_applied_month?: string;
    }) => {
      const parsed = recurringCreateSchema.parse(r);
      const rule = {
        user_id: user!.id,
        wallet_id: parsed.wallet_id,
        type: parsed.type,
        amount: parsed.amount,
        category: parsed.category,
        note: parsed.note ?? null,
        day_of_month: parsed.day_of_month,
        last_applied_month: parsed.last_applied_month ?? null,
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) return handleOfflineCreateRecurring(rule, qc);
      try {
        const { data, error } = await supabase.from("recurring_transactions").insert(rule).select().single();
        if (error && isNetworkError(error)) return handleOfflineCreateRecurring(rule, qc);
        throwIfSupabaseError(error);
        return data;
      } catch (err) {
        if (isNetworkError(err)) return handleOfflineCreateRecurring(rule, qc);
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_transactions"] }),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        handleOfflineDeleteRecurring(id, qc);
        return;
      }
      try {
        const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
        if (error && isNetworkError(error)) {
          handleOfflineDeleteRecurring(id, qc);
          return;
        }
        throwIfSupabaseError(error);
      } catch (err) {
        if (isNetworkError(err)) {
          handleOfflineDeleteRecurring(id, qc);
          return;
        }
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_transactions"] }),
  });
}

export function useApplyRecurring() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    /**
     * Applies every due occurrence that hasn't been applied yet, including missed
     * days, short months (31st -> 28th/30th) and whole missed months (back-filled,
     * at most 12 per rule, never before the rule existed).
     *
     * Idempotent: each occurrence gets a deterministic id, so a second tab/device
     * (or a retry after a crash) hits the primary key instead of duplicating, and
     * last_applied_month only ever moves forward.
     */
    mutationFn: async (): Promise<{ created: Array<{ category: string; month: string }> }> => {
      const created: Array<{ category: string; month: string }> = [];
      if (!user) return { created };
      // Online only: a missed run is simply caught up on a later Dashboard visit.
      if (typeof navigator !== "undefined" && !navigator.onLine) return { created };

      const { data: rules, error: fetchError } = await supabase.from("recurring_transactions").select("*");
      throwIfSupabaseError(fetchError);

      const today = new Date();
      for (const r of rules || []) {
        for (const occ of dueOccurrences(r, today)) {
          const { error: insertError } = await supabase.from("transactions").insert({
            id: recurringTxId(r.id, occ.month),
            user_id: user.id,
            wallet_id: r.wallet_id,
            type: r.type,
            amount: r.amount,
            category: r.category,
            note: r.note ? `${r.note} (recurring)` : "Recurring transaction",
            date: occ.date,
          });
          if (insertError && insertError.code !== "23505") {
            // Network failures stop here and are retried next time; nothing is marked applied.
            if (isNetworkError(insertError)) return { created };
            throwIfSupabaseError(insertError);
          }
          if (!insertError) created.push({ category: r.category, month: occ.month });

          // Advance the marker only forward (another device may already be ahead).
          const { error: updateError } = await supabase
            .from("recurring_transactions")
            .update({ last_applied_month: occ.month })
            .eq("id", r.id)
            .or(`last_applied_month.is.null,last_applied_month.lt.${occ.month}`);
          if (updateError && isNetworkError(updateError)) return { created };
          throwIfSupabaseError(updateError);
        }
      }
      return { created };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["recurring_transactions"] });
      const created = result?.created ?? [];
      if (created.length > 0) {
        const monthName = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMM yyyy");
        const byCategory = new Map<string, string[]>();
        for (const c of created) byCategory.set(c.category, [...(byCategory.get(c.category) ?? []), monthName(c.month)]);
        const summary = [...byCategory].map(([cat, months]) => `${cat} (${months.join(", ")})`).join("; ");
        toast.success(
          `Added ${created.length} recurring ${created.length === 1 ? "entry" : "entries"}: ${summary}`,
          { duration: 7000 }
        );
      }
    },
    onError: (err) => console.error("Applying recurring transactions failed:", err),
  });
}
