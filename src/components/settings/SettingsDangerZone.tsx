import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SettingsDangerZoneProps {
  resetOpen: boolean;
  setResetOpen: (open: boolean) => void;
  resetConfirm: string;
  setResetConfirm: (value: string) => void;
  resetting: boolean;
  onReset: () => void;
}

export default function SettingsDangerZone({
  resetOpen,
  setResetOpen,
  resetConfirm,
  setResetConfirm,
  resetting,
  onReset,
}: SettingsDangerZoneProps) {
  return (
    <>
      <div className="vault-card p-5 border border-destructive/30">
        <h3 className="wallet-label mb-2 text-destructive flex items-center gap-2">⚠️ Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">Permanently delete all your data and start over.</p>
        <Button onClick={() => setResetOpen(true)} variant="destructive">
          Reset Account
        </Button>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reset Everything?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete all your wallets, transactions, goals, recurring transactions, and monthly
            snapshots. This action cannot be undone.
          </p>
          <div className="space-y-2">
            <Label className="text-foreground">
              Type <span className="font-bold text-destructive">RESET</span> to confirm
            </Label>
            <Input
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="RESET"
              className="bg-secondary border-border"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              disabled={resetting}
              onClick={() => {
                setResetOpen(false);
                setResetConfirm("");
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={resetConfirm !== "RESET" || resetting} onClick={onReset}>
              {resetting ? "Resetting..." : "Yes, Reset Everything"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
