import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { walletCreateSchema, walletUpdateSchema } from "@/lib/validations";

import { handleOfflineCreateWallet, handleOfflineDeleteWallet, isNetworkError, getOutbox, removeFromOutbox, findQueuedCreate, handleOfflineUpdateWallet, processOutboxSync, generateUUID } from "@/lib/offlineSync";

/** A wallet as the UI sees it: a server row or a queued offline one. */
export type WalletRow = Tables<"wallets"> & { _isOfflinePending?: boolean };

/** Offline: keep the cached wallets and add queued (not yet synced) ones. */
function mergeQueuedWallets(cached: unknown): WalletRow[] {
  const base = (Array.isArray(cached) ? cached : []).filter((w: { _isOfflinePending?: boolean }) => !w._isOfflinePending);
  const ids = new Set(base.map((w: { id: string }) => w.id));
  const queued = getOutbox()
    .filter((i) => i.type === "CREATE_WALLET" && i.payload.wallet && !ids.has(i.payload.tempId as string))
    .map((i) => ({ ...i.payload.wallet, id: i.payload.tempId as string, _isOfflinePending: true }));
  return [...base, ...queued] as unknown as WalletRow[];
}

export function useWallets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async (): Promise<WalletRow[]> => {
      try {
        const { data, error } = await supabase
          .from("wallets")
          .select("*")
          .order("created_at", { ascending: true });

        if (error) {
          if (isNetworkError(error)) {
            console.warn("Network error fetching wallets, using offline outbox fallback");
            return mergeQueuedWallets(qc.getQueryData(["wallets", user?.id]));
          }
          throwIfSupabaseError(error);
        }

        const existingIds = new Set((data || []).map((w: { id: string }) => w.id));

        // A queued wallet create whose id is already in the cloud has landed: drop just that item.
        // (Matching by id only: a same-named wallet is a different wallet and must still sync.)
        for (const item of getOutbox()) {
          if (item.type !== "CREATE_WALLET") continue;
          const wId = item.payload?.tempId || item.payload?.wallet?.id;
          if (wId && existingIds.has(wId)) removeFromOutbox(item.id);
        }

        const outboxWallets = getOutbox()
          .filter((i) => i.type === "CREATE_WALLET")
          .map((i) => ({ ...i.payload.wallet, id: i.payload.tempId, _isOfflinePending: true }));

        const combined = [...(data || [])];
        for (const ow of outboxWallets) {
          if (ow.id && !existingIds.has(ow.id)) {
            combined.push(ow as unknown as (typeof combined)[number]);
          }
        }

        // Edge-case recovery: If user is authenticated and has 0 wallets, auto-create "Main Vault"
        if (combined.length === 0 && user?.id) {
          try {
            const defaultId = generateUUID();
            const { data: seeded, error: seedErr } = await supabase
              .from("wallets")
              .insert({
                id: defaultId,
                name: "Main Vault",
                balance: 0,
                currency: "BDT",
                user_id: user.id,
                icon: "wallet",
              })
              .select("*")
              .single();
            if (seeded && !seedErr) {
              return [seeded as WalletRow];
            }
          } catch (seedEx) {
            console.warn("Could not auto-seed initial wallet:", seedEx);
          }
        }

        return combined as WalletRow[];
      } catch (err) {
        if (isNetworkError(err)) {
          console.warn("Network exception fetching wallets, using offline outbox fallback");
          return mergeQueuedWallets(qc.getQueryData(["wallets", user?.id]));
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

export function useCreateWallet() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    networkMode: "offlineFirst",
    mutationFn: async ({ name, balance, icon, currency }: { name: string; balance: number; icon?: string; currency?: string }) => {
      const parsed = walletCreateSchema.parse({ name, balance, icon, currency: currency || "BDT" });
      
      let resolvedUserId = user?.id;
      if (!resolvedUserId) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          resolvedUserId = sessionData?.session?.user?.id;
        } catch {
        // best effort: ignore
      }
      }

      if (!resolvedUserId) {
        throw new Error("User session required to create a wallet.");
      }

      // If clearly offline, go straight to offline outbox with real UUID
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return handleOfflineCreateWallet(parsed, resolvedUserId, qc);
      }

      // Online insertion with optimistic fallback if network fails
      try {
        const walletId = generateUUID();
        const { data, error } = await supabase
          .from("wallets")
          .insert({
            id: walletId,
            name: parsed.name,
            balance: parsed.balance,
            icon: parsed.icon || "wallet",
            user_id: resolvedUserId,
            currency: parsed.currency,
          })
          .select()
          .single();

        if (error) {
          if (isNetworkError(error)) {
            return handleOfflineCreateWallet(parsed, resolvedUserId, qc);
          }
          throwIfSupabaseError(error);
        }
        return data;
      } catch (err) {
        // If network error / failed to fetch, save locally and sync later!
        if (isNetworkError(err)) {
          return handleOfflineCreateWallet(parsed, resolvedUserId, qc);
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      if (data?.id) {
        qc.setQueriesData({ queryKey: ["wallets"] }, (old) => {
          if (!Array.isArray(old)) return [data];
          if (old.some((w) => w.id === data.id)) return old;
          return [...old, data];
        });
      }
      qc.invalidateQueries({ queryKey: ["wallets"] });
      if ((data as { _isOfflinePending?: boolean } | null)?._isOfflinePending && typeof navigator !== "undefined" && navigator.onLine) {
        processOutboxSync(qc);
      }
    },
  });
}

export function useUpdateWallet() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "offlineFirst",
    mutationFn: async ({ id, name, balance }: { id: string; name?: string; balance?: number }) => {
      const parsed = walletUpdateSchema.parse({ id, name, balance });
      const updates: { name?: string; balance?: number } = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.balance !== undefined) updates.balance = parsed.balance;

      // Offline, still-queued wallet, or network failure: durable outbox item (synced later).
      if ((typeof navigator !== "undefined" && !navigator.onLine) || findQueuedCreate(id, "CREATE_WALLET")) {
        handleOfflineUpdateWallet(id, updates, qc);
        return { queued: true };
      }

      try {
        const { error } = await supabase.from("wallets").update(updates).eq("id", parsed.id);
        if (error) {
          if (isNetworkError(error)) {
            handleOfflineUpdateWallet(id, updates, qc);
            return { queued: true };
          }
          throwIfSupabaseError(error);
        }
      } catch (err) {
        if (isNetworkError(err)) {
          handleOfflineUpdateWallet(id, updates, qc);
          return { queued: true };
        }
        throw err;
      }

      qc.setQueriesData({ queryKey: ["wallets"] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((w) => (w.id === id ? { ...w, ...updates } : w));
      });
      return { queued: false };
    },
    // Re-read the server after an online save or a failure; queued edits keep their optimistic value.
    onSettled: (result) => {
      if (!result?.queued) qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}

export function useDeleteWallet() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "offlineFirst",
    mutationFn: async (id: string) => {
      // 1. Direct offline mode or local pending wallet
      if (
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        id.startsWith("offline_") ||
        findQueuedCreate(id, "CREATE_WALLET")
      ) {
        handleOfflineDeleteWallet(id, qc);
        return { id };
      }

      // 2. Try online delete with optimistic fallback if network/auth fails
      try {
        const { error } = await supabase.from("wallets").delete().eq("id", id);
        if (error) {
          if (isNetworkError(error)) {
            handleOfflineDeleteWallet(id, qc);
            return { id };
          }
          throwIfSupabaseError(error);
        }
        return { id };
      } catch (err) {
        if (isNetworkError(err)) {
          handleOfflineDeleteWallet(id, qc);
          return { id };
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      if (result?.id) {
        qc.setQueriesData({ queryKey: ["wallets"] }, (old) => {
          if (!Array.isArray(old)) return [];
          return old.filter((w) => w.id !== result.id);
        });
      }
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
