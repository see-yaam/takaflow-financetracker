import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

export const PRIVACY_STORAGE_KEY = "takaflow_privacy_mode";
/** How long a finger/mouse must stay down before a locked balance is revealed. */
export const PEEK_HOLD_MS = 200;

/** Balances are visible unless the user explicitly locked them. */
export function readPrivacyLocked(): boolean {
  try {
    return localStorage.getItem(PRIVACY_STORAGE_KEY) === "locked";
  } catch {
    return false;
  }
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // best effort: ignore
  }
}

export interface PeekHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Privacy ("vault") mode for balances.
 *
 * - `isLocked` is the persisted choice and only changes through `setLocked` / `toggle`
 *   (wired to an explicit button), never through peeking.
 * - Peeking is a press-and-hold. It uses pointer events, which fire once per press for
 *   touch and mouse alike, so there are no synthesized "ghost" mouse events or clicks.
 *   A short tap or a scroll (pointercancel) never reveals anything.
 */
export function usePrivacyMode() {
  const [isLocked, setIsLocked] = useState<boolean>(readPrivacyLocked);
  const [isPeeking, setIsPeeking] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekingRef = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const endPeek = useCallback(() => {
    clearHold();
    if (peekingRef.current) {
      peekingRef.current = false;
      setIsPeeking(false);
      vibrate(8);
    }
  }, [clearHold]);

  const setLocked = useCallback(
    (next: boolean) => {
      endPeek();
      setIsLocked(next);
      try {
        localStorage.setItem(PRIVACY_STORAGE_KEY, next ? "locked" : "revealed");
      } catch {
        // best effort: the choice still applies for this session
      }
    },
    [endPeek]
  );

  const peekHandlers = useMemo<PeekHandlers>(
    () => ({
      onPointerDown: (e) => {
        if (!isLocked || e.isPrimary === false) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        clearHold();
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          peekingRef.current = true;
          setIsPeeking(true);
          vibrate(15);
        }, PEEK_HOLD_MS);
      },
      onPointerUp: endPeek,
      onPointerLeave: endPeek,
      onPointerCancel: endPeek,
      // Android long-press would otherwise open a context menu / cancel the hold.
      onContextMenu: (e) => {
        if (isLocked) e.preventDefault();
      },
    }),
    [isLocked, clearHold, endPeek]
  );

  return {
    isLocked,
    isPeeking,
    /** True when balances should be blurred right now. */
    isHidden: isLocked && !isPeeking,
    setLocked,
    peekHandlers,
  };
}
