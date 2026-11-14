import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseBangladeshFinancialSms, isOfficialFinancialSender } from "@/lib/smsParser";
import {
  ACK_DELAY_MS,
  IngestDeps,
  IngestState,
  NativeSmsMessage,
  PendingTransaction,
  emptyIngestState,
  processPendingSms,
  smsFingerprint,
  strongTrxId,
} from "@/lib/smsIngest";

const BKASH_RECEIVED =
  "You have received Tk 1,500.00 from 01711000000. Fee Tk 0.00. Balance Tk 4,500.00. TrxID 9K48FL29XY at 10/11/2026 14:30";
const RECHARGE_NO_BALANCE = "Mobile recharge of Tk 50.00 to 01811000000 successful.";

function harness() {
  let state: IngestState = emptyIngestState();
  let clock = 1_000_000;
  const enqueued: PendingTransaction[] = [];
  const unparsed: NativeSmsMessage[] = [];
  const deps: IngestDeps = {
    parse: (body, sender) => parseBangladeshFinancialSms(body, sender),
    matchWallet: () => ({ id: "wallet-bkash" }),
    enqueue: (tx) => {
      enqueued.push(tx);
    },
    loadState: () => state,
    saveState: (s) => {
      state = JSON.parse(JSON.stringify(s));
    },
    recordUnparsed: (m) => unparsed.push(m),
    formatDate: () => "2026-11-10",
    now: () => clock,
  };
  return {
    deps,
    enqueued,
    unparsed,
    advance: (ms: number) => (clock += ms),
    get state() {
      return state;
    },
  };
}

const msg = (id: string, body: string, sender = "bKash", source = "sms", timestamp = 1_000_000): NativeSmsMessage => ({
  id,
  body,
  sender,
  source,
  timestamp,
});

describe("processPendingSms (two-phase native handoff)", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("records a message once and acknowledges it only on a later pass", () => {
    const m = msg("n1", BKASH_RECEIVED);
    const first = processPendingSms([m], h.deps);
    expect(h.enqueued).toHaveLength(1);
    expect(first.created).toHaveLength(1);
    expect(first.toAck).toEqual([]); // not yet: localStorage may not be on disk

    h.advance(ACK_DELAY_MS);
    const second = processPendingSms([m], h.deps); // native still returns it
    expect(second.toAck).toEqual(["n1"]);
    expect(h.enqueued).toHaveLength(1); // replay never records twice
  });

  it("logs a single entry when the SMS and its notification both arrive", () => {
    processPendingSms(
      [msg("sms-1", BKASH_RECEIVED, "bKash", "sms"), msg("notif-1", BKASH_RECEIVED, "bKash", "notification", 1_030_000)],
      h.deps
    );
    expect(h.enqueued).toHaveLength(1);
  });

  it("keeps two genuine identical payments that have no TrxID or balance", () => {
    const res = processPendingSms(
      [msg("a", RECHARGE_NO_BALANCE, "bKash", "sms"), msg("b", RECHARGE_NO_BALANCE, "bKash", "sms", 1_060_000)],
      h.deps
    );
    expect(res.created).toHaveLength(2);
    expect(h.enqueued).toHaveLength(2);
  });

  it("dedupes a balance-carrying copy across channels without a TrxID", () => {
    const body = "Cash In Tk 500.00 from 01711000000 successful. Balance Tk 2,000.00";
    processPendingSms([msg("s", body, "bKash", "sms"), msg("n", body, "bKash", "notification", 1_090_000)], h.deps);
    expect(h.enqueued).toHaveLength(1);
  });

  it("never acknowledges a message whose save failed", () => {
    h.deps.enqueue = () => {
      throw new Error("QuotaExceededError");
    };
    const m = msg("n1", BKASH_RECEIVED);
    const res = processPendingSms([m], h.deps);
    expect(res.failed).toBe(1);
    h.advance(ACK_DELAY_MS * 2);
    expect(processPendingSms([m], h.deps).toAck).toEqual([]);
  });

  it("leaves messages queued while wallets are not available", () => {
    h.deps.matchWallet = () => null;
    const m = msg("n1", BKASH_RECEIVED);
    processPendingSms([m], h.deps);
    h.advance(ACK_DELAY_MS * 2);
    expect(processPendingSms([m], h.deps).toAck).toEqual([]);
    expect(h.enqueued).toHaveLength(0);
  });

  it("records unreadable or rejected messages visibly before acknowledging them", () => {
    const scam = msg("x", BKASH_RECEIVED, "01712345678");
    const res = processPendingSms([scam], h.deps);
    expect(res.unparsed).toBe(1);
    expect(h.unparsed.map((m) => m.id)).toEqual(["x"]);
    expect(h.enqueued).toHaveLength(0);
    h.advance(ACK_DELAY_MS);
    expect(processPendingSms([scam], h.deps).toAck).toEqual(["x"]);
  });

  it("builds the transaction from the parsed message", () => {
    processPendingSms([msg("n1", BKASH_RECEIVED)], h.deps);
    expect(h.enqueued[0]).toMatchObject({
      wallet_id: "wallet-bkash",
      type: "income",
      amount: 1500,
      date: "2026-11-10",
    });
    expect(h.enqueued[0].note).toContain("Trx: 9K48FL29XY");
  });
});

describe("fingerprints", () => {
  it("only trusts labelled TrxIDs with a digit and >= 6 characters", () => {
    expect(strongTrxId("TrxID 9K48FL29XY")).toBe("9K48FL29XY");
    expect(strongTrxId("Ref: dinner")).toBeNull();
    expect(strongTrxId("TrxID ABCDEFGH")).toBeNull();
    expect(strongTrxId("TrxID 12AB")).toBeNull();
  });

  it("does not include the capture channel", () => {
    const parsed = parseBangladeshFinancialSms(BKASH_RECEIVED, "bKash")!;
    const a = smsFingerprint(parsed, msg("1", BKASH_RECEIVED, "bKash", "sms"));
    const b = smsFingerprint(parsed, msg("2", BKASH_RECEIVED, "bKash", "notification"));
    expect(a).toEqual(b);
    expect(a.strong).toBe(true);
  });
});

describe("isOfficialFinancialSender (JS second gate)", () => {
  it.each(["", "!!!", "BA", "A", "--"])("rejects too-short/empty sender %j", (sender) => {
    expect(isOfficialFinancialSender(sender)).toBe(false);
  });
  it.each(["01712345678", "+8801812345678"])("rejects personal number %s", (sender) => {
    expect(isOfficialFinancialSender(sender)).toBe(false);
  });
  it.each(["bKash", "NAGAD", "16216", "BRAC-BANK"])("accepts official sender %s", (sender) => {
    expect(isOfficialFinancialSender(sender)).toBe(true);
  });
});

vi.restoreAllMocks();
