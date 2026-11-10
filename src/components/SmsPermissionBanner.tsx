import { useEffect, useState } from "react";
import { MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSmsPermission, openAppSettings, requestSmsPermission, SmsPermission } from "@/hooks/useAutoSmsSync";

const DISMISS_KEY = "takaflow_sms_banner_dismissed";

/** Native only: one-time nudge when RECEIVE_SMS isn't granted, so new installs don't silently miss SMS. */
export default function SmsPermissionBanner() {
  const [perm, setPerm] = useState<SmsPermission>("unsupported");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    getSmsPermission().then(setPerm);
  }, []);

  if (dismissed || perm === "granted" || perm === "unsupported") return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode: banner just reappears next launch
    }
  };

  return (
    <div className="mx-4 mt-3 md:mx-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3 text-xs">
      <MessageSquareWarning className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium text-foreground">Allow SMS so bank & bKash/Nagad alerts are captured automatically</p>
        <p className="text-muted-foreground">Without it, only notifications are tracked and some SMS can be missed.</p>
      </div>
      <Button
        size="sm"
        className="h-7 text-xs"
        onClick={async () => setPerm(perm === "denied" ? (await openAppSettings(), perm) : await requestSmsPermission())}
      >
        {perm === "denied" ? "Settings" : "Allow"}
      </Button>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
