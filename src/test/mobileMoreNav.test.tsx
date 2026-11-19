import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Keep the layout under test; stub everything heavy around it.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "tester@example.com", user_metadata: { full_name: "Tester" } }, signOut: vi.fn() }),
}));
vi.mock("@/hooks/useAutoSmsSync", () => ({ useAutoSmsSync: () => {} }));
vi.mock("@/hooks/useBillReminderSync", () => ({ useBillReminderSync: () => {} }));
vi.mock("@/components/OfflineSyncBadge", () => ({ default: () => null }));
vi.mock("@/components/SyncIssuesDialog", () => ({ default: () => null }));
vi.mock("@/components/SmsPermissionBanner", () => ({ default: () => null }));
vi.mock("@/components/CommandPalette", () => ({ default: () => null }));
vi.mock("@/components/AddTransactionDrawer", () => ({ default: () => null }));
vi.mock("@/components/voice/VoiceTransactionModal", () => ({ default: () => null }));
vi.mock("@/components/SignOutConfirmDialog", () => ({ default: () => null }));

import AppLayout from "@/components/AppLayout";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="*" element={<p>page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const bottomNav = () => {
  const navs = screen.getAllByRole("navigation");
  // The phone bottom bar is the one holding the "More" button.
  return navs.find((n) => within(n).queryByRole("button", { name: "More" }))!;
};

describe("phone bottom nav + More sheet", () => {
  it("shows 4 tabs plus More", () => {
    renderAt("/dashboard");
    const nav = bottomNav();
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Home", "Calendar", "Reports", "Goals"]);
    expect(within(nav).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("More opens a sheet with Transactions, Debts, Zakat and Wallet Settings (not Profile)", () => {
    renderAt("/dashboard");
    fireEvent.click(within(bottomNav()).getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog");
    const labels = within(sheet).getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(labels).toEqual(["/transactions", "/debts", "/zakat", "/settings"]);
    expect(within(sheet).queryByRole("link", { name: /profile/i })).toBeNull();
  });

  it("closes the sheet after picking a page", () => {
    renderAt("/dashboard");
    fireEvent.click(within(bottomNav()).getByRole("button", { name: "More" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: /Zakat/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("highlights More while on a page that lives in it", () => {
    renderAt("/zakat");
    expect(within(bottomNav()).getByRole("button", { name: "More" })).toHaveClass("text-primary");
  });

  it("keeps Profile and Sign Out in the phone header, and Wallet Settings moves out of it", () => {
    renderAt("/dashboard");
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Account Profile" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "Wallet Settings" })).toBeNull();
  });
});
