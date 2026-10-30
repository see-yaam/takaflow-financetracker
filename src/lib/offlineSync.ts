import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export type OutboxActionType =
  | "CREATE_TRANSACTION"
  | "DELETE_TRANSACTION"
  | "REVERSE_TRANSACTION"
  | "CREATE_WALLET";

export interface OutboxItem {
  id: string; // unique outbox item id
  type: OutboxActionType;
  payload: any;
  createdAt: number;
}

const OUTBOX_STORAGE_KEY = "TAKAPERSIST_OUTBOX_V1";
const CACHE_STORAGE_KEY = "TAKAPERSIST_CACHE_V1";

// 1. Storage Helpers
function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function getOutbox(): OutboxItem[] {
  try {
    const storage = getStorage();
    const raw = storage ? storage.getItem(OUTBOX_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items: OutboxItem[]): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("takaflow_outbox_changed", { detail: { count: items.length } }));
    }
  } catch (err) {
    console.error("Error saving outbox:", err);
  }
}

export function addToOutbox(type: OutboxActionType, payload: any): OutboxItem {
  const items = getOutbox();
  const newItem: OutboxItem = {
    id: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: Date.now(),
  };
  items.push(newItem);
  saveOutbox(items);
  return newItem;
}

export function removeFromOutbox(id: string): void {
  const items = getOutbox().filter((i) => i.id !== id);
  saveOutbox(items);
}

export function clearOutbox(): void {
  saveOutbox([]);
}

export function clearOfflineCache(): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(CACHE_STORAGE_KEY);
      storage.removeItem(OUTBOX_STORAGE_KEY);
    }
  } catch (err) {
    console.error("Error clearing offline cache:", err);
  }
}

// 2. React Query Cache Persister Setup (Permanent Offline Retention)
export function setupQueryPersistence(queryClient: QueryClient) {
  if (typeof window === "undefined") return;

  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: CACHE_STORAGE_KEY,
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: Infinity, // Permanent: Never expires even after months offline
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        // Persist queries that have successful data
        return query.state.status === "success";
      },
    },
  });
}

// 3. Optimistic Offline Actions
export function handleOfflineCreateTransaction(
  tx: { wallet_id: string; type: string; amount: number; category: string; note?: string; date?: string },
  userId: string,
  qc: QueryClient
) {
  const tempId = `offline_tx_${Date.now()}`;
  const now = new Date().toISOString();
  const date = tx.date || now.slice(0, 10);

  const optimisticTx = {
    id: tempId,
    wallet_id: tx.wallet_id,
    type: tx.type,
    amount: Number(tx.amount),
    category: tx.category,
    note: tx.note || null,
    date,
    user_id: userId,
    created_at: now,
    is_reversed: false,
    _isOfflinePending: true,
  };

  // 1. Add to Outbox Queue
  addToOutbox("CREATE_TRANSACTION", {
    tempId,
    transaction: {
      wallet_id: tx.wallet_id,
      type: tx.type,
      amount: Number(tx.amount),
      category: tx.category,
      note: tx.note || null,
      date,
      user_id: userId,
    },
  });

  // 2. Optimistically update local ["transactions"] query
  qc.setQueriesData({ queryKey: ["transactions"] }, (oldData: any) => {
    if (!Array.isArray(oldData)) return [optimisticTx];
    return [optimisticTx, ...oldData];
  });

  // 3. Optimistically update local ["wallets"] balance
  qc.setQueriesData({ queryKey: ["wallets"] }, (oldWallets: any) => {
    if (!Array.isArray(oldWallets)) return oldWallets;
    return oldWallets.map((w) => {
      if (w.id === tx.wallet_id) {
        const delta = tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
        return {
          ...w,
          balance: Number(w.balance) + delta,
        };
      }
      return w;
    });
  });

  return optimisticTx;
}

export function handleOfflineDeleteTransaction(id: string, qc: QueryClient) {
  // If it was created offline and still in outbox, just cancel it
  const outbox = getOutbox();
  const existingCreate = outbox.find(
    (item) => item.type === "CREATE_TRANSACTION" && item.payload.tempId === id
  );

  let targetTx = existingCreate?.payload?.transaction;

  if (existingCreate) {
    removeFromOutbox(existingCreate.id);
  } else {
    addToOutbox("DELETE_TRANSACTION", { id });
  }

  // Find transaction from cache if not already found from outbox
  if (!targetTx) {
    const allQueries = qc.getQueriesData<any[]>({ queryKey: ["transactions"] });
    for (const [, txs] of allQueries) {
      if (Array.isArray(txs)) {
        const found = txs.find((t) => t.id === id);
        if (found) {
          targetTx = found;
          break;
        }
      }
    }
  }

  // Restore wallet balance locally
  if (targetTx) {
    qc.setQueriesData({ queryKey: ["wallets"] }, (oldWallets: any) => {
      if (!Array.isArray(oldWallets)) return oldWallets;
      return oldWallets.map((w) => {
        if (w.id === targetTx.wallet_id && !targetTx.is_reversed) {
          const delta = targetTx.type === "income" ? -Number(targetTx.amount) : Number(targetTx.amount);
          return { ...w, balance: Number(w.balance) + delta };
        }
        return w;
      });
    });
  }

  qc.setQueriesData({ queryKey: ["transactions"] }, (oldData: any) => {
    if (!Array.isArray(oldData)) return oldData;
    return oldData.filter((t) => t.id !== id);
  });
}

export function handleOfflineReverseTransaction(id: string, qc: QueryClient) {
  addToOutbox("REVERSE_TRANSACTION", { id });

  const allTx = qc.getQueryData<any[]>(["transactions"]);
  const target = allTx?.find((t) => t.id === id);

  if (target && !target.is_reversed) {
    qc.setQueriesData({ queryKey: ["wallets"] }, (oldWallets: any) => {
      if (!Array.isArray(oldWallets)) return oldWallets;
      return oldWallets.map((w) => {
        if (w.id === target.wallet_id) {
          const delta = target.type === "income" ? -Number(target.amount) : Number(target.amount);
          return { ...w, balance: Number(w.balance) + delta };
        }
        return w;
      });
    });
  }

  qc.setQueriesData({ queryKey: ["transactions"] }, (oldData: any) => {
    if (!Array.isArray(oldData)) return oldData;
    return oldData.map((t) => (t.id === id ? { ...t, is_reversed: true } : t));
  });
}

export function handleOfflineCreateWallet(
  wallet: { name: string; balance: number; icon?: string; currency?: string },
  userId: string,
  qc: QueryClient
) {
  const tempId = `offline_wallet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const optimisticWallet = {
    id: tempId,
    name: wallet.name,
    balance: Number(wallet.balance) || 0,
    icon: wallet.icon || "wallet",
    currency: wallet.currency || "BDT",
    user_id: userId,
    created_at: now,
    _isOfflinePending: true,
  };

  addToOutbox("CREATE_WALLET", {
    tempId,
    wallet: {
      name: wallet.name,
      balance: Number(wallet.balance) || 0,
      icon: wallet.icon || "wallet",
      currency: wallet.currency || "BDT",
      user_id: userId,
    },
  });

  qc.setQueriesData({ queryKey: ["wallets"] }, (oldData: any) => {
    if (!Array.isArray(oldData)) return [optimisticWallet];
    return [...oldData, optimisticWallet];
  });

  return optimisticWallet;
}

// 4. Background Sync Processor
let isSyncInProgress = false;

export async function processOutboxSync(queryClient: QueryClient): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;
  if (isSyncInProgress) return 0;

  const outbox = getOutbox();
  if (outbox.length === 0) return 0;

  isSyncInProgress = true;
  window.dispatchEvent(new CustomEvent("takaflow_sync_started"));

  let syncedCount = 0;
  const remaining: OutboxItem[] = [];

  for (const item of outbox) {
    try {
      if (item.type === "CREATE_TRANSACTION") {
        const { error } = await supabase
          .from("transactions")
          .insert(item.payload.transaction);
        if (error) throw error;
        syncedCount++;
      } else if (item.type === "DELETE_TRANSACTION") {
        const { error } = await supabase
          .from("transactions")
          .delete()
          .eq("id", item.payload.id);
        if (error) throw error;
        syncedCount++;
      } else if (item.type === "REVERSE_TRANSACTION") {
        const { error } = await supabase
          .from("transactions")
          .update({ is_reversed: true } as any)
          .eq("id", item.payload.id);
        if (error) throw error;
        syncedCount++;
      } else if (item.type === "CREATE_WALLET") {
        const { wallet } = item.payload;
        const { error } = await supabase
          .from("wallets")
          .insert(wallet);
        if (error) throw error;
        syncedCount++;
      }
    } catch (err: any) {
      console.error(`Failed to sync outbox item ${item.id}:`, err);
      // Keep in remaining queue if network failure or temporary error
      remaining.push(item);
    }
  }

  saveOutbox(remaining);
  isSyncInProgress = false;
  window.dispatchEvent(new CustomEvent("takaflow_sync_finished", { detail: { syncedCount } }));

  if (syncedCount > 0) {
    // Refresh queries from cloud database with fresh server IDs
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["wallets"] });
    queryClient.invalidateQueries({ queryKey: ["debts"] });
    toast.success(`Synced ${syncedCount} offline ${syncedCount === 1 ? "change" : "changes"} with cloud! ☁️✨`);
  }

  return syncedCount;
}

// 5. React Hook for UI Status
export function useOfflineSyncStatus(queryClient?: QueryClient) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState<number>(() => getOutbox().length);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (queryClient) {
        processOutboxSync(queryClient);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleOutboxChange = (e: any) => {
      setPendingCount(e.detail?.count ?? getOutbox().length);
    };

    const handleSyncStart = () => setIsSyncing(true);
    const handleSyncEnd = () => setIsSyncing(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("takaflow_outbox_changed", handleOutboxChange);
    window.addEventListener("takaflow_sync_started", handleSyncStart);
    window.addEventListener("takaflow_sync_finished", handleSyncEnd);

    // Initial check if we are online and have outbox items
    if (navigator.onLine && queryClient && getOutbox().length > 0) {
      processOutboxSync(queryClient);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("takaflow_outbox_changed", handleOutboxChange);
      window.removeEventListener("takaflow_sync_started", handleSyncStart);
      window.removeEventListener("takaflow_sync_finished", handleSyncEnd);
    };
  }, [queryClient]);

  return { isOnline, pendingCount, isSyncing };
}
