import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import CategoryPicker from "@/components/CategoryPicker";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { useUpdateTransactionCategory } from "@/hooks/useTransactions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string | null;
  currentCategory: string;
}

export default function EditCategoryDialog({ open, onOpenChange, transactionId, currentCategory }: Props) {
  const [value, setValue] = useState(currentCategory);
  const update = useUpdateTransactionCategory();

  useEffect(() => {
    if (open) setValue(currentCategory);
  }, [open, currentCategory]);

  const handleSave = async () => {
    if (!transactionId) return;
    if (!value.trim()) {
      toast.error("Please enter a category");
      return;
    }
    try {
      await update.mutateAsync({ id: transactionId, category: value });
      toast.success("Category updated");
      onOpenChange(false);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Category</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Category</Label>
          <CategoryPicker value={value} onChange={setValue} autoFocus />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={update.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}