import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface SettingsAccountSectionProps {
  onSignOutClick: () => void;
}

export default function SettingsAccountSection({ onSignOutClick }: SettingsAccountSectionProps) {
  const { user } = useAuth();

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4">Account</h3>
      <p className="text-sm text-muted-foreground mb-4">{user?.email}</p>
      <Button
        onClick={onSignOutClick}
        variant="outline"
        className="border-border text-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        Sign Out
      </Button>
    </div>
  );
}
