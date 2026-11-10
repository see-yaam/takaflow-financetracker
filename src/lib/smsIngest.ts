import type { ParsedSmsResult } from "@/lib/smsParser";

/*
 * Pure ingest logic for captured SMS / financial notifications (P0-03).
 *
 * Native keeps every captured message until JS acknowledges it. JS records a
 * message by enqueueing a transaction in the durable outbox, and remembers the
 * native id in the same synchronous block. The ack is sent on a LATER pass
 * (>= ACK_DELAY_MS), because Android WebView flushes localStorage to disk
 * lazily: acking immediately could lose a message if the app is killed right
 * after. A replayed native id is never recorded twice.
 *
 * Deduplication across the two native channels (SMS receiver + notification
 * listener) uses a fingerprint that never includes the channel:
 *  - strong: labelled TrxID/TxnId (>= 6 alphanumerics with a digit) => exact match
 *  - weak: provider + type + amount (+ balance) within +/- 3 minutes, and only
 *    when a balance is present or the earlier copy came from the other channel.
 *    Otherwise both entries are kept: a duplicate is visible and deletable,
 *    a missed payment is not.
 */

export interface NativeSmsMessage {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
  source?: "sms" | "notification" | string;
}

export interface RecordedFingerprint {
  key: string;
  strong: boolean;
  hasBalance: boolean;
  ts: number; // message timestamp
  channel: string;
  at: number; // when recorded
}

export interface IngestState {
  /** native id -> when we durably recorded (or deliberately skipped) it */
  recorded: Record<string, { at: number; outcome: "created" | "duplicate" | "unparsed" }>;
  fingerprints: RecordedFingerprint[];
}

export interface PendingTransaction {
  wallet_id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
}

export interface IngestDeps {
  parse: (body: string, sender: string) => ParsedSmsResult | null;
  /** Wallet to record this message in, or null when wallets aren't available yet. */
  matchWallet: (parsed: ParsedSmsResult) => { id: string } | null;
  /** Durably enqueue the transaction (outbox). Must throw if it could not be saved. */
  enqueue: (tx: PendingTransaction) => void;
  loadState: () => IngestState;
  saveState: (state: IngestState) => void;
  recordUnparsed: (msg: NativeSmsMessage) => void;
  formatDate: (timestamp: number) => string;
  now: () => number;
}

export interface IngestResult {
  toAck: string[];
  created: Array<{ source: string; amount: number; type: "income" | "expense" }>;
  duplicates: number;
  unparsed: number;
  failed: number;
}

export const ACK_DELAY_MS = 10_000;
export const WEAK_DEDUPE_WINDOW_MS = 3 * 60_000;
const RECORDED_TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_RECORDED = 2000;
const MAX_FINGERPRINTS = 500;

export function emptyIngestState(): IngestState {
  return { recorded: {}, fingerprints: [] };
}

/** TrxID strong enough to dedupe on: labelled, >= 6 alphanumerics, contains a digit. */
export function strongTrxId(text: string): string | null {
  const m = text.match(/(?:TrxID|TxnId|Txn ID|ট্রানজাকশন আইডি)[:\s]*([A-Za-z0-9]+)/i);
  const id = m?.[1];
  if (!id || id.length < 6 || !/\d/.test(id)) return null;
  return id.toUpperCase();
}

export function smsFingerprint(parsed: ParsedSmsResult, msg: NativeSmsMessage): { key: string; strong: boolean } {
  const provider = (parsed.source || "unknown").toLowerCase();
  const trx = strongTrxId(parsed.rawSms || msg.body);
  if (trx) return { key: `trx:${provider}:${trx}`, strong: true };
  const balance = typeof parsed.balance === "number" ? parsed.balance.toFixed(2) : "-";
  return { key: `amt:${provider}:${parsed.type}:${parsed.amount.toFixed(2)}:${balance}`, strong: false };
}

function isDuplicate(
  fp: { key: string; strong: boolean },
  hasBalance: boolean,
  msg: NativeSmsMessage,
  existing: RecordedFingerprint[]
): boolean {
  const channel = msg.source || "sms";
  return existing.some((e) => {
    if (e.key !== fp.key) return false;
    if (fp.strong) return true;
    if (Math.abs(e.ts - msg.timestamp) > WEAK_DEDUPE_WINDOW_MS) return false;
    return hasBalance || e.channel !== channel;
  });
}

function prune(state: IngestState, now: number): IngestState {
  const recordedEntries = Object.entries(state.recorded)
    .filter(([, v]) => now - v.at < RECORDED_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_RECORDED);
  return {
    recorded: Object.fromEntries(recordedEntries),
    fingerprints: state.fingerprints.filter((f) => now - f.at < RECORDED_TTL_MS).slice(-MAX_FINGERPRINTS),
  };
}

function buildNote(parsed: ParsedSmsResult): string {
  const trx = strongTrxId(parsed.rawSms || "") || parsed.trxId;
  return `Auto: ${parsed.source} ${parsed.merchantOrParty ? `(${parsed.merchantOrParty})` : ""} ${trx ? `Trx: ${trx}` : ""}`
    .replace(/\s+/g, " ")
    .trim();
}

export function processPendingSms(messages: NativeSmsMessage[], deps: IngestDeps): IngestResult {
  const result: IngestResult = { toAck: [], created: [], duplicates: 0, unparsed: 0, failed: 0 };
  let state = prune(deps.loadState(), deps.now());

  for (const msg of messages) {
    if (!msg || !msg.id) continue; // cannot be acknowledged safely: leave it in the native queue

    const already = state.recorded[msg.id];
    if (already) {
      // Durably handled on an earlier pass; acknowledge once that write has had time to reach disk.
      if (deps.now() - already.at >= ACK_DELAY_MS) result.toAck.push(msg.id);
      continue;
    }

    const now = deps.now();
    const parsed = deps.parse(msg.body, msg.sender);
    if (!parsed) {
      // Not a recognisable transaction (or rejected by the anti-scam check): keep a visible record.
      deps.recordUnparsed(msg);
      state = { ...state, recorded: { ...state.recorded, [msg.id]: { at: now, outcome: "unparsed" } } };
      deps.saveState(state);
      result.unparsed++;
      continue;
    }

    const fp = smsFingerprint(parsed, msg);
    const hasBalance = typeof parsed.balance === "number";
    if (isDuplicate(fp, hasBalance, msg, state.fingerprints)) {
      state = { ...state, recorded: { ...state.recorded, [msg.id]: { at: now, outcome: "duplicate" } } };
      deps.saveState(state);
      result.duplicates++;
      continue;
    }

    const wallet = deps.matchWallet(parsed);
    if (!wallet) continue; // wallets not ready: leave it queued natively, retry next pass

    try {
      deps.enqueue({
        wallet_id: wallet.id,
        type: parsed.type,
        amount: parsed.amount,
        category: parsed.categorySuggestion || "Other",
        note: buildNote(parsed),
        date: deps.formatDate(msg.timestamp || now),
      });
    } catch (err) {
      console.error("Could not record captured SMS; it stays queued natively:", err);
      result.failed++;
      continue; // NOT recorded, NOT acked: retried next pass
    }

    // Same synchronous block as the outbox write.
    state = {
      recorded: { ...state.recorded, [msg.id]: { at: now, outcome: "created" } },
      fingerprints: [
        ...state.fingerprints,
        { key: fp.key, strong: fp.strong, hasBalance, ts: msg.timestamp || now, channel: msg.source || "sms", at: now },
      ],
    };
    deps.saveState(state);
    result.created.push({ source: parsed.source, amount: parsed.amount, type: parsed.type });
  }

  return result;
}

// ---------------------------------------------------------------------------
// localStorage-backed stores (preserved across sign-out: TAKAPERSIST_SMS_* prefix)
// ---------------------------------------------------------------------------
export const SMS_INGEST_STATE_KEY = "TAKAPERSIST_SMS_INGEST_V1";
export const SMS_UNPARSED_KEY = "TAKAPERSIST_SMS_UNPARSED_V1";
const MAX_UNPARSED = 100;

export function loadIngestState(): IngestState {
  try {
    const raw = localStorage.getItem(SMS_INGEST_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.recorded && Array.isArray(parsed.fingerprints)) return parsed;
  } catch {
    // corrupt state: start fresh (native ids are still deduped by the outbox/fingerprints)
  }
  return emptyIngestState();
}

export function saveIngestState(state: IngestState): void {
  localStorage.setItem(SMS_INGEST_STATE_KEY, JSON.stringify(state));
}

export interface UnparsedSms {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
  source?: string;
}

export function getUnparsedSms(): UnparsedSms[] {
  try {
    const raw = localStorage.getItem(SMS_UNPARSED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function recordUnparsedSms(msg: NativeSmsMessage): void {
  const list = getUnparsedSms().filter((m) => m.id !== msg.id);
  list.push({ id: msg.id, sender: msg.sender, body: msg.body, timestamp: msg.timestamp, source: msg.source });
  localStorage.setItem(SMS_UNPARSED_KEY, JSON.stringify(list.slice(-MAX_UNPARSED)));
}

export function clearUnparsedSms(): void {
  localStorage.removeItem(SMS_UNPARSED_KEY);
}
