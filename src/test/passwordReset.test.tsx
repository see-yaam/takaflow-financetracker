import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", async () => {
  const m = await import("./mocks/supabase");
  return { supabase: m.supabaseMock.client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { supabaseMock } from "./mocks/supabase";
import { parseRecoveryHash, captureRecoveryFromUrl, readRecoveryState, clearRecoveryState, authRedirectUrl, PUBLIC_APP_URL } from "@/lib/authRedirect";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";

describe("recovery link parsing", () => {
  it("detects a Supabase recovery link", () => {
    expect(parseRecoveryHash("#access_token=abc&refresh_token=def&type=recovery")).toEqual({ recovery: true, error: null });
  });
  it("surfaces an expired-link error", () => {
    expect(parseRecoveryHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toEqual({
      recovery: false,
      error: "Email link is invalid or has expired",
    });
  });
  it("ignores ordinary URLs", () => {
    expect(parseRecoveryHash("", "?tab=1")).toEqual({ recovery: false, error: null });
  });
  it("uses the current origin on the web", () => {
    expect(authRedirectUrl("/reset-password")).toBe(`${window.location.origin}/reset-password`);
    expect(PUBLIC_APP_URL).toMatch(/^https:\/\//);
  });
});

describe("ForgotPassword uses Supabase Auth", () => {
  beforeEach(() => supabaseMock.reset());

  it("calls resetPasswordForEmail with the /reset-password redirect", async () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: " Me@Example.com " } });
    fireEvent.submit(screen.getByRole("button", { name: /reset|send/i }).closest("form")!);
    await waitFor(() => expect(supabaseMock.client.auth.resetPasswordForEmail).toHaveBeenCalled());
    expect(supabaseMock.client.auth.resetPasswordForEmail).toHaveBeenCalledWith("me@example.com", {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(supabaseMock.client.functions.invoke).not.toHaveBeenCalled();
  });
});

describe("ResetPassword (session-based)", () => {
  beforeEach(() => {
    supabaseMock.reset();
    clearRecoveryState();
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.useRealTimers();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    );

  it("lets a recovery session set a new password, then signs out", async () => {
    window.history.replaceState(null, "", "/reset-password#access_token=x&type=recovery");
    captureRecoveryFromUrl();
    expect(readRecoveryState().recovery).toBe(true);

    renderPage();
    act(() => supabaseMock.emitAuth("PASSWORD_RECOVERY", "user-a"));
    const pw = await screen.findByLabelText("New Password");
    fireEvent.change(pw, { target: { value: "newpass123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "newpass123" } });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(supabaseMock.client.auth.updateUser).toHaveBeenCalledWith({ password: "newpass123" }));
    await waitFor(() => expect(supabaseMock.client.auth.signOut).toHaveBeenCalled());
    expect(readRecoveryState().recovery).toBe(false);
  });

  it("shows the expired-link screen for an error link", async () => {
    window.history.replaceState(null, "", "/reset-password#error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
    captureRecoveryFromUrl();
    renderPage();
    expect(await screen.findByText(/Email link is invalid or has expired/)).toBeInTheDocument();
  });

  it("does not offer a password form to an ordinary signed-in visit", async () => {
    vi.useFakeTimers();
    renderPage();
    act(() => supabaseMock.emitAuth("SIGNED_IN", "user-a"));
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByLabelText("New Password")).toBeNull();
    expect(screen.getByText(/Invalid or expired reset link/)).toBeInTheDocument();
  });
});
