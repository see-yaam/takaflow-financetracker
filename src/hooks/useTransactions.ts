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
  removeFromOutbox,
  findQueuedCreate,
  handleOfflineUpdateCategory,
  processOutboxSync,
  generateUUID,
} from "@/lib/offlineSync";
import { toast } from "sonner";
import { matchesTxFilters } from "@/lib/txFilters";
import type { Tables } from "@/integrations/supabase/types";

/** A ledger row as the UI sees it: a server row (with its wallet name) or a queued offline row. */
export type TransactionRow = Tables<"transactions"> & {
  wallets?: { name: string } | null;
  _isOfflinePending?: boolean;
};

export interface TransactionFilters {
  month?: string;
  /** Inclusive yyyy-MM-dd range (used by the /transactions ledger). */
  from?: string;
  to?: string;
  walletId?: string;
  category?: string;
}

/** Queued (not yet synced) creates that belong in a query with these filters. */
function queuedRowsFor(filters?: TransactionFilters): TransactionRow[] {
  return getOutbox()
    .filter((i) => i.type === "CREATE_TRANSACTION" && i.payload.transaction && matchesTxFilters(i.payload.transaction, filters))
    .map((i) => ({ ...i.payload.transaction, id: i.payload.tempId, _isOfflinePending: true }) as unknown as TransactionRow);
}

/** Offline: keep the last cached rows and add queued rows that aren't in them yet. */
function mergeQueued(cached: TransactionRow[] | undefined, queued: TransactionRow[]): TransactionRow[] {
  const base = (cached || []).filter((r) => !r._isOfflinePending);
  const ids = new Set(base.map((r) => r.id));
  return [...queued.filter((q) => !ids.has(q.id)), ...base];
}

export function useTransactions(filters?: TransactionFilters) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["transactions", user?.id, filters];
  return useQuery({
    queryKey,
    queryFn: async (): Promise<TransactionRow[]> => {
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
        if (filters?.from) query = query.gte("date", filters.from);
        if (filters?.to) query = query.lte("date", filters.to);
        if (filters?.walletId) query = query.eq("wallet_id", filters.walletId);
        if (filters?.category) query = query.eq("category", filters.category);
        const { data, error } = await query;

        if (error) {
          if (isNetworkError(error)) {
            console.warn("Network error fetching transactions, using offline outbox fallback");
            const outboxTxs = queuedRowsFor(filters);
            return mergeQueued(qc.getQueryData<TransactionRow[]>(queryKey), outboxTxs);
          }
          throwIfSupabaseError(error);
        }

        const existingIds = new Set((data || []).map((t: { id: string }) => t.id));

        // A queued create whose id is already in the cloud has landed: drop just that item (by id).
        for (const item of getOutbox()) {
          if (item.type !== "CREATE_TRANSACTION") continue;
          const txId = item.payload?.tempId || item.payload?.transaction?.id;
          if (txId && existingIds.has(txId)) removeFromOutbox(item.id);
        }

        const outboxTxs = queuedRowsFor(filters);

        const combined = [...(data || [])];
        for (const ot of outboxTxs) {
          if (!existingIds.has(ot.id)) {
            // queued (not yet synced) rows share the row shape except the joined wallets(name)
            combined.unshift(ot as unknown as (typeof combined)[number]);
          }
        }
        return combined as TransactionRow[];
      } catch (err: any) {
        if (isNetworkError(err)) {
          console.warn("Network exception fetching transactions, using offline outbox fallback");
          const outboxTxs = queuedRowsFor(filters);
          return mergeQueued(qc.getQueryData<TransactionRow[]>(queryKey), outboxTxs);
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
      // Still queued locally (or offline): handle via the outbox so it can't resurrect on sync.
      if ((typeof navigator !== "undefined" && !navigator.onLine) || findQueuedCreate(id, "CREATE_TRANSACTION")) {
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
      // Still queued locally (or offline): handle via the outbox so the reversal isn't lost.
      if ((typeof navigator !== "undefined" && !navigator.onLine) || findQueuedCreate(id, "CREATE_TRANSACTION")) {
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
      const clean = category.trim();
      if ((typeof navigator !== "undefined" && !navigator.onLine) || findQueuedCreate(id, "CREATE_TRANSACTION")) {
        handleOfflineUpdateCategory(id, clean, qc);
        return;
      }
      try {
        const { error } = await supabase.from("transactions").update({ category: clean }).eq("id", id);
        if (error && isNetworkError(error)) {
          handleOfflineUpdateCategory(id, clean, qc);
          return;
        }
        throwIfSupabaseError(error);
      } catch (err) {
        if (isNetworkError(err)) {
          handleOfflineUpdateCategory(id, clean, qc);
          return;
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
