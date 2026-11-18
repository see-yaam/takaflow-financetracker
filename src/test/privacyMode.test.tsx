import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { usePrivacyMode, PEEK_HOLD_MS, PRIVACY_STORAGE_KEY, readPrivacyLocked } from "@/hooks/usePrivacyMode";

/** Minimal stand-in for the Dashboard balance card: peek handlers on the card, toggle on a pill. */
function BalanceCard() {
  const { isLocked, isHidden, setLocked, peekHandlers } = usePrivacyMode();
  return (
    <div data-testid="card" {...peekHandlers}>
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setLocked(!isLocked)}>
        toggle
      </button>
      <span data-testid="amount" data-hidden={String(isHidden)}>
        ৳1,234.00
      </span>
    </div>
  );
}

const amountHidden = () => screen.getByTestId("amount").getAttribute("data-hidden") === "true";

/** A full tap the way a phone delivers it: pointer events, then the compatibility mouse events and click. */
function tap(el: HTMLElement) {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("privacy mode default", () => {
  it("shows balances on a fresh install (no stored choice)", () => {
    expect(readPrivacyLocked()).toBe(false);
    render(<BalanceCard />);
    expect(amountHidden()).toBe(false);
  });

  it("keeps balances hidden when the user locked them earlier", () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, "locked");
    render(<BalanceCard />);
    expect(amountHidden()).toBe(true);
  });

  it("treats the old 'revealed' value and unknown values as visible", () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, "revealed");
    expect(readPrivacyLocked()).toBe(false);
    localStorage.setItem(PRIVACY_STORAGE_KEY, "true");
    expect(readPrivacyLocked()).toBe(false);
  });
});

describe("tapping the card never changes the saved choice", () => {
  it("repeated taps on an unlocked card keep balances visible", () => {
    render(<BalanceCard />);
    const card = screen.getByTestId("card");
    for (let i = 0; i < 5; i++) tap(card);
    expect(amountHidden()).toBe(false);
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBeNull();
  });

  it("repeated taps on a locked card keep it locked and never flash the amount", () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, "locked");
    render(<BalanceCard />);
    const card = screen.getByTestId("card");
    for (let i = 0; i < 5; i++) {
      tap(card);
      act(() => vi.advanceTimersByTime(PEEK_HOLD_MS * 2));
      expect(amountHidden()).toBe(true);
    }
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe("locked");
  });
});

describe("hold to peek", () => {
  beforeEach(() => localStorage.setItem(PRIVACY_STORAGE_KEY, "locked"));

  it("reveals only after the hold delay and hides again on release", () => {
    render(<BalanceCard />);
    const card = screen.getByTestId("card");
    fireEvent.pointerDown(card);
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS - 1));
    expect(amountHidden()).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(amountHidden()).toBe(false);

    fireEvent.pointerUp(card);
    expect(amountHidden()).toBe(true);
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe("locked");
  });

  it("a scroll (pointercancel) or sliding off the card ends the peek", () => {
    render(<BalanceCard />);
    const card = screen.getByTestId("card");
    fireEvent.pointerDown(card);
    fireEvent.pointerCancel(card);
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS * 2));
    expect(amountHidden()).toBe(true);

    fireEvent.pointerDown(card);
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS));
    expect(amountHidden()).toBe(false);
    fireEvent.pointerLeave(card);
    expect(amountHidden()).toBe(true);
  });

  it("does nothing when balances are already visible", () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, "revealed");
    render(<BalanceCard />);
    const card = screen.getByTestId("card");
    fireEvent.pointerDown(card);
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS * 2));
    fireEvent.pointerUp(card);
    expect(amountHidden()).toBe(false);
  });
});

describe("the toggle button", () => {
  it("locks and unlocks, persists the choice, and does not start a peek", () => {
    render(<BalanceCard />);
    const toggle = screen.getByRole("button", { name: "toggle" });

    tap(toggle);
    expect(amountHidden()).toBe(true);
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe("locked");

    // Holding the button must not peek through the card behind it.
    fireEvent.pointerDown(toggle);
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS * 2));
    expect(amountHidden()).toBe(true);
    fireEvent.pointerUp(toggle);

    tap(toggle);
    expect(amountHidden()).toBe(false);
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe("revealed");
  });
});
