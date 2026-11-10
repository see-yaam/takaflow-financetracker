import { useEffect, useRef } from "react";
import { registerPlugin, Capacitor, PermissionState } from "@capacitor/core";
import { useQueryClient } from "@tanstack/react-query";
import { parseBangladeshFinancialSms, ParsedSmsResult } from "@/lib/smsParser";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/contexts/AuthContext";
import { handleOfflineCreateTransaction, processOutboxSync } from "@/lib/offlineSync";
import { transactionCreateSchema } from "@/lib/validations";
import {
  NativeSmsMessage,
  loadIngestState,
  processPendingSms,
  recordUnparsedSms,
  saveIngestState,
} from "@/lib/smsIngest";
import { toast } from "sonner";
import { format } from "date-fns";

export interface SmsReaderPluginInterface {
  /** Unacknowledged captured messages (native never clears on read). */
  getPendingSms(): Promise<{ messages: NativeSmsMessage[]; overflowCount?: number }>;
  /** Removes exactly these ids from the native queue, after JS durably recorded them. */
  ackPendingSms(options: { ids: string[] }): Promise<{ removed: number }>;
  isNotificationListenerEnabled(): Promise<{ enabled: boolean }>;
  openNotificationListenerSettings(): Promise<{ success: boolean }>;
  openAppSettings(): Promise<void>;
  /** Capacitor built-ins for the plugin's declared "sms" permission alias (RECEIVE_SMS + READ_SMS). */
  checkPermissions(): Promise<{ sms: PermissionState }>;
  requestPermissions(options?: { permissions: Array<"sms"> }): Promise<{ sms: PermissionState }>;
}

export type SmsPermission = "granted" | "denied" | "prompt" | "unsupported";

export function toSmsPermission(state: string | undefined): SmsPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  if (state === "prompt" || state === "prompt-with-rationale") return "prompt";
  return "unsupported";
}

/** RECEIVE_SMS runtime status (always "unsupported" on the web). */
export async function getSmsPermission(): Promise<SmsPermission> {
  if (!Capacitor.isNativePlatform()) return "unsupported";
  try {
    return toSmsPermission((await SmsReader.checkPermissions()).sms);
  } catch {
    return "unsupported";
  }
}

/** Shows the Android permission prompt (if Android still allows asking) and returns the new state. */
export async function requestSmsPermission(): Promise<SmsPermission> {
  if (!Capacitor.isNativePlatform()) return "unsupported";
  try {
    return toSmsPermission((await SmsReader.requestPermissions({ permissions: ["sms"] })).sms);
  } catch {
    return "unsupported";
  }
}

export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SmsReader.openAppSettings();
  } catch (err) {
    toast.error("Could not open app settings: " + (err instanceof Error ? err.message : "Unknown error"));
  }
}

export const SmsReader = registerPlugin<SmsReaderPluginInterface>("SmsReader");

export async function checkNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await SmsReader.isNotificationListenerEnabled();
    return !!res?.enabled;
  } catch {
    return false;
  }
}

export async function openNotificationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    toast.info("Auto-sync via notifications is only available on the Android app.");
    return;
  }
  try {
    await SmsReader.openNotificationListenerSettings();
  } catch (err) {
    toast.error("Could not open settings: " + (err instanceof Error ? err.message : "Unknown error"));
  }
}

type WalletLike = { id: string; name: string };

/** Wallet whose name matches the provider (bKash, Nagad, ...), else the first wallet. */
export function matchWalletForSms(parsed: ParsedSmsResult, wallets: WalletLike[]): WalletLike | null {
  if (!wallets.length) return null;
  const source = parsed.source.toLowerCase();
  return (
    wallets.find((w) => w.name.toLowerCase().includes(source)) ||
    wallets.find((w) => source.includes(w.name.toLowerCase())) ||
    wallets[0]
  );
}

export function useAutoSmsSync() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: wallets } = useWallets();

  // Latest values for the long-lived polling effect (no restart on every refetch).
  const userIdRef = useRef<string | undefined>(user?.id);
  const walletsRef = useRef<WalletLike[] | undefined>(wallets as WalletLike[] | undefined);
  const checkRef = useRef<(() => void) | null>(null);
  userIdRef.current = user?.id;
  walletsRef.current = wallets as WalletLike[] | undefined;

  useEffect(() => {
    // Only active when running natively on mobile
    if (!Capacitor.isNativePlatform()) return;

    let busy = false;

    const checkPendingSms = async () => {
      const userId = userIdRef.current;
      const currentWallets = walletsRef.current;
      // Not ready yet: leave everything in the native queue (nothing is read, nothing is lost).
      if (busy || !userId || !currentWallets || currentWallets.length === 0) return;
      busy = true;

      try {
        const { messages } = await SmsReader.getPendingSms();
        if (!messages || messages.length === 0) return;

        const result = processPendingSms(messages, {
          parse: (body, sender) => parseBangladeshFinancialSms(body, sender),
          matchWallet: (parsed) => matchWalletForSms(parsed, currentWallets),
          enqueue: (tx) => {
            const valid = transactionCreateSchema.parse(tx);
            handleOfflineCreateTransaction(valid, userId, qc, { skipSync: true });
          },
          loadState: loadIngestState,
          saveState: saveIngestState,
          recordUnparsed: recordUnparsedSms,
          formatDate: (ts) => format(new Date(ts), "yyyy-MM-dd"),
          now: () => Date.now(),
        });

        if (result.created.length > 0) {
          processOutboxSync(qc).catch((err) => console.error("Sync after SMS capture failed:", err));
          const first = result.created[0];
          toast.success(
            result.created.length === 1
              ? `⚡ Auto-Recorded ${first.source}: ৳${first.amount.toLocaleString()} ${first.type === "expense" ? "spent" : "received"}!`
              : `⚡ Auto-Recorded ${result.created.length} transactions from SMS/notifications`,
            { duration: 5000 }
          );
        }

        if (result.toAck.length > 0) {
          await SmsReader.ackPendingSms({ ids: result.toAck });
        }
      } catch (err) {
        // Nothing was acknowledged for unrecorded messages, so they will be retried.
        console.error("Error reading pending SMS:", err);
      } finally {
        busy = false;
      }
    };

    checkRef.current = checkPendingSms;

    // Check immediately on launch
    checkPendingSms();

    // Instant sync when returning to the app from notification or other apps
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkPendingSms();
      }
    };
    const onFocus = () => checkPendingSms();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    // Recheck periodically while active (also delivers the delayed acks)
    const interval = setInterval(checkPendingSms, 10000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      checkRef.current = null;
    };
  }, [qc]);

  // Wallets arriving after launch: check right away instead of waiting for the interval.
  const walletCount = wallets?.length ?? 0;
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || walletCount === 0) return;
    checkRef.current?.();
  }, [walletCount]);
}
