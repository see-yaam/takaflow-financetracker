import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { parseStrict, transactionCreateSchema } from "@/lib/validations";
import {
  handleOfflineCreateTransaction,
  handleOfflineDeleteTransaction,
  handleOfflineReverseTransaction,
  isNetworkError,
  getOutbox,
  saveOutbox,
  processOutboxSync,
  generateUUID,
} from "@/lib/offlineSync";
import { toast } from "sonner";

export function useTransactions(filters?: { month?: string; walletId?: string; category?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", user?.id, filters],
    queryFn: async () => {
      try {
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

        if (error) {
          if (isNetworkError(error)) {
            console.warn("Network error fetching transactions, using offline outbox fallback");
            const outboxTxs = getOutbox()
              .filter((i) => i.type === "CREATE_TRANSACTION")
              .map((i) => ({ ...i.payload.transaction, id: i.payload.tempId, _isOfflinePending: true }));
            return outboxTxs;
          }
          throwIfSupabaseError(error);
        }

        const rawOutbox = getOutbox();
        const existingIds = new Set((data || []).map((t: any) => t.id));

        // Auto-cleanup: If an outbox transaction already exists in cloud, remove it from outbox
        let outboxModified = false;
        const cleanedOutbox = rawOutbox.filter((item) => {
          if (item.type === "CREATE_TRANSACTION") {
            const txId = item.payload?.tempId || item.payload?.transaction?.id;
            if (txId && existingIds.has(txId)) {
              outboxModified = true;
              return false; // Already in cloud!
            }
          }
          return true;
        });

        if (outboxModified) {
          saveOutbox(cleanedOutbox);
        }

        const outboxTxs = cleanedOutbox
          .filter((i) => i.type === "CREATE_TRANSACTION")
          .map((i) => ({ ...i.payload.transaction, id: i.payload.tempId, _isOfflinePending: true }));

        const combined = [...(data || [])];
        for (const ot of outboxTxs) {
          if (!existingIds.has(ot.id)) {
            combined.unshift(ot);
          }
        }
        return combined;
      } catch (err: any) {
        if (isNetworkError(err)) {
          console.warn("Network exception fetching transactions, using offline outbox fallback");
          const outboxTxs = getOutbox()
            .filter((i) => i.type === "CREATE_TRANSACTION")
            .map((i) => ({ ...i.payload.transaction, id: i.payload.tempId, _isOfflinePending: true }));
          return outboxTxs;
        }
        throw err;
      }
    },
    enabled: !!user,
    networkMode: "offlineFirst",
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    networkMode: "offlineFirst",
    mutationFn: async (tx: { wallet_id: string; type: string; amount: number; category: string; note?: string; date?: string }) => {
      const parsed = parseStrict(transactionCreateSchema, {
        ...tx,
        date: tx.date || new Date().toISOString().slice(0, 10),
      });

      let resolvedUserId = user?.id;
      if (!resolvedUserId) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          resolvedUserId = sessionData?.session?.user?.id;
        } catch {}
      }

      if (!resolvedUserId) {
        throw new Error("User session required to create a transaction.");
      }

      // If clearly offline, save offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return handleOfflineCreateTransaction(parsed, resolvedUserId, qc);
      }

      // Try online insert first, with immediate optimistic offline fallback if network is unreachable
      try {
        const txId = generateUUID();
        const { data, error } = await supabase
          .from("transactions")
          .insert({ id: txId, ...parsed, user_id: resolvedUserId } as any)
          .select("*, wallets(name)")
          .single();

        if (error) {
          if (isNetworkError(error)) {
            return handleOfflineCreateTransaction(parsed, resolvedUserId, qc);
          }
          throwIfSupabaseError(error);
        }
        return data;
      } catch (err: any) {
        // Fallback to offline queue if network connection failed
        if (isNetworkError(err)) {
          return handleOfflineCreateTransaction(parsed, resolvedUserId, qc);
        }
        throw err;
      }
    },
    onSuccess: (data: any) => {
      if (data?._isOfflinePending) {
        if (typeof navigator !== "undefined" && navigator.onLine) {
          processOutboxSync(qc);
        } else {
          toast.info("Saved offline ☁️ Will sync automatically when back online.");
        }
      }
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "offlineFirst",
    mutationFn: async (id: string) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        handleOfflineDeleteTransaction(id, qc);
        return;
      }
      try {
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) {
          if (isNetworkError(error)) {
            handleOfflineDeleteTransaction(id, qc);
            return;
          }
          throwIfSupabaseError(error);
        }
      } catch (err: any) {
        if (isNetworkError(err)) {
          handleOfflineDeleteTransaction(id, qc);
          return;
        }
        throw err;
      }
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
    networkMode: "offlineFirst",
    mutationFn: async (id: string) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        handleOfflineReverseTransaction(id, qc);
        return;
      }
      try {
        const { error } = await supabase
          .from("transactions")
          .update({ is_reversed: true } as any)
          .eq("id", id);
        if (error) {
          if (isNetworkError(error)) {
            handleOfflineReverseTransaction(id, qc);
            return;
          }
          throwIfSupabaseError(error);
        }
      } catch (err: any) {
        if (isNetworkError(err)) {
          handleOfflineReverseTransaction(id, qc);
          return;
        }
        throw err;
      }
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
    networkMode: "offlineFirst",
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
