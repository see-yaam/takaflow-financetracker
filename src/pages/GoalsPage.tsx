import { useState } from "react";
import { useSavingsGoals, useCreateSavingsGoal, useAddToGoal, useDeleteSavingsGoal } from "@/hooks/useSavingsGoals";
import { useWallets } from "@/hooks/useWallets";
import { useTransactions } from "@/hooks/useTransactions";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Target } from "lucide-react";
import { format } from "date-fns";

const EMOJIS = ["🫙", "🏠", "✈️", "🚗", "📱", "🎓", "💍", "🎯", "💰", "🎮"];

export default function GoalsPage() {
  const { user } = useAuth();
  const { data: goals, isLoading } = useSavingsGoals();
  const { data: wallets } = useWallets();
  const createGoal = useCreateSavingsGoal();
  const addToGoal = useAddToGoal();
  const deleteGoal = useDeleteSavingsGoal();

  // Compute avg monthly savings for projection
  const currentMonth = format(new Date(), "yyyy-MM");
  const { data: monthTx } = useTransactions({ month: currentMonth });
  const monthIncome = (monthTx || []).filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const monthExpense = (monthTx || []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const avgMonthlySavings = Math.max(monthIncome - monthExpense, 0);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [emoji, setEmoji] = useState("🫙");

  const [addDialog, setAddDialog] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [addWallet, setAddWallet] = useState("");
  const [confetti, setConfetti] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim() || !target) { toast.error("Fill in title and target amount"); return; }
    try {
      await createGoal.mutateAsync({
        title: title.trim(),
        target_amount: parseFloat(target),
        deadline: deadline || undefined,
        emoji,
      });
      toast.success("Goal created!");
      setShowCreate(false);
      setTitle(""); setTarget(""); setDeadline(""); setEmoji("🫙");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAdd = async (goalId: string) => {
    const amt = parseFloat(addAmount);
    if (!amt || !addWallet) { toast.error("Enter amount and select wallet"); return; }
    const w = wallets?.find((w) => w.id === addWallet);
    if (w && Number(w.balance) < amt) { toast.error("Insufficient wallet balance"); return; }
    try {
      await addToGoal.mutateAsync({ goalId, amount: amt, walletId: addWallet, userId: user!.id });
      // Check if goal is now completed
      const goal = goals?.find((g: any) => g.id === goalId);
      if (goal && Number(goal.saved_amount) + amt >= Number(goal.target_amount)) {
        setConfetti(goalId);
        setTimeout(() => setConfetti(null), 3000);
      }
      toast.success("Funds added to goal!");
      setAddDialog(null); setAddAmount(""); setAddWallet("");
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">Loading goals...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Target className="h-5 w-5 text-accent" /> Dream Jar
        </h2>
        <Button onClick={() => setShowCreate(true)} className="bg-primary/15 text-primary hover:bg-primary/25 border-0">
          <Plus className="h-4 w-4 mr-2" /> New Goal
        </Button>
      </div>

      {(!goals || goals.length === 0) && (
        <div className="vault-card p-8 text-center">
          <p className="text-4xl mb-3">🫙</p>
          <p className="text-muted-foreground">No savings goals yet. Create one to start saving!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence>
          {goals?.map((g: any, i: number) => {
            const pct = Number(g.target_amount) > 0 ? Math.min((Number(g.saved_amount) / Number(g.target_amount)) * 100, 100) : 0;
            const remaining = Math.max(Number(g.target_amount) - Number(g.saved_amount), 0);
            const monthsToGoal = avgMonthlySavings > 0 ? Math.ceil(remaining / avgMonthlySavings) : null;

            return (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.05 }}
                className={`vault-card p-5 relative overflow-hidden ${g.completed ? "border-primary/50" : ""}`}
              >
                {confetti === g.id && (
                  <div className="absolute inset-0 flex items-center justify-center text-6xl animate-bounce pointer-events-none z-10">
                    🎉
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{g.emoji || "🫙"}</span>
                    <div>
                      <p className="font-medium text-foreground">{g.title}</p>
                      {g.deadline && <p className="text-xs text-muted-foreground">Due: {format(new Date(g.deadline), "MMM d, yyyy")}</p>}
                    </div>
                  </div>
                  <button onClick={() => deleteGoal.mutate(g.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span className="tabular-nums">৳{Number(g.saved_amount).toLocaleString()}</span>
                    <span className="tabular-nums">৳{Number(g.target_amount).toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${g.completed ? "bg-primary" : "bg-accent"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 tabular-nums">{pct.toFixed(0)}% saved</p>
                </div>

                {!g.completed && monthsToGoal && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Reach in ~{monthsToGoal} month{monthsToGoal !== 1 ? "s" : ""} at current savings rate
                  </p>
                )}

                {g.completed ? (
                  <p className="text-sm font-medium text-primary flex items-center gap-1">✅ Goal completed!</p>
                ) : (
                  <Button
                    onClick={() => { setAddDialog(g.id); setAddWallet(wallets?.[0]?.id || ""); }}
                    size="sm"
                    className="bg-accent/15 text-accent hover:bg-accent/25 border-0"
                  >
                    Add Money
                  </Button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Create Goal Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Create Savings Goal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`text-2xl p-1 rounded-lg transition-colors ${emoji === e ? "bg-primary/20" : "hover:bg-muted"}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Emergency Fund" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Target Amount</Label>
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="50000" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Deadline (optional)</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="bg-secondary border-border" />
            </div>
            <Button onClick={handleCreate} disabled={createGoal.isPending} className="w-full bg-primary text-primary-foreground">
              {createGoal.isPending ? "Creating..." : "Create Goal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Money Dialog */}
      <Dialog open={!!addDialog} onOpenChange={(open) => !open && setAddDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Add Money to Goal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} placeholder="1000" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>From Wallet</Label>
              <Select value={addWallet} onValueChange={setAddWallet}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {wallets?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} (৳{Number(w.balance).toLocaleString()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => addDialog && handleAdd(addDialog)}
              disabled={addToGoal.isPending}
              className="w-full bg-accent text-accent-foreground"
            >
              {addToGoal.isPending ? "Adding..." : "Add Funds"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
