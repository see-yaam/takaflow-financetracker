import { useState } from "react";
import { Tag, Trash2, Pencil, Plus, GripVertical, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import {
  useCustomCategories,
  useCreateCustomCategory,
  useUpdateCustomCategory,
  useDeleteCustomCategory,
  useReorderCustomCategories,
  formatCategoryLabel,
  CustomCategory,
} from "@/hooks/useCustomCategories";
import { useTransactions } from "@/hooks/useTransactions";

export default function SettingsCategoriesSection() {
  const { data: categories } = useCustomCategories();
  const { data: transactions } = useTransactions();
  const createCat = useCreateCustomCategory();
  const updateCat = useUpdateCustomCategory();
  const deleteCat = useDeleteCustomCategory();
  const reorderCat = useReorderCustomCategories();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<CustomCategory | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const startEdit = (c: CustomCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditEmoji(c.emoji || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditEmoji("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editName.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    try {
      await updateCat.mutateAsync({ id: editingId, name: editName, emoji: editEmoji });
      toast.success("Category updated");
      cancelEdit();
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    try {
      const nextOrder = (categories?.length ?? 0);
      await createCat.mutateAsync({ name: newName, emoji: newEmoji || null, display_order: nextOrder });
      setNewName("");
      setNewEmoji("");
      toast.success("Category added");
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const usageCount = (c: CustomCategory) => {
    if (!transactions) return 0;
    const label = formatCategoryLabel(c);
    return (transactions as any[]).filter((t) => t.category === label || t.category === c.name).length;
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteCat.mutateAsync(confirmDelete.id);
      toast.success("Category deleted");
      setConfirmDelete(null);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId || !categories || dragId === targetId) return;
    const list = [...categories];
    const fromIdx = list.findIndex((c) => c.id === dragId);
    const toIdx = list.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const ordered = list.map((c, i) => ({ id: c.id, display_order: i }));
    setDragId(null);
    try {
      await reorderCat.mutateAsync(ordered);
    } catch (e) {
      toast.error(mapSupabaseError(e));
    }
  };

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4 flex items-center gap-2">
        <Tag className="h-3 w-3" /> My Categories
      </h3>

      {!categories?.length ? (
        <p className="text-sm text-muted-foreground mb-4">No categories yet. Add your first one below.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {categories.map((c) => (
            <div
              key={c.id}
              draggable={editingId !== c.id}
              onDragStart={() => setDragId(c.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(c.id)}
              className="flex items-center gap-2 py-2 border-b border-border/30 last:border-0"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
              {editingId === c.id ? (
                <>
                  <Input
                    value={editEmoji}
                    onChange={(e) => setEditEmoji(e.target.value)}
                    placeholder="🎯"
                    className="bg-secondary border-border w-16 text-center"
                    maxLength={4}
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Category name"
                    className="bg-secondary border-border flex-1"
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={updateCat.isPending}
                    className="text-primary hover:text-primary/80 disabled:opacity-50 p-1"
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-muted-foreground hover:text-foreground p-1"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-foreground flex-1 truncate">
                    {c.emoji ? `${c.emoji} ` : ""}
                    {c.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="text-muted-foreground hover:text-primary p-1"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(c)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-border/30 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Add Category</p>
        <div className="flex gap-2">
          <Input
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            placeholder="🎯"
            className="bg-secondary border-border w-16 text-center"
            maxLength={4}
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            className="bg-secondary border-border flex-1"
          />
          <Button
            onClick={handleAdd}
            disabled={createCat.isPending || !newName.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && usageCount(confirmDelete) > 0
                ? `This category is used in ${usageCount(confirmDelete)} transaction${usageCount(confirmDelete) === 1 ? "" : "s"}. Still delete?`
                : "This will remove the category from your list. Existing transactions using it will not be changed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}