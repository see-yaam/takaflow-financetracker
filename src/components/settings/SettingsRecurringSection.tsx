import { useState } from "react";
import { useRecurringTransactions, useDeleteRecurring } from "@/hooks/useRecurringTransactions";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "sonner";
import { Repeat, Trash2 } from "lucide-react";

export default function SettingsRecurringSection() {
  const { data: recurrings } = useRecurringTransactions();
  const deleteRecurring = useDeleteRecurring();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRecurring.mutateAsync(id);
      toast.success("Recurring transaction removed");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4 flex items-center gap-2">
        <Repeat className="h-3 w-3" /> Recurring Transactions
      </h3>
      {!recurrings?.length ? (
        <p className="text-sm text-muted-foreground">
          No recurring transactions. Toggle &quot;Repeat monthly&quot; when adding a transaction.
        </p>
      ) : (
        <div className="space-y-2">
          {recurrings.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{r.category}</p>
                <p className="text-xs text-muted-foreground">
                  {r.type === "income" ? "+" : "-"}৳{Number(r.amount).toLocaleString()} · Day {r.day_of_month} ·{" "}
                  {(r as any).wallets?.name}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id || deleteRecurring.isPending}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
