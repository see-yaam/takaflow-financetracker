import { vi } from "vitest";

/**
 * In-memory stand-in for the Supabase client so unit tests never touch the
 * real backend. Install it in a test file with:
 *
 *   vi.mock("@/integrations/supabase/client", async () => {
 *     const m = await import("./mocks/supabase");
 *     return { supabase: m.supabaseMock.client };
 *   });
 *
 * Replies are queued per "table:op" (op = select | insert | update | upsert | delete).
 * Unqueued calls resolve to { data: [] | null, error: null, status: 200 }.
 */

export type MockReply =
  | { data?: unknown; error?: unknown; status?: number }
  | { throw: unknown }
  | (() => Promise<{ data?: unknown; error?: unknown; status?: number }>);

export interface MockCall {
  table: string;
  op: string;
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
}

export function createSupabaseMock() {
  const replies = new Map<string, MockReply[]>();
  const calls: MockCall[] = [];
  type AuthListener = (event: string, session: { user: { id: string } } | null) => void;
  const authListeners: AuthListener[] = [];
  let sessionUserId: string | null = "user-a";

  const resolveReply = async (key: string, op: string) => {
    const queue = replies.get(key);
    const reply = queue && queue.length ? queue.shift()! : undefined;
    if (!reply) return { data: op === "select" ? [] : null, error: null, status: 200 };
    if (typeof reply === "function") {
      const r = await reply();
      return { data: r.data ?? null, error: r.error ?? null, status: r.status ?? (r.error ? 400 : 200) };
    }
    if ("throw" in reply) throw reply.throw;
    return { data: reply.data ?? null, error: reply.error ?? null, status: reply.status ?? (reply.error ? 400 : 200) };
  };

  function from(table: string) {
    const state: MockCall = { table, op: "select", filters: [] };
    let mutated = false;
    const run = () => {
      calls.push({ ...state, filters: [...state.filters] });
      return resolveReply(`${table}:${state.op}`, state.op);
    };
    const filter =
      (name: string) =>
      (...args: unknown[]) => {
        state.filters.push([name, ...args]);
        return builder;
      };
    const builder = {
      select: () => {
        if (!mutated) state.op = "select";
        return builder;
      },
      insert: (payload: unknown) => {
        state.op = "insert";
        state.payload = payload;
        mutated = true;
        return builder;
      },
      update: (payload: unknown) => {
        state.op = "update";
        state.payload = payload;
        mutated = true;
        return builder;
      },
      upsert: (payload: unknown) => {
        state.op = "upsert";
        state.payload = payload;
        mutated = true;
        return builder;
      },
      delete: () => {
        state.op = "delete";
        mutated = true;
        return builder;
      },
      eq: filter("eq"),
      neq: filter("neq"),
      gt: filter("gt"),
      gte: filter("gte"),
      lt: filter("lt"),
      lte: filter("lte"),
      in: filter("in"),
      is: filter("is"),
      or: filter("or"),
      order: filter("order"),
      limit: filter("limit"),
      single: () => run(),
      maybeSingle: () => run(),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        run().then(onFulfilled, onRejected),
    };
    return builder;
  }

  const auth = {
    getSession: vi.fn(async () => ({
      data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
      error: null,
    })),
    refreshSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    setSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ data: { user: null }, error: null as unknown })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as unknown })),
    onAuthStateChange: vi.fn((cb: AuthListener) => {
      authListeners.push(cb);
      return { data: { subscription: { unsubscribe: vi.fn(() => authListeners.splice(authListeners.indexOf(cb), 1)) } } };
    }),
  };

  const functions = { invoke: vi.fn(async () => ({ data: null, error: null })) };

  return {
    client: { from: vi.fn(from), auth, functions },
    calls,
    reply(key: string, r: MockReply) {
      const q = replies.get(key) ?? [];
      q.push(r);
      replies.set(key, q);
    },
    throwNext(key: string, err: unknown) {
      this.reply(key, { throw: err });
    },
    setSessionUser(uid: string | null) {
      sessionUserId = uid;
    },
    /** Fires an auth event to every onAuthStateChange subscriber. */
    emitAuth(event: string, uid: string | null = sessionUserId) {
      for (const l of [...authListeners]) l(event, uid ? { user: { id: uid } } : null);
    },
    callsTo(table: string, op?: string) {
      return calls.filter((c) => c.table === table && (!op || c.op === op));
    },
    reset() {
      replies.clear();
      calls.length = 0;
      sessionUserId = "user-a";
      auth.getSession.mockClear();
      auth.refreshSession.mockClear();
      auth.setSession.mockClear();
      auth.signOut.mockClear();
      auth.updateUser.mockClear();
      auth.resetPasswordForEmail.mockClear();
      authListeners.length = 0;
      functions.invoke.mockClear();
    },
  };
}

export const supabaseMock = createSupabaseMock();

/** A promise you can resolve later, for holding a request "in flight". */
export function deferred<T = { data?: unknown; error?: unknown; status?: number }>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
