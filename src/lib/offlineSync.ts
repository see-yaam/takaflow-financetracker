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
  | "CREATE_WALLET"
  | "DELETE_WALLET";

export interface OutboxItem {
  id: string; // unique outbox item id
  type: OutboxActionType;
  payload: any;
  createdAt: number;
  attempts?: number;
}

const OUTBOX_STORAGE_KEY = "TAKAPERSIST_OUTBOX_V1";
const CACHE_STORAGE_KEY = "TAKAPERSIST_CACHE_V1";

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (!err) {
    return false;
  }

  const errObj = err as any;

  // If PostgREST returned a database error code (e.g. RLS 42501, FK 23503), the server was reached!
  if (errObj?.code && typeof errObj.code === "string" && errObj.code.length >= 3) {
    return false;
  }
  const msg = (
    err instanceof Error
      ? err.message
      : typeof errObj?.message === "string"
      ? errObj.message
      : typeof err === "string"
      ? err
      : ""
  ).toLowerCase();

  return (
    msg.includes("network error") ||
    msg.includes("networkerror") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("connection refused") ||
    msg.includes("net::err") ||
    msg.includes("timeout") ||
    msg.includes("aborterror") ||
    errObj?.status === 0
  );
}

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
  const tempId = generateUUID();
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

  // 1. Add to Outbox Queue with valid UUID
  addToOutbox("CREATE_TRANSACTION", {
    tempId,
    transaction: {
      id: tempId,
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

  // Auto-sync in background immediately if online!
  if (typeof navigator !== "undefined" && navigator.onLine) {
    processOutboxSync(qc);
  }

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
  const tempId = generateUUID();
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
      id: tempId,
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

  // Auto-sync in background immediately if online!
  if (typeof navigator !== "undefined" && navigator.onLine) {
    processOutboxSync(qc);
  }

  return optimisticWallet;
}

export function handleOfflineDeleteWallet(id: string, qc: QueryClient) {
  const outbox = getOutbox();
  const existingCreate = outbox.find(
    (item) => item.type === "CREATE_WALLET" && item.payload.tempId === id
  );

  if (existingCreate) {
    removeFromOutbox(existingCreate.id);
  } else {
    addToOutbox("DELETE_WALLET", { id });
  }

  // Optimistically remove from all local wallet queries
  qc.setQueriesData({ queryKey: ["wallets"] }, (oldWallets: any) => {
    if (!Array.isArray(oldWallets)) return [];
    return oldWallets.filter((w) => w.id !== id);
  });

  // Also remove transactions belonging to this wallet from cache
  qc.setQueriesData({ queryKey: ["transactions"] }, (oldData: any) => {
    if (!Array.isArray(oldData)) return [];
    return oldData.filter((t) => t.wallet_id !== id);
  });

  // Auto-sync in background immediately if online!
  if (typeof navigator !== "undefined" && navigator.onLine) {
    processOutboxSync(qc);
  }
}

// Helper to guarantee Supabase network calls never hang indefinitely
function withTimeout<T>(promise: PromiseLike<T>, ms = 6000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// 4. Background Sync Processor
let isSyncInProgress = false;
let lastSyncAttemptTime = 0;
const MIN_SYNC_INTERVAL_MS = 2000;

export async function processOutboxSync(queryClient: QueryClient, force = false): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (force) {
    isSyncInProgress = false;
  } else if (isSyncInProgress) {
    return 0;
  }
  const now = Date.now();
  if (!force && now - lastSyncAttemptTime < MIN_SYNC_INTERVAL_MS) {
    return 0;
  }
  lastSyncAttemptTime = now;

  const outbox = getOutbox();
  if (outbox.length === 0) return 0;

  isSyncInProgress = true;
  window.dispatchEvent(new CustomEvent("takaflow_sync_started"));

  let syncedCount = 0;
  const remaining: OutboxItem[] = [];

  try {
    // 1. Get user session from local cache or supabase client
    let user: any = null;
    try {
      const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 6000);
      user = sessionData?.session?.user;
    } catch (e) {
      console.warn("Could not retrieve local session for sync:", e);
    }

    // Direct fallback from localStorage auth token
    if (!user?.id && typeof window !== "undefined") {
      let recoveredAccessToken: string | null = null;
      let recoveredRefreshToken: string | null = null;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsedToken = JSON.parse(raw);
              const u = parsedToken?.user || parsedToken?.currentSession?.user;
              const aToken = parsedToken?.access_token || parsedToken?.currentSession?.access_token;
              const rToken = parsedToken?.refresh_token || parsedToken?.currentSession?.refresh_token;
              if (u?.id) {
                user = u;
                recoveredAccessToken = aToken;
                recoveredRefreshToken = rToken;
                break;
              }
            }
          }
        }
      } catch {}

      if (recoveredAccessToken && recoveredRefreshToken) {
        try {
          const { data: setRes } = await supabase.auth.setSession({
            access_token: recoveredAccessToken,
            refresh_token: recoveredRefreshToken,
          });
          if (setRes?.session?.user) {
            user = setRes.session.user;
          }
        } catch (setErr) {
          console.warn("Failed to set recovered session on supabase client:", setErr);
        }
      }
    }

    // If user is not authenticated, outbox items cannot be saved to user's cloud account (RLS will reject)
    if (!user?.id) {
      console.log("No active user session found. Preserving outbox until user logs in.");
      remaining.push(...outbox);
      return 0;
    }

    // 2. Fetch existing cloud wallets once so we can validate foreign keys
    let cloudWallets: any[] = [];
    try {
      const { data: cw } = await withTimeout(supabase.from("wallets").select("id, name"), 8000);
      if (Array.isArray(cw) && cw.length > 0) {
        cloudWallets = cw;
      }
    } catch {}

    // Cache of tempId -> realServerId
    const tempIdMap = new Map<string, string>();

    // 3. Process items in optimal dependency order:
    // First CREATE_WALLET, then CREATE_TRANSACTION, then deletes/reversals
    const sortedOutbox = [...outbox].sort((a, b) => {
      const rank = (type: OutboxActionType) => {
        if (type === "CREATE_WALLET") return 1;
        if (type === "CREATE_TRANSACTION") return 2;
        return 3;
      };
      return rank(a.type) - rank(b.type);
    });

    for (const item of sortedOutbox) {
      try {
        if (item.type === "CREATE_WALLET") {
          const wallet = { ...item.payload.wallet };
          wallet.user_id = user.id;
          delete (wallet as any)._isOfflinePending;

          // Ensure valid UUID
          if (!wallet.id || wallet.id.startsWith("offline_")) {
            wallet.id = generateUUID();
          }

          const { data, error } = await withTimeout(
            supabase
              .from("wallets")
              .insert(wallet)
              .select("id, name")
              .single(),
            10000
          );

          if (error) {
            // If duplicate wallet constraint triggered, it is already safely in the cloud database!
            if (error.code === "23505") {
              try {
                const { data: matched } = await withTimeout(
                  supabase
                    .from("wallets")
                    .select("id, name")
                    .or(`id.eq.${wallet.id},name.eq.${wallet.name}`)
                    .maybeSingle(),
                  5000
                );
                if (matched?.id) {
                  if (item.payload.tempId) {
                    tempIdMap.set(item.payload.tempId, matched.id);
                  }
                  cloudWallets.push(matched);
                }
              } catch {}
              syncedCount++;
              continue;
            }

            console.error(`Failed to sync wallet ${item.id} to cloud:`, error.message);
            item.attempts = (item.attempts || 0) + 1;
            if (item.attempts >= 3) {
              console.warn(`Wallet item ${item.id} exceeded retries (3), discarding.`);
              continue;
            }
            remaining.push(item);
            continue;
          }

          const resolvedWalletId = data?.id || wallet.id;
          if (item.payload.tempId) {
            tempIdMap.set(item.payload.tempId, resolvedWalletId);
          }
          cloudWallets.push({ id: resolvedWalletId, name: wallet.name });
          syncedCount++;
        } else if (item.type === "CREATE_TRANSACTION") {
          const payload = { ...item.payload.transaction };
          payload.user_id = user.id;
          delete (payload as any)._isOfflinePending;

          // Remap wallet_id if it was an offline tempId or an unknown local ID
          if (payload.wallet_id && tempIdMap.has(payload.wallet_id)) {
            payload.wallet_id = tempIdMap.get(payload.wallet_id);
          } else if (
            payload.wallet_id?.startsWith("offline_") ||
            !payload.wallet_id ||
            (cloudWallets.length > 0 && !cloudWallets.some((w) => w.id === payload.wallet_id))
          ) {
            if (cloudWallets.length > 0) {
              payload.wallet_id = cloudWallets[0].id;
            } else {
              // Auto-create a default wallet if none exists
              const defaultWalletId = generateUUID();
              try {
                const { data: newW } = await withTimeout(
                  supabase.from("wallets").insert({
                    id: defaultWalletId,
                    name: "Main Vault",
                    balance: 0,
                    currency: "BDT",
                    user_id: user.id,
                    icon: "wallet",
                  } as any).select("id, name").single(),
                  4000
                );
                if (newW?.id) {
                  payload.wallet_id = newW.id;
                  cloudWallets.push(newW);
                }
              } catch {}
            }
          }

          // Ensure transaction id is a valid UUID
          if (!payload.id || payload.id.startsWith("offline_")) {
            payload.id = generateUUID();
          }

          const { error } = await withTimeout(
            supabase.from("transactions").insert(payload),
            10000
          );
          if (error) {
            console.error(`Transaction insert error for ${item.id}:`, error.message, error.code);
            if (
              error.code === "23503" ||
              error.code === "23502" ||
              error.code === "22P02" ||
              error.code === "23505" ||
              error.code === "42501" ||
              error.code?.startsWith("PGRST")
            ) {
              console.warn(`Constraint violation for transaction ${item.id}, discarding:`, error.message);
              continue;
            }
            item.attempts = (item.attempts || 0) + 1;
            if (item.attempts >= 3) {
              console.warn(`Transaction item ${item.id} exceeded 3 retries, discarding:`, error.message);
              continue;
            }
            if (!isNetworkError(error)) {
              console.warn(`Non-network sync failure for transaction ${item.id}, discarding:`, error.message);
              continue;
            }
            throw error;
          }
          syncedCount++;
        } else if (item.type === "DELETE_TRANSACTION") {
          if (typeof item.payload?.id === "string" && item.payload.id.startsWith("offline_")) {
            syncedCount++;
            continue;
          }

          const { error } = await withTimeout(
            supabase
              .from("transactions")
              .delete()
              .eq("id", item.payload.id),
            5000
          );
          if (error) {
            if (!isNetworkError(error)) {
              console.warn(`Non-network failure for delete ${item.id}, discarding:`, error.message);
              continue;
            }
            throw error;
          }
          syncedCount++;
        } else if (item.type === "REVERSE_TRANSACTION") {
          if (typeof item.payload?.id === "string" && item.payload.id.startsWith("offline_")) {
            syncedCount++;
            continue;
          }

          const { error } = await withTimeout(
            supabase
              .from("transactions")
              .update({ is_reversed: true } as any)
              .eq("id", item.payload.id),
            5000
          );
          if (error) {
            if (!isNetworkError(error)) {
              console.warn(`Non-network failure for reverse ${item.id}, discarding:`, error.message);
              continue;
            }
            throw error;
          }
          syncedCount++;
        } else if (item.type === "DELETE_WALLET") {
          if (typeof item.payload?.id === "string" && item.payload.id.startsWith("offline_")) {
            syncedCount++;
            continue;
          }

          const { error } = await withTimeout(
            supabase
              .from("wallets")
              .delete()
              .eq("id", item.payload.id),
            5000
          );
          if (error) {
            if (!isNetworkError(error)) {
              console.warn(`Non-network failure for wallet delete ${item.id}, discarding:`, error.message);
              continue;
            }
            throw error;
          }
          syncedCount++;
        }
      } catch (err: any) {
        console.error(`Failed to sync outbox item ${item.id}:`, err);
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= 3) {
          console.warn(`Outbox item ${item.id} exceeded maximum retry attempts (3), discarding to prevent lock.`);
          continue;
        }
        remaining.push(item);
        if (isNetworkError(err)) {
          const currentIndex = sortedOutbox.indexOf(item);
          if (currentIndex + 1 < sortedOutbox.length) {
            remaining.push(...sortedOutbox.slice(currentIndex + 1));
          }
          break;
        }
      }
    }
  } catch (globalSyncErr) {
    console.error("Global sync exception:", globalSyncErr);
  } finally {
    isSyncInProgress = false;
    saveOutbox(remaining);
    window.dispatchEvent(new CustomEvent("takaflow_sync_finished", { detail: { syncedCount } }));
  }

  if (syncedCount > 0) {
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
    let syncSafetyTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      if (queryClient && !isSyncInProgress) {
        processOutboxSync(queryClient);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // Update pendingCount when outbox items change.
    // NOTE: Do NOT call processOutboxSync here to prevent an infinite feedback loop!
    const handleOutboxChange = (e: any) => {
      const count = e.detail?.count ?? getOutbox().length;
      setPendingCount(count);
    };

    const handleSyncStart = () => {
      setIsSyncing(true);
      if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
      // Failsafe timeout: never stay in spinning syncing state longer than 12 seconds
      syncSafetyTimer = setTimeout(() => {
        setIsSyncing(false);
      }, 12000);
    };

    const handleSyncEnd = () => {
      if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
      setIsSyncing(false);
    };

    // Auto-sync whenever user switches back to the tab/app
    const handleFocusOrVisible = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        typeof navigator !== "undefined" &&
        navigator.onLine &&
        queryClient &&
        !isSyncInProgress &&
        getOutbox().length > 0
      ) {
        processOutboxSync(queryClient);
      }
    };

    // Periodic auto-sync fallback every 10 seconds if anything is pending
    const autoSyncTimer = setInterval(() => {
      if (
        typeof navigator !== "undefined" &&
        navigator.onLine &&
        queryClient &&
        !isSyncInProgress &&
        getOutbox().length > 0
      ) {
        processOutboxSync(queryClient);
      }
    }, 10000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("takaflow_outbox_changed", handleOutboxChange);
    window.addEventListener("takaflow_sync_started", handleSyncStart);
    window.addEventListener("takaflow_sync_finished", handleSyncEnd);
    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    // Initial check if we are online and have outbox items
    if (navigator.onLine && queryClient && getOutbox().length > 0 && !isSyncInProgress) {
      processOutboxSync(queryClient);
    }

    return () => {
      if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
      clearInterval(autoSyncTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("takaflow_outbox_changed", handleOutboxChange);
      window.removeEventListener("takaflow_sync_started", handleSyncStart);
      window.removeEventListener("takaflow_sync_finished", handleSyncEnd);
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [queryClient]);

  return { isOnline, pendingCount, isSyncing };
}
