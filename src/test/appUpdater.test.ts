import { describe, it, expect } from "vitest";
import { isNewerVersion } from "../lib/appUpdater";

describe("AppUpdater Version Comparison", () => {
  it("detects newer minor version", () => {
    expect(isNewerVersion("1.0.5", "1.0.6")).toBe(true);
    expect(isNewerVersion("v1.0.5", "v1.0.6")).toBe(true);
    expect(isNewerVersion("1.0.5", "v1.1.0")).toBe(true);
    expect(isNewerVersion("1.0.5", "2.0.0")).toBe(true);
  });

  it("detects same or older version", () => {
    expect(isNewerVersion("1.0.5", "1.0.5")).toBe(false);
    expect(isNewerVersion("v1.0.5", "1.0.5")).toBe(false);
    expect(isNewerVersion("1.0.6", "1.0.5")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("handles differing version parts gracefully", () => {
    expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0")).toBe(false);
  });
});
