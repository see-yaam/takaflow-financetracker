/**
 * Multi-step money operations (transfers, debts, goal contributions) run as
 * atomic database functions, so they need a connection. They fail fast with a
 * clear message instead of half-applying or pretending to save offline.
 */
export class OnlineRequiredError extends Error {
  constructor(action = "This action") {
    super(`${action} needs an internet connection so it can be saved safely in one step. Please try again when you're online.`);
    this.name = "OnlineRequiredError";
  }
}

export function requireOnline(action?: string): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new OnlineRequiredError(action);
}
