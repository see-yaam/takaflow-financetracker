import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { matchesTxFilters, TxFilterLike } from "@/lib/txFilters";

/*
 * Offline outbox: durable, per-user queue of mutations made while offline (or
 * while the network is flaky).
 *
 * Invariants (P0-01 / P0-02):
 *  - An item is only ever removed when the server confirmed it (or it provably
 *    already exists), or when the user explicitly discards it.
 *  - Permanently rejected items move to status "failed" and stay visible.
 *  - Every write targets one item by id and re-reads storage first, so items
 *    added while a sync is running are never overwritten.
 *  - Items belong to the user who created them (ownerId); a different signed-in
 *    user never syncs or sees them.
 */

export type OutboxActionType =
  | "CREATE_TRANSACTION"
  | "DELETE_TRANSACTION"
  | "REVERSE_TRANSACTION"
  | "CREATE_WALLET"
  | "DELETE_WALLET"
  | "UPDATE_WALLET"
  | "UPDATE_TRANSACTION_CATEGORY"
  | "UPSERT_BUDGET"
  | "CREATE_RECURRING"
  | "DELETE_RECURRING";

export type OutboxStatus = "pending" | "failed";

export interface OutboxTransactionPayload {
  id: string;
  wallet_id: string;
  type: string;
  amount: number;
  category: string;
  note: string | null;
  date: string;
  user_id: string;
  is_reversed?: boolean;
}

export interface OutboxWalletPayload {
  id: string;
  name: string;
  balance: number;
  icon: string;
  currency: string;
  user_id: string;
}

export interface OutboxBudgetPayload {
  user_id: string;
  month: string;
  monthly_budget: number;
}

export interface OutboxRecurringPayload {
  id: string;
  user_id: string;
  wallet_id: string;
  type: string;
  amount: number;
  category: string;
  note: string | null;
  day_of_month: number;
  last_applied_month: string | null;
}

export interface OutboxPayload {
  tempId?: string;
  transaction?: OutboxTransactionPayload;
  wallet?: OutboxWalletPayload;
  id?: string;
  /** UPDATE_WALLET */
  updates?: { name?: string; balance?: number };
  /** UPDATE_TRANSACTION_CATEGORY */
  category?: string;
  budget?: OutboxBudgetPayload;
  recurring?: OutboxRecurringPayload;
}

export interface OutboxItem {
  id: string; // unique outbox item id
  type: OutboxActionType;
  payload: OutboxPayload;
  createdAt: number;
  attempts?: number;
  ownerId?: string;
  status?: OutboxStatus;
  lastError?: string;
  lastErrorCode?: string;
  failedAt?: number;
  nextAttemptAt?: number;
  blockedBy?: string;
}

export interface OutboxStats {
  pending: number;
  failed: number;
  blocked: number;
}

export interface SyncResult extends OutboxStats {
  synced: number;
  newlyFailed: number;
  skipped?: "offline" | "no-session" | "throttled" | "empty";
}

type CachedTx = Partial<OutboxTransactionPayload> & {
  id: string;
  is_reversed?: boolean | null;
  _isOfflinePending?: boolean;
};

type CachedWallet = { id: string; balance: number | string };

const OUTBOX_STORAGE_KEY = "TAKAPERSIST_OUTBOX_V1";
const CACHE_STORAGE_KEY = "TAKAPERSIST_CACHE_V1";
export const OUTBOX_CHANGED_EVENT = "takaflow_outbox_changed";
export const MAX_TRANSIENT_ATTEMPTS = 10;

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

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  name?: unknown;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const e = err as ErrorLike | null;
  if (e && typeof e.message === "string") return e.message;
  return typeof err === "string" ? err : "";
}

/** True when the error means the server was NOT reached (offline, DNS, timeout, aborted fetch). */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (!err) {
    return false;
  }
  const errObj = err as ErrorLike;

  // If PostgREST returned a database error code (e.g. RLS 42501, FK 23503), the server was reached!
  if (typeof errObj.code === "string" && errObj.code.length >= 3) {
    return false;
  }
  const msg = errorMessage(err).toLowerCase();

  return (
    msg.includes("network error") ||
    msg.includes("networkerror") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("connection refused") ||
    msg.includes("net::err") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborterror") ||
    errObj.status === 0
  );
}

export type SyncErrorClass = "ok-exists" | "transient" | "auth" | "permanent";

/**
 * Classifies a failed outbox write.
 *  - ok-exists: unique violation on a client-generated id => the row is already there.
 *  - transient: server not reached, timeout, 408/429/5xx => keep pending, retry later.
 *  - auth: expired/missing session => refresh and retry, never drop.
 *  - permanent: the server understood and rejected the write => mark failed, keep visible.
 */
export function classifySyncError(error: unknown, status?: number): SyncErrorClass {
  const e = (error || {}) as ErrorLike;
  const code = typeof e.code === "string" ? e.code : "";
  const msg = errorMessage(error).toLowerCase();
  const httpStatus = typeof status === "number" ? status : typeof e.status === "number" ? e.status : undefined;

  if (code === "23505") return "ok-exists";
  if (code === "PGRST301" || httpStatus === 401 || msg.includes("jwt expired") || msg.includes("invalid jwt")) {
    return "auth";
  }
  if (isNetworkError(error)) return "transient";
  if (httpStatus === 408 || httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500)) {
    return "transient";
  }
  if (code || (httpStatus !== undefined && httpStatus >= 400)) return "permanent";
  // Unknown thrown error without a code: retry (bounded by MAX_TRANSIENT_ATTEMPTS).
  return "transient";
}

/** Backoff for server-side (5xx/429) failures: 5s, 10s, 20s ... capped at 5 minutes. */
export function nextBackoffMs(attempts: number): number {
  const n = Math.max(1, attempts);
  return Math.min(5000 * 2 ** (n - 1), 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// 1. Storage primitives
// ---------------------------------------------------------------------------
function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function readAll(): OutboxItem[] {
  try {
    const storage = getStorage();
    const raw = storage ? storage.getItem(OUTBOX_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: OutboxItem[]): void {
  const storage = getStorage();
  if (!storage) return;
  // Let quota errors propagate: callers that enqueue must know the write failed.
  storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
  notifyOutboxChanged();
}

export function notifyOutboxChanged(): void {
  if (typeof window === "undefined") return;
  const stats = getOutboxStats();
  window.dispatchEvent(
    new CustomEvent(OUTBOX_CHANGED_EVENT, { detail: { ...stats, count: stats.pending + stats.failed } })
  );
}

// ---------------------------------------------------------------------------
// 2. Ownership (P0-02)
// ---------------------------------------------------------------------------
let ownerOverride: string | null | undefined = undefined;

/** Reads the signed-in user id straight from the persisted Supabase session (works offline, before AuthContext resolves). */
export function readStoredSessionUserId(): string | null {
  const session = readStoredSession();
  return session?.userId ?? null;
}

function readStoredSession(): { userId: string; accessToken?: string; refreshToken?: string } | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const u = parsed?.user || parsed?.currentSession?.user;
        if (u?.id) {
          return {
            userId: u.id,
            accessToken: parsed?.access_token || parsed?.currentSession?.access_token,
            refreshToken: parsed?.refresh_token || parsed?.currentSession?.refresh_token,
          };
        }
      }
    }
  } catch {
    // corrupt session blob: treat as signed out
  }
  return null;
}

export function currentOwner(): string | null {
  if (ownerOverride !== undefined) return ownerOverride;
  return readStoredSessionUserId();
}

function itemOwner(item: OutboxItem): string | null {
  return (
    item.ownerId ??
    item.payload?.transaction?.user_id ??
    item.payload?.wallet?.user_id ??
    item.payload?.budget?.user_id ??
    item.payload?.recurring?.user_id ??
    null
  );
}

function belongsTo(item: OutboxItem, uid: string | null): boolean {
  if (!uid) return false;
  const owner = itemOwner(item);
  // Legacy items without any owner info (pre-1.0.8 DELETE/REVERSE) are adopted
  // by whoever signs in first; RLS limits their effect to that user's rows.
  return owner === uid || owner === null;
}

/**
 * Called by AuthContext whenever the session user changes. Stamps legacy
 * (pre-ownership) items with their owner so they stay isolated per account.
 */
export function setOutboxOwner(uid: string | null): void {
  ownerOverride = uid;
  if (!uid) {
    notifyOutboxChanged();
    return;
  }
  const items = readAll();
  let changed = false;
  for (const item of items) {
    if (!item.ownerId && belongsTo(item, uid)) {
      item.ownerId = uid;
      changed = true;
    }
  }
  if (changed) {
    writeAll(items);
  } else {
    notifyOutboxChanged();
  }
}

// ---------------------------------------------------------------------------
// 3. Queue API (all writes are id-based read-modify-write)
// ---------------------------------------------------------------------------

/** Items owned by the current user (pending and failed). */
export function getOutbox(): OutboxItem[] {
  const uid = currentOwner();
  return readAll().filter((i) => belongsTo(i, uid));
}

export function getOutboxFor(uid: string): OutboxItem[] {
  return readAll().filter((i) => belongsTo(i, uid));
}

export function getOutboxStats(): OutboxStats {
  const items = getOutbox();
  let pending = 0;
  let failed = 0;
  let blocked = 0;
  for (const i of items) {
    if (i.status === "failed") failed++;
    else {
      pending++;
      if (i.blockedBy) blocked++;
    }
  }
  return { pending, failed, blocked };
}

export function addToOutbox(type: OutboxActionType, payload: OutboxPayload, ownerId: string | null = currentOwner()): OutboxItem {
  const items = readAll();
  const newItem: OutboxItem = {
    id: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: Date.now(),
    status: "pending",
    ...(ownerId ? { ownerId } : {}),
  };
  items.push(newItem);
  writeAll(items);
  return newItem;
}

export function updateOutboxItem(id: string, patch: Partial<OutboxItem>): void {
  const items = readAll();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  items[idx] = { ...items[idx], ...patch };
  writeAll(items);
}

export function removeFromOutbox(id: string): void {
  const items = readAll();
  const next = items.filter((i) => i.id !== id);
  if (next.length !== items.length) writeAll(next);
}

/** Explicit user action only (Sync Issues dialog). */
export function discardOutboxItems(ids: string[]): void {
  const drop = new Set(ids);
  const items = readAll();
  const next = items.filter((i) => !drop.has(i.id));
  if (next.length !== items.length) writeAll(next);
}

/** Explicit user action only ("Discard offline changes & sign out", account reset). */
export function discardOwnerOutbox(uid: string): void {
  const items = readAll();
  const next = items.filter((i) => !belongsTo(i, uid));
  if (next.length !== items.length) writeAll(next);
}

/** Moves failed items back to pending so the next (forced) sync retries them. */
export function retryOutboxItems(ids: string[]): void {
  const retry = new Set(ids);
  const items = readAll();
  let changed = false;
  for (const item of items) {
    if (retry.has(item.id)) {
      item.status = "pending";
      item.attempts = 0;
      delete item.nextAttemptAt;
      delete item.failedAt;
      changed = true;
    }
  }
  if (changed) writeAll(items);
}

/** The queued CREATE for an optimistic entity id (transaction or wallet), if any. */
export function findQueuedCreate(entityId: string, type?: "CREATE_TRANSACTION" | "CREATE_WALLET"): OutboxItem | undefined {
  return getOutbox().find(
    (i) =>
      (type ? i.type === type : i.type === "CREATE_TRANSACTION" || i.type === "CREATE_WALLET") &&
      i.payload?.tempId === entityId
  );
}

let inFlightItemId: string | null = null;

/** True while processOutboxSync is sending this exact item to the server. */
export function isInFlight(itemId: string): boolean {
  return inFlightItemId === itemId;
}

/** Removes only the persisted query cache (server data, re-fetchable). Never touches the outbox. */
export function clearOfflineCache(): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(CACHE_STORAGE_KEY);
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

// ---------------------------------------------------------------------------
// 4. Optimistic offline actions
// ---------------------------------------------------------------------------
function triggerSync(qc: QueryClient) {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    processOutboxSync(qc).catch((err) => console.error("Background outbox sync failed:", err));
  }
}

function adjustWalletBalance(qc: QueryClient, walletId: string, delta: number) {
  qc.setQueriesData<CachedWallet[]>({ queryKey: ["wallets"] }, (oldWallets) => {
    if (!Array.isArray(oldWallets)) return oldWallets;
    return oldWallets.map((w) => (w.id === walletId ? { ...w, balance: Number(w.balance) + delta } : w));
  });
}

function findCachedTransaction(qc: QueryClient, id: string): CachedTx | undefined {
  for (const [, txs] of qc.getQueriesData<CachedTx[]>({ queryKey: ["transactions"] })) {
    if (Array.isArray(txs)) {
      const found = txs.find((t) => t.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

export function handleOfflineCreateTransaction(
  tx: { wallet_id: string; type: string; amount: number; category: string; note?: string; date?: string },
  userId: string,
  qc: QueryClient,
  opts: { skipSync?: boolean } = {}
) {
  const tempId = generateUUID();
  const now = new Date().toISOString();
  const date = tx.date || now.slice(0, 10);

  const transaction: OutboxTransactionPayload = {
    id: tempId,
    wallet_id: tx.wallet_id,
    type: tx.type,
    amount: Number(tx.amount),
    category: tx.category,
    note: tx.note || null,
    date,
    user_id: userId,
  };

  // 1. Durable first: if this throws (storage full), nothing is shown as saved.
  addToOutbox("CREATE_TRANSACTION", { tempId, transaction }, userId);

  const optimisticTx = { ...transaction, created_at: now, is_reversed: false, _isOfflinePending: true };

  // 2. Optimistically update local ["transactions"] queries
  // Only into ["transactions", uid, filters] queries the row actually belongs to.
  for (const [key, oldData] of qc.getQueriesData<CachedTx[]>({ queryKey: ["transactions"] })) {
    const filters = (key as unknown[])[2] as TxFilterLike | undefined;
    if (!matchesTxFilters(optimisticTx, filters)) continue;
    qc.setQueryData(key, Array.isArray(oldData) ? [optimisticTx, ...oldData] : [optimisticTx]);
  }

  // 3. Optimistically update local ["wallets"] balance
  adjustWalletBalance(qc, tx.wallet_id, tx.type === "income" ? Number(tx.amount) : -Number(tx.amount));

  if (!opts.skipSync) triggerSync(qc);

  return optimisticTx;
}

export function handleOfflineDeleteTransaction(id: string, qc: QueryClient) {
  const queuedCreate = findQueuedCreate(id, "CREATE_TRANSACTION");
  let targetTx: CachedTx | undefined = queuedCreate?.payload?.transaction;

  if (queuedCreate && !isInFlight(queuedCreate.id)) {
    // Never reached the server: cancelling the queued create is enough.
    removeFromOutbox(queuedCreate.id);
  } else {
    // Already on the server, or being sent right now: delete it there too.
    addToOutbox("DELETE_TRANSACTION", { id });
  }

  if (!targetTx) targetTx = findCachedTransaction(qc, id);

  // Restore wallet balance locally
  if (targetTx && !targetTx.is_reversed && targetTx.wallet_id) {
    const delta = targetTx.type === "income" ? -Number(targetTx.amount) : Number(targetTx.amount);
    adjustWalletBalance(qc, targetTx.wallet_id, delta);
  }

  qc.setQueriesData<CachedTx[]>({ queryKey: ["transactions"] }, (oldData) => {
    if (!Array.isArray(oldData)) return oldData;
    return oldData.filter((t) => t.id !== id);
  });

  triggerSync(qc);
}

export function handleOfflineReverseTransaction(id: string, qc: QueryClient) {
  const queuedCreate = findQueuedCreate(id, "CREATE_TRANSACTION");
  const target: CachedTx | undefined = findCachedTransaction(qc, id) ?? queuedCreate?.payload?.transaction;

  if (target?.is_reversed) return;

  if (queuedCreate && !isInFlight(queuedCreate.id) && queuedCreate.payload.transaction) {
    // Insert it already-reversed; the insert trigger then skips the balance change.
    updateOutboxItem(queuedCreate.id, {
      payload: { ...queuedCreate.payload, transaction: { ...queuedCreate.payload.transaction, is_reversed: true } },
    });
  } else {
    addToOutbox("REVERSE_TRANSACTION", { id });
  }

  if (target && target.wallet_id) {
    const delta = target.type === "income" ? -Number(target.amount) : Number(target.amount);
    adjustWalletBalance(qc, target.wallet_id, delta);
  }

  qc.setQueriesData<CachedTx[]>({ queryKey: ["transactions"] }, (oldData) => {
    if (!Array.isArray(oldData)) return oldData;
    return oldData.map((t) => (t.id === id ? { ...t, is_reversed: true } : t));
  });

  triggerSync(qc);
}

export function handleOfflineCreateWallet(
  wallet: { name: string; balance: number; icon?: string; currency?: string },
  userId: string,
  qc: QueryClient
) {
  const tempId = generateUUID();
  const now = new Date().toISOString();

  const walletPayload: OutboxWalletPayload = {
    id: tempId,
    name: wallet.name,
    balance: Number(wallet.balance) || 0,
    icon: wallet.icon || "wallet",
    currency: wallet.currency || "BDT",
    user_id: userId,
  };

  addToOutbox("CREATE_WALLET", { tempId, wallet: walletPayload }, userId);

  const optimisticWallet = { ...walletPayload, created_at: now, _isOfflinePending: true };

  qc.setQueriesData<CachedWallet[]>({ queryKey: ["wallets"] }, (oldData) => {
    if (!Array.isArray(oldData)) return [optimisticWallet];
    return [...oldData, optimisticWallet];
  });

  triggerSync(qc);

  return optimisticWallet;
}

export function handleOfflineDeleteWallet(id: string, qc: QueryClient) {
  const queuedCreate = findQueuedCreate(id, "CREATE_WALLET");

  if (queuedCreate && !isInFlight(queuedCreate.id)) {
    // The wallet never reached the server. Mirror the server's ON DELETE CASCADE:
    // its queued (not in-flight) transactions go with it.
    const dependents = getOutbox()
      .filter((i) => i.type === "CREATE_TRANSACTION" && i.payload?.transaction?.wallet_id === id && !isInFlight(i.id))
      .map((i) => i.id);
    discardOutboxItems([queuedCreate.id, ...dependents]);
  } else {
    addToOutbox("DELETE_WALLET", { id });
  }

  // Optimistically remove from all local wallet queries
  qc.setQueriesData<CachedWallet[]>({ queryKey: ["wallets"] }, (oldWallets) => {
    if (!Array.isArray(oldWallets)) return [];
    return oldWallets.filter((w) => w.id !== id);
  });

  // Also remove transactions belonging to this wallet from cache
  qc.setQueriesData<CachedTx[]>({ queryKey: ["transactions"] }, (oldData) => {
    if (!Array.isArray(oldData)) return [];
    return oldData.filter((t) => t.wallet_id !== id);
  });

  triggerSync(qc);
}

/** Wallet rename / balance edit made offline (or when the network failed). */
export function handleOfflineUpdateWallet(id: string, updates: { name?: string; balance?: number }, qc: QueryClient) {
  const queuedCreate = findQueuedCreate(id, "CREATE_WALLET");
  if (queuedCreate?.payload.wallet && !isInFlight(queuedCreate.id)) {
    updateOutboxItem(queuedCreate.id, { payload: { ...queuedCreate.payload, wallet: { ...queuedCreate.payload.wallet, ...updates } } });
  } else {
    addToOutbox("UPDATE_WALLET", { id, updates });
  }
  qc.setQueriesData<CachedWallet[]>({ queryKey: ["wallets"] }, (old) =>
    Array.isArray(old) ? old.map((w) => (w.id === id ? { ...w, ...updates } : w)) : old
  );
  triggerSync(qc);
}

/** Recategorize a transaction offline (patches a still-queued create in place). */
export function handleOfflineUpdateCategory(id: string, category: string, qc: QueryClient) {
  const queuedCreate = findQueuedCreate(id, "CREATE_TRANSACTION");
  if (queuedCreate?.payload.transaction && !isInFlight(queuedCreate.id)) {
    updateOutboxItem(queuedCreate.id, {
      payload: { ...queuedCreate.payload, transaction: { ...queuedCreate.payload.transaction, category } },
    });
  } else {
    addToOutbox("UPDATE_TRANSACTION_CATEGORY", { id, category });
  }
  qc.setQueriesData<CachedTx[]>({ queryKey: ["transactions"] }, (old) =>
    Array.isArray(old) ? old.map((t) => (t.id === id ? { ...t, category } : t)) : old
  );
  triggerSync(qc);
}

export function handleOfflineUpsertBudget(budget: OutboxBudgetPayload, qc: QueryClient) {
  // Only the latest budget for a month matters: replace an older queued one.
  const older = getOutbox().filter(
    (i) => i.type === "UPSERT_BUDGET" && i.payload.budget?.month === budget.month && !isInFlight(i.id)
  );
  if (older.length) discardOutboxItems(older.map((i) => i.id));
  addToOutbox("UPSERT_BUDGET", { budget }, budget.user_id);
  qc.setQueriesData({ queryKey: ["budget_goal"] }, (old: unknown) =>
    old && typeof old === "object" && (old as { month?: string }).month === budget.month ? { ...(old as object), ...budget } : old
  );
  triggerSync(qc);
}

export function handleOfflineCreateRecurring(rule: Omit<OutboxRecurringPayload, "id">, qc: QueryClient) {
  const recurring: OutboxRecurringPayload = { ...rule, id: generateUUID() };
  addToOutbox("CREATE_RECURRING", { tempId: recurring.id, recurring }, rule.user_id);
  qc.setQueriesData({ queryKey: ["recurring_transactions"] }, (old: unknown) =>
    Array.isArray(old) ? [...old, { ...recurring, _isOfflinePending: true }] : old
  );
  triggerSync(qc);
  return recurring;
}

export function handleOfflineDeleteRecurring(id: string, qc: QueryClient) {
  const queued = getOutbox().find((i) => i.type === "CREATE_RECURRING" && i.payload.tempId === id);
  if (queued && !isInFlight(queued.id)) removeFromOutbox(queued.id);
  else addToOutbox("DELETE_RECURRING", { id });
  qc.setQueriesData({ queryKey: ["recurring_transactions"] }, (old: unknown) =>
    Array.isArray(old) ? old.filter((r: { id: string }) => r.id !== id) : old
  );
  triggerSync(qc);
}

// Helper to guarantee Supabase network calls never hang indefinitely
function withTimeout<T>(promise: PromiseLike<T>, ms = 10000): Promise<T> {
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

// ---------------------------------------------------------------------------
// 5. Background sync processor
// ---------------------------------------------------------------------------
let inflight: Promise<SyncResult> | null = null;
let lastSyncAttemptTime = 0;
const MIN_SYNC_INTERVAL_MS = 2000;

/** Test-only: resets module-level sync state between tests. */
export function __resetSyncStateForTests(): void {
  inflight = null;
  lastSyncAttemptTime = 0;
  inFlightItemId = null;
  ownerOverride = undefined;
}

export function isSyncRunning(): boolean {
  return inflight !== null;
}

function emptyResult(skipped?: SyncResult["skipped"]): SyncResult {
  return { synced: 0, newlyFailed: 0, ...getOutboxStats(), ...(skipped ? { skipped } : {}) };
}

function isDue(item: OutboxItem, now: number, force: boolean): boolean {
  if (item.status === "failed") return false;
  return force || !item.nextAttemptAt || item.nextAttemptAt <= now;
}

export async function processOutboxSync(
  queryClient: QueryClient,
  opts: { force?: boolean } | boolean = {}
): Promise<SyncResult> {
  if (typeof window === "undefined") return emptyResult();
  const force = typeof opts === "boolean" ? opts : !!opts.force;

  if (inflight) {
    if (!force) return inflight;
    // A forced sync waits for the running pass, then runs one more (never concurrently).
    try {
      await inflight;
    } catch {
      // the previous pass already reported its own failure
    }
    if (inflight) return inflight;
  }

  const now = Date.now();
  if (!force && now - lastSyncAttemptTime < MIN_SYNC_INTERVAL_MS) {
    return emptyResult("throttled");
  }
  lastSyncAttemptTime = now;

  if (typeof navigator !== "undefined" && !navigator.onLine) return emptyResult("offline");
  if (!getOutbox().some((i) => isDue(i, now, force))) return emptyResult("empty");

  inflight = runSyncPass(queryClient, force);
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

type ItemOutcome =
  | { kind: "ok" }
  | { kind: "blocked"; by: string }
  | { kind: "error"; cls: Exclude<SyncErrorClass, "ok-exists">; error: unknown; status?: number };

interface SyncContext {
  uid: string;
  walletsFetchOk: boolean;
  cloudWalletIds: string[];
  tempIdMap: Map<string, string>;
}

async function resolveSessionUserId(): Promise<string | null> {
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 10000);
    if (data?.session?.user?.id) return data.session.user.id;
  } catch (e) {
    console.warn("Could not retrieve local session for sync:", e);
  }
  // Fallback: recover the persisted session so RLS sees the right user.
  const stored = readStoredSession();
  if (stored?.accessToken && stored?.refreshToken) {
    try {
      const { data } = await withTimeout(
        supabase.auth.setSession({ access_token: stored.accessToken, refresh_token: stored.refreshToken }),
        10000
      );
      if (data?.session?.user?.id) return data.session.user.id;
    } catch (setErr) {
      console.warn("Failed to set recovered session on supabase client:", setErr);
    }
  }
  return null;
}

function rank(type: OutboxActionType): number {
  if (type === "CREATE_WALLET") return 1;
  if (type === "CREATE_TRANSACTION") return 2;
  return 3;
}

function failureFromResponse(res: { error: unknown; status?: number }, isCreate: boolean): ItemOutcome {
  if (!res.error) return { kind: "ok" };
  const cls = classifySyncError(res.error, res.status);
  if (cls === "ok-exists") {
    // Client-generated ids: a unique violation on a create means it already landed.
    return isCreate ? { kind: "ok" } : { kind: "error", cls: "permanent", error: res.error, status: res.status };
  }
  return { kind: "error", cls, error: res.error, status: res.status };
}

async function syncOne(item: OutboxItem, ctx: SyncContext): Promise<ItemOutcome> {
  try {
    switch (item.type) {
      case "CREATE_WALLET": {
        const source = item.payload.wallet;
        if (!source) return { kind: "error", cls: "permanent", error: new Error("Malformed wallet item") };
        const wallet = { ...source, user_id: source.user_id || ctx.uid };
        if (!wallet.id || wallet.id.startsWith("offline_")) wallet.id = generateUUID();
        const res = await withTimeout(supabase.from("wallets").insert(wallet), 20000);
        const outcome = failureFromResponse(res, true);
        if (outcome.kind === "ok") {
          if (item.payload.tempId) ctx.tempIdMap.set(item.payload.tempId, wallet.id);
          ctx.cloudWalletIds.push(wallet.id);
        }
        return outcome;
      }
      case "CREATE_TRANSACTION": {
        const source = item.payload.transaction;
        if (!source) return { kind: "error", cls: "permanent", error: new Error("Malformed transaction item") };
        const payload: OutboxTransactionPayload = { ...source, user_id: source.user_id || ctx.uid };
        delete (payload as Partial<CachedTx>)._isOfflinePending;

        if (payload.wallet_id && ctx.tempIdMap.has(payload.wallet_id)) {
          payload.wallet_id = ctx.tempIdMap.get(payload.wallet_id) as string;
        } else {
          const walletCreate = getOutboxFor(ctx.uid).find(
            (i) => i.type === "CREATE_WALLET" && i.payload?.tempId === payload.wallet_id
          );
          if (walletCreate) {
            // Its wallet has not reached the server yet (pending or failed): wait, never reassign.
            return { kind: "blocked", by: walletCreate.id };
          }
          if (!payload.wallet_id || payload.wallet_id.startsWith("offline_")) {
            // Legacy (pre-UUID) items only: map to a known cloud wallet when we reliably know one.
            if (ctx.walletsFetchOk && ctx.cloudWalletIds.length > 0) {
              payload.wallet_id = ctx.cloudWalletIds[0];
            } else {
              return { kind: "blocked", by: "wallet-unavailable" };
            }
          }
        }

        if (!payload.id || payload.id.startsWith("offline_")) payload.id = generateUUID();

        const res = await withTimeout(supabase.from("transactions").insert(payload), 20000);
        return failureFromResponse(res, true);
      }
      case "DELETE_TRANSACTION":
      case "REVERSE_TRANSACTION":
      case "DELETE_WALLET": {
        const id = item.payload?.id;
        if (typeof id !== "string" || !id) {
          return { kind: "error", cls: "permanent", error: new Error("Malformed outbox item") };
        }
        if (id.startsWith("offline_")) return { kind: "ok" }; // legacy local-only id
        const res =
          item.type === "DELETE_TRANSACTION"
            ? await withTimeout(supabase.from("transactions").delete().eq("id", id), 20000)
            : item.type === "REVERSE_TRANSACTION"
            ? await withTimeout(supabase.from("transactions").update({ is_reversed: true }).eq("id", id), 20000)
            : await withTimeout(supabase.from("wallets").delete().eq("id", id), 20000);
        return failureFromResponse(res, false);
      }
      case "UPDATE_WALLET": {
        const id = item.payload?.id;
        if (!id || !item.payload.updates) return { kind: "error", cls: "permanent", error: new Error("Malformed wallet update") };
        const res = await withTimeout(supabase.from("wallets").update(item.payload.updates).eq("id", id), 20000);
        return failureFromResponse(res, false);
      }
      case "UPDATE_TRANSACTION_CATEGORY": {
        const id = item.payload?.id;
        const category = item.payload?.category;
        if (!id || !category) return { kind: "error", cls: "permanent", error: new Error("Malformed category update") };
        const res = await withTimeout(supabase.from("transactions").update({ category }).eq("id", id), 20000);
        return failureFromResponse(res, false);
      }
      case "UPSERT_BUDGET": {
        const budget = item.payload?.budget;
        if (!budget) return { kind: "error", cls: "permanent", error: new Error("Malformed budget item") };
        const res = await withTimeout(
          supabase.from("budget_goals").upsert({ ...budget, user_id: budget.user_id || ctx.uid }, { onConflict: "user_id,month" }),
          20000
        );
        return failureFromResponse(res, false);
      }
      case "CREATE_RECURRING": {
        const rule = item.payload?.recurring;
        if (!rule) return { kind: "error", cls: "permanent", error: new Error("Malformed recurring item") };
        const walletId = ctx.tempIdMap.get(rule.wallet_id) ?? rule.wallet_id;
        const walletCreate = getOutboxFor(ctx.uid).find((i) => i.type === "CREATE_WALLET" && i.payload?.tempId === walletId);
        if (walletCreate) return { kind: "blocked", by: walletCreate.id };
        const res = await withTimeout(
          supabase.from("recurring_transactions").insert({ ...rule, wallet_id: walletId, user_id: rule.user_id || ctx.uid }),
          20000
        );
        return failureFromResponse(res, true);
      }
      case "DELETE_RECURRING": {
        const id = item.payload?.id;
        if (!id) return { kind: "error", cls: "permanent", error: new Error("Malformed recurring delete") };
        const res = await withTimeout(supabase.from("recurring_transactions").delete().eq("id", id), 20000);
        return failureFromResponse(res, false);
      }
      default:
        return { kind: "error", cls: "permanent", error: new Error(`Unknown outbox action ${String(item.type)}`) };
    }
  } catch (err) {
    const cls = classifySyncError(err);
    return { kind: "error", cls: cls === "ok-exists" ? "permanent" : cls, error: err };
  }
}

function describeError(err: unknown, status?: number): { message: string; code?: string } {
  const e = (err || {}) as ErrorLike;
  const code = typeof e.code === "string" && e.code ? e.code : status ? `HTTP ${status}` : undefined;
  return { message: errorMessage(err) || "Unknown error", ...(code ? { code } : {}) };
}

async function runSyncPass(queryClient: QueryClient, force: boolean): Promise<SyncResult> {
  window.dispatchEvent(new CustomEvent("takaflow_sync_started"));
  let synced = 0;
  let newlyFailed = 0;
  let skipped: SyncResult["skipped"];

  try {
    const uid = await resolveSessionUserId();
    if (!uid) {
      // RLS would reject everything; keep the queue intact until the user signs in.
      skipped = "no-session";
      return { synced, newlyFailed, ...getOutboxStats(), skipped };
    }

    const ctx: SyncContext = { uid, walletsFetchOk: false, cloudWalletIds: [], tempIdMap: new Map() };
    try {
      const { data, error } = await withTimeout(supabase.from("wallets").select("id"), 10000);
      if (!error && Array.isArray(data)) {
        ctx.walletsFetchOk = true;
        ctx.cloudWalletIds = data.map((w: { id: string }) => w.id);
      }
    } catch {
      // wallet list is only needed for legacy remapping; items stay pending if unknown
    }

    const startedAt = Date.now();
    const order = getOutboxFor(uid)
      .filter((i) => isDue(i, startedAt, force))
      .sort((a, b) => rank(a.type) - rank(b.type) || a.createdAt - b.createdAt)
      .map((i) => i.id);

    let refreshedSession = false;

    for (const itemId of order) {
      // Re-read: the item may have been cancelled or edited while we were syncing others.
      const item = getOutboxFor(uid).find((i) => i.id === itemId);
      if (!item || item.status === "failed") continue;

      inFlightItemId = item.id;
      const outcome = await syncOne(item, ctx);
      inFlightItemId = null;

      if (outcome.kind === "ok") {
        removeFromOutbox(item.id);
        synced++;
        continue;
      }

      if (outcome.kind === "blocked") {
        if (item.blockedBy !== outcome.by) updateOutboxItem(item.id, { blockedBy: outcome.by });
        continue;
      }

      const { message, code } = describeError(outcome.error, outcome.status);

      if (outcome.cls === "permanent") {
        updateOutboxItem(item.id, {
          status: "failed",
          lastError: message,
          lastErrorCode: code,
          failedAt: Date.now(),
          blockedBy: undefined,
        });
        newlyFailed++;
        continue;
      }

      if (outcome.cls === "auth") {
        updateOutboxItem(item.id, { lastError: message, lastErrorCode: code });
        if (!refreshedSession) {
          refreshedSession = true;
          try {
            await withTimeout(supabase.auth.refreshSession(), 10000);
          } catch {
            // still signed out / offline: try again next pass
          }
        }
        break; // keep order; retry the whole queue with a fresh token next pass
      }

      // transient
      const attempts = (item.attempts || 0) + 1;
      const serverSide = typeof outcome.status === "number" && (outcome.status === 429 || outcome.status >= 500);
      if (attempts >= MAX_TRANSIENT_ATTEMPTS) {
        updateOutboxItem(item.id, {
          attempts,
          status: "failed",
          lastError: `Server kept failing after ${attempts} attempts: ${message}`,
          lastErrorCode: code,
          failedAt: Date.now(),
          blockedBy: undefined,
        });
        newlyFailed++;
        continue;
      }
      updateOutboxItem(item.id, {
        attempts,
        lastError: message,
        lastErrorCode: code,
        ...(serverSide ? { nextAttemptAt: Date.now() + nextBackoffMs(attempts) } : {}),
      });
      break; // server unreachable or struggling: stop here to preserve ordering
    }
  } catch (globalSyncErr) {
    console.error("Outbox sync pass aborted (queue left intact):", globalSyncErr);
  } finally {
    inFlightItemId = null;
    window.dispatchEvent(new CustomEvent("takaflow_sync_finished", { detail: { syncedCount: synced } }));
  }

  if (synced > 0) {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["wallets"] });
    queryClient.invalidateQueries({ queryKey: ["debts"] });
    queryClient.invalidateQueries({ queryKey: ["budget_goal"] });
    queryClient.invalidateQueries({ queryKey: ["recurring_transactions"] });
    toast.success(`Synced ${synced} offline ${synced === 1 ? "change" : "changes"} with cloud! ☁️✨`);
  }
  if (newlyFailed > 0) {
    toast.error(
      `${newlyFailed} offline ${newlyFailed === 1 ? "change" : "changes"} couldn't sync. Tap the sync badge to review.`,
      { id: "outbox_failed_toast", duration: 8000 }
    );
  }

  return { synced, newlyFailed, ...getOutboxStats(), ...(skipped ? { skipped } : {}) };
}

// ---------------------------------------------------------------------------
// 6. React hooks
// ---------------------------------------------------------------------------

/** All automatic sync triggers. Mount exactly once (AuthProvider). */
export function useOutboxAutoSync(queryClient: QueryClient, userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;

    const maybeSync = () => {
      if (typeof navigator !== "undefined" && navigator.onLine && getOutboxStats().pending > 0) {
        processOutboxSync(queryClient).catch((err) => console.error("Auto sync failed:", err));
      }
    };
    const handleVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") maybeSync();
    };

    window.addEventListener("online", maybeSync);
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    const timer = setInterval(maybeSync, 10000);

    // Replay anything queued for this user as soon as they are signed in.
    maybeSync();

    return () => {
      window.removeEventListener("online", maybeSync);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
      clearInterval(timer);
    };
  }, [queryClient, userId]);
}

/** Read-only status for UI (badge, dialogs). Does not trigger syncs. */
export function useOfflineSyncStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [stats, setStats] = useState<OutboxStats>(() => getOutboxStats());
  const [isSyncing, setIsSyncing] = useState<boolean>(() => isSyncRunning());

  useEffect(() => {
    let syncSafetyTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const refresh = () => setStats(getOutboxStats());
    const handleStorage = (e: StorageEvent) => {
      if (e.key === OUTBOX_STORAGE_KEY || e.key === null) refresh(); // another tab changed the queue
    };
    const handleSyncStart = () => {
      setIsSyncing(true);
      if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
      // Failsafe: never show a spinner longer than 30 seconds
      syncSafetyTimer = setTimeout(() => setIsSyncing(false), 30000);
    };
    const handleSyncEnd = () => {
      if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
      setIsSyncing(false);
      refresh();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("takaflow_sync_started", handleSyncStart);
    window.addEventListener("takaflow_sync_finished", handleSyncEnd);
    refresh();

    return () => {
      if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("takaflow_sync_started", handleSyncStart);
      window.removeEventListener("takaflow_sync_finished", handleSyncEnd);
    };
  }, []);

  return {
    isOnline,
    pendingCount: stats.pending,
    failedCount: stats.failed,
    blockedCount: stats.blocked,
    isSyncing,
  };
}
