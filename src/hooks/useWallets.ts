import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { walletCreateSchema, walletUpdateSchema } from "@/lib/validations";

import { handleOfflineCreateWallet, handleOfflineDeleteWallet, isNetworkError, getOutbox, saveOutbox, processOutboxSync, generateUUID } from "@/lib/offlineSync";

export function useWallets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("wallets")
          .select("*")
          .order("created_at", { ascending: true });

        if (error) {
          if (isNetworkError(error)) {
            console.warn("Network error fetching wallets, using offline outbox fallback");
            const outboxWallets = getOutbox()
              .filter((i) => i.type === "CREATE_WALLET")
              .map((i) => ({ ...i.payload.wallet, id: i.payload.tempId, _isOfflinePending: true }));
            return outboxWallets;
          }
          throwIfSupabaseError(error);
        }

        const rawOutbox = getOutbox();
        const existingIds = new Set((data || []).map((w: any) => w.id));
        const existingNames = new Set((data || []).map((w: any) => (w.name || "").toLowerCase().trim()));

        // Auto-cleanup: If an outbox wallet already exists in cloud by ID or Name, remove it from outbox
        let outboxModified = false;
        const cleanedOutbox = rawOutbox.filter((item) => {
          if (item.type === "CREATE_WALLET") {
            const wName = (item.payload?.wallet?.name || "").toLowerCase().trim();
            const wId = item.payload?.tempId || item.payload?.wallet?.id;
            if ((wId && existingIds.has(wId)) || (wName && existingNames.has(wName))) {
              outboxModified = true;
              return false; // Already in cloud!
            }
          }
          return true;
        });

        if (outboxModified) {
          saveOutbox(cleanedOutbox);
        }

        const outboxWallets = cleanedOutbox
          .filter((i) => i.type === "CREATE_WALLET")
          .map((i) => ({ ...i.payload.wallet, id: i.payload.tempId, _isOfflinePending: true }));

        const combined = [...(data || [])];
        for (const ow of outboxWallets) {
          const normName = (ow.name || "").toLowerCase().trim();
          if (!existingIds.has(ow.id) && !existingNames.has(normName)) {
            combined.push(ow);
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
              } as any)
              .select("*")
              .single();
            if (seeded && !seedErr) {
              return [seeded];
            }
          } catch (seedEx) {
            console.warn("Could not auto-seed initial wallet:", seedEx);
          }
        }

        return combined;
      } catch (err: any) {
        if (isNetworkError(err)) {
          console.warn("Network exception fetching wallets, using offline outbox fallback");
          const outboxWallets = getOutbox()
            .filter((i) => i.type === "CREATE_WALLET")
            .map((i) => ({ ...i.payload.wallet, id: i.payload.tempId, _isOfflinePending: true }));
          return outboxWallets;
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
        } catch {}
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
          } as any)
          .select()
          .single();

        if (error) {
          if (isNetworkError(error)) {
            return handleOfflineCreateWallet(parsed, resolvedUserId, qc);
          }
          throwIfSupabaseError(error);
        }
        return data;
      } catch (err: any) {
        // If network error / failed to fetch, save locally and sync later!
        if (isNetworkError(err)) {
          return handleOfflineCreateWallet(parsed, resolvedUserId, qc);
        }
        throw err;
      }
    },
    onSuccess: (data: any) => {
      if (data?.id) {
        qc.setQueriesData({ queryKey: ["wallets"] }, (old: any) => {
          if (!Array.isArray(old)) return [data];
          if (old.some((w) => w.id === data.id)) return old;
          return [...old, data];
        });
      }
      qc.invalidateQueries({ queryKey: ["wallets"] });
      if (data?._isOfflinePending && typeof navigator !== "undefined" && navigator.onLine) {
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

      // Optimistic cache update
      qc.setQueriesData({ queryKey: ["wallets"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((w) => (w.id === id ? { ...w, ...updates } : w));
      });

      if ((typeof navigator !== "undefined" && !navigator.onLine) || id.startsWith("offline_")) {
        return;
      }

      try {
        const { error } = await supabase.from("wallets").update(updates).eq("id", parsed.id);
        if (error && !isNetworkError(error)) {
          throwIfSupabaseError(error);
        }
      } catch (err: any) {
        if (!isNetworkError(err)) {
          throw err;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
  });
}

export function useDeleteWallet() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "offlineFirst",
    mutationFn: async (id: string) => {
      // 1. Direct offline mode or local pending wallet
      if ((typeof navigator !== "undefined" && !navigator.onLine) || id.startsWith("offline_")) {
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
      } catch (err: any) {
        if (isNetworkError(err)) {
          handleOfflineDeleteWallet(id, qc);
          return { id };
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      if (result?.id) {
        qc.setQueriesData({ queryKey: ["wallets"] }, (old: any) => {
          if (!Array.isArray(old)) return [];
          return old.filter((w) => w.id !== result.id);
        });
      }
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
