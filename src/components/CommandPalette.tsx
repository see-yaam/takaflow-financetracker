import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface PaletteActions {
  addIncome: () => void;
  addExpense: () => void;
  openVoice: () => void;
}

const PAGES: Array<{ label: string; to: string; keywords?: string }> = [
  { label: "Dashboard", to: "/dashboard", keywords: "home" },
  { label: "Transactions", to: "/transactions", keywords: "ledger search export csv" },
  { label: "Calendar", to: "/calendar" },
  { label: "Goals & Budget", to: "/goals", keywords: "savings" },
  { label: "Debts", to: "/debts", keywords: "loan borrowed lent" },
  { label: "Reports", to: "/reports", keywords: "charts insights statement" },
  { label: "Zakat Calculator", to: "/zakat", keywords: "যাকাত nisab" },
  { label: "Wallet Settings", to: "/settings", keywords: "transfer recurring categories reconcile" },
  { label: "Profile", to: "/profile", keywords: "account password avatar" },
];

/** P2-07: global Ctrl/Cmd+K command palette. Also opened via the "takaflow_open_palette" event. */
export default function CommandPalette({ actions }: { actions: PaletteActions }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("takaflow_open_palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("takaflow_open_palette", onOpen);
    };
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or page…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => run(actions.addExpense)}>Add expense</CommandItem>
          <CommandItem onSelect={() => run(actions.addIncome)}>Add income</CommandItem>
          <CommandItem onSelect={() => run(actions.openVoice)}>Voice entry</CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/transactions"))}>Search / export transactions (CSV)</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          {PAGES.map((p) => (
            <CommandItem key={p.to} value={`${p.label} ${p.keywords ?? ""}`} onSelect={() => run(() => navigate(p.to))}>
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
