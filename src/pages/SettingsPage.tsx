import { Link } from "react-router-dom";
import SettingsWalletsSection from "@/components/settings/SettingsWalletsSection";
import SettingsTransferSection from "@/components/settings/SettingsTransferSection";
import SettingsRecurringSection from "@/components/settings/SettingsRecurringSection";
import SettingsCategoriesSection from "@/components/settings/SettingsCategoriesSection";
import SettingsAutoTrackingSection from "@/components/settings/SettingsAutoTrackingSection";
import { User, ArrowRight } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Wallet Settings</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure your wallets, custom categories, recurring transactions, and transfer funds.
        </p>
      </div>

      {/* Auto-tracking status and settings */}
      <SettingsAutoTrackingSection />

      {/* Quick link banner to Profile */}
      <Link
        to="/profile"
        className="vault-card p-4 flex items-center justify-between hover:border-primary/40 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              Vault Account & Security Profile
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your avatar, change email, password, and session settings.
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </Link>

      <SettingsWalletsSection />
      <SettingsTransferSection />
      <SettingsRecurringSection />
      <SettingsCategoriesSection />
    </div>
  );
}
