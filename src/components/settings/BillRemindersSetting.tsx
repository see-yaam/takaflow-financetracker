import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { remindersEnabled, setRemindersEnabled } from "@/lib/billReminders";

/** P3-03: toggle for local bill reminders (48 h before each recurring expense). */
export default function BillRemindersSetting() {
  const [on, setOn] = useState(remindersEnabled);
  const native = Capacitor.isNativePlatform();
  return (
    <div className="vault-card p-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <BellRing className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Bill reminders</h3>
          <p className="text-xs text-muted-foreground">
            {native
              ? "Notify me 48 hours before each recurring bill is due."
              : "Available in the Android app."}
          </p>
        </div>
      </div>
      <Switch
        checked={on}
        disabled={!native}
        aria-label="Bill reminders"
        onCheckedChange={async (v) => {
          const result = await setRemindersEnabled(v);
          setOn(result);
          if (v && !result) toast.error("Allow notifications for TakaFlow to get bill reminders.");
          else if (result) window.dispatchEvent(new Event("takaflow_reschedule_reminders"));
        }}
      />
    </div>
  );
}
