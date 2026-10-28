import { useEffect, useRef } from "react";
import { registerPlugin, Capacitor } from "@capacitor/core";
import { parseBangladeshFinancialSms } from "@/lib/smsParser";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { toast } from "sonner";
import { format } from "date-fns";

interface SmsMessageItem {
  sender: string;
  body: string;
  timestamp: number;
}

export interface SmsReaderPluginInterface {
  getPendingSms(): Promise<{ messages: SmsMessageItem[] }>;
  isNotificationListenerEnabled(): Promise<{ enabled: boolean }>;
  openNotificationListenerSettings(): Promise<{ success: boolean }>;
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
  } catch (err: any) {
    toast.error("Could not open settings: " + (err?.message || "Unknown error"));
  }
}

export function useAutoSmsSync() {
  const { data: wallets } = useWallets();
  const createTx = useCreateTransaction();
  const isSyncing = useRef(false);

  useEffect(() => {
    // Only active when running natively on mobile
    if (!Capacitor.isNativePlatform()) return;

    const checkPendingSms = async () => {
      if (isSyncing.current || !wallets || wallets.length === 0) return;
      isSyncing.current = true;

      try {
        const { messages } = await SmsReader.getPendingSms();
        if (messages && messages.length > 0) {
          for (const msg of messages) {
            const parsed = parseBangladeshFinancialSms(msg.body, msg.sender);
            if (!parsed) continue;

            // Match wallet: look for wallet whose name contains the provider
            const matchedWallet =
              wallets.find((w) =>
                w.name.toLowerCase().includes(parsed.source.toLowerCase())
              ) ||
              wallets.find((w) =>
                parsed.source.toLowerCase().includes(w.name.toLowerCase())
              ) ||
              wallets[0]; // fallback to primary wallet

            const txDate = format(new Date(msg.timestamp || Date.now()), "yyyy-MM-dd");

            await createTx.mutateAsync({
              wallet_id: matchedWallet.id,
              type: parsed.type,
              amount: parsed.amount,
              category: parsed.categorySuggestion || "Other",
              note: `Auto: ${parsed.source} ${parsed.merchantOrParty ? `(${parsed.merchantOrParty})` : ""} ${parsed.trxId ? `Trx: ${parsed.trxId}` : ""}`.trim(),
              date: txDate,
            });

            toast.success(
              `⚡ Auto-Recorded ${parsed.source}: ৳${parsed.amount.toLocaleString()} ${parsed.type === "expense" ? "spent" : "received"}!`,
              { duration: 5000 }
            );
          }
        }
      } catch (err) {
        console.error("Error reading pending SMS:", err);
      } finally {
        isSyncing.current = false;
      }
    };

    // Check immediately on launch
    checkPendingSms();

    // Recheck every 15 seconds while active
    const interval = setInterval(checkPendingSms, 15000);
    return () => clearInterval(interval);
  }, [wallets, createTx]);
}
