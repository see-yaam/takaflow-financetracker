import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useCustomCategories, formatCategoryLabel } from "@/hooks/useCustomCategories";
import { useTransactions } from "@/hooks/useTransactions";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function CategoryPicker({ value, onChange, placeholder = "Type or select a category...", autoFocus }: Props) {
  const { data: categories } = useCustomCategories();
  const { data: transactions } = useTransactions();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const predefinedLabels = useMemo(
    () => (categories || []).map((c) => formatCategoryLabel(c)),
    [categories]
  );

  const pastCategories = useMemo(() => {
    if (!transactions) return [];
    const set = new Set<string>();
    for (const t of transactions as any[]) {
      if (t.category && !predefinedLabels.includes(t.category)) set.add(t.category);
    }
    return [...set].sort();
  }, [transactions, predefinedLabels]);

  const q = value.trim().toLowerCase();
  const filteredPredefined = q
    ? predefinedLabels.filter((c) => c.toLowerCase().includes(q))
    : predefinedLabels;
  const filteredPast = q ? pastCategories.filter((c) => c.toLowerCase().includes(q)) : pastCategories;

  const exactMatch =
    !!value.trim() &&
    (predefinedLabels.some((c) => c.toLowerCase() === q) ||
      pastCategories.some((c) => c.toLowerCase() === q));

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={customMode ? "Type your custom category..." : placeholder}
          className="bg-secondary border-border min-h-[44px] pl-9"
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </div>
      {open && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredPredefined.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                My Categories
              </div>
              {filteredPredefined.map((c) => (
                <button
                  key={`p-${c}`}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors min-h-[44px] flex items-center"
                >
                  {c}
                </button>
              ))}
            </>
          )}
          {filteredPast.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-t border-border">
                Previously Used
              </div>
              {filteredPast.map((c) => (
                <button
                  key={`u-${c}`}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors min-h-[44px] flex items-center"
                >
                  {c}
                </button>
              ))}
            </>
          )}
          {value.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted/50 transition-colors flex items-center gap-1 border-t border-border min-h-[44px]"
            >
              <Plus className="h-3 w-3" /> Use "{value.trim()}" as category
            </button>
          )}
          {!value.trim() && (
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted/50 transition-colors flex items-center gap-1 border-t border-border min-h-[44px]"
            >
              <Plus className="h-3 w-3" /> Type a custom category...
            </button>
          )}
        </div>
      )}
    </div>
  );
}