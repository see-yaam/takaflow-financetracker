import { useState, useEffect } from "react";
import { Bell, CheckCircle2, AlertCircle, ExternalLink, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";
import { checkNotificationPermission, openNotificationSettings } from "@/hooks/useAutoSmsSync";
import { clearUnparsedSms, getUnparsedSms, UnparsedSms } from "@/lib/smsIngest";

export default function SettingsAutoTrackingSection() {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [unparsed, setUnparsed] = useState<UnparsedSms[]>(() => getUnparsedSms());
  const [showUnparsed, setShowUnparsed] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const verifyStatus = async () => {
    if (!isNative) return;
    const active = await checkNotificationPermission();
    setIsEnabled(active);
    setUnparsed(getUnparsedSms());
  };

  useEffect(() => {
    verifyStatus();
    // Check when user returns to app
    window.addEventListener("focus", verifyStatus);
    return () => window.removeEventListener("focus", verifyStatus);
  }, [isNative]);

  if (!isNative) {
    return (
      <div className="vault-card p-5 space-y-3 border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Auto-Track bKash & Bank Notifications</h3>
            <p className="text-xs text-muted-foreground">
              Automatic background tracking is active on the installed Android App.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vault-card p-5 space-y-4 border-border/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold ${
            isEnabled ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
          }`}>
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Background Auto-Tracking</h3>
              {isEnabled ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <AlertCircle className="h-3 w-3" /> Setup Needed
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically captures bKash, Nagad, and bank transactions without needing manual entry.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center gap-2 text-foreground font-medium">
          <span>✨ How it works:</span>
        </div>
        <p>• <strong>Incoming money (Income):</strong> Automatically captured from SMS & receipts.</p>
        <p>• <strong>Send Money & Payments (Expense):</strong> Automatically captured from bKash & Nagad app notifications.</p>
      </div>

      {unparsed.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {unparsed.length} captured {unparsed.length === 1 ? "message" : "messages"} could not be read as a transaction
            </span>
            <button type="button" className="underline text-muted-foreground" onClick={() => setShowUnparsed((v) => !v)}>
              {showUnparsed ? "Hide" : "Review"}
            </button>
          </div>
          {showUnparsed && (
            <>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {unparsed
                  .slice()
                  .reverse()
                  .map((m) => (
                    <li key={m.id} className="rounded bg-background/60 p-2">
                      <span className="font-medium text-foreground">{m.sender || "Unknown sender"}</span>
                      <span className="text-muted-foreground"> · {new Date(m.timestamp).toLocaleString()}</span>
                      <p className="text-muted-foreground break-words">{m.body}</p>
                    </li>
                  ))}
              </ul>
              <p className="text-muted-foreground">Add any real transaction here manually, then clear the list.</p>
              <Button
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  clearUnparsedSms();
                  setUnparsed([]);
                }}
              >
                Clear list
              </Button>
            </>
          )}
        </div>
      )}

      {!isEnabled && (
        <Button
          onClick={() => openNotificationSettings()}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold h-9 rounded-lg"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Enable Notification Access in Settings
        </Button>
      )}
    </div>
  );
}
