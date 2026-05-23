import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import SettingsWalletsSection from "@/components/settings/SettingsWalletsSection";
import SettingsTransferSection from "@/components/settings/SettingsTransferSection";
import SettingsRecurringSection from "@/components/settings/SettingsRecurringSection";
import SettingsAccountSection from "@/components/settings/SettingsAccountSection";
import SettingsDangerZone from "@/components/settings/SettingsDangerZone";
import { supabase } from "@/integrations/supabase/client";
import { mapSupabaseError, throwIfSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const handleResetAccount = async () => {
    if (resetConfirm !== "RESET" || !user) return;
    setResetting(true);
    try {
      const tables = [
        "debt_additions",
        "debt_payments",
        "debts",
        "monthly_snapshots",
        "recurring_transactions",
        "budget_goals",
        "savings_goals",
        "transactions",
        "wallets",
      ] as const;

      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq("user_id", user.id);
        throwIfSupabaseError(error);
      }

      await queryClient.clear();
      await signOut();

      toast.success("Account reset successfully. Starting fresh!");
      setResetOpen(false);
      setResetConfirm("");
      window.location.href = "/login";
    } catch (e) {
      toast.error(mapSupabaseError(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Settings</h2>

      <SettingsWalletsSection />
      <SettingsTransferSection />
      <SettingsRecurringSection />
      <SettingsAccountSection onSignOutClick={() => setSignOutOpen(true)} />
      <SettingsDangerZone
        resetOpen={resetOpen}
        setResetOpen={setResetOpen}
        resetConfirm={resetConfirm}
        setResetConfirm={setResetConfirm}
        resetting={resetting}
        onReset={handleResetAccount}
      />

      <SignOutConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} onConfirm={signOut} />
    </div>
  );
}
