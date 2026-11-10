import { describe, it, expect } from "vitest";
import { toSmsPermission, getSmsPermission, requestSmsPermission } from "@/hooks/useAutoSmsSync";

describe("SMS runtime permission mapping", () => {
  it("maps Capacitor permission states", () => {
    expect(toSmsPermission("granted")).toBe("granted");
    expect(toSmsPermission("denied")).toBe("denied");
    expect(toSmsPermission("prompt")).toBe("prompt");
    expect(toSmsPermission("prompt-with-rationale")).toBe("prompt");
    expect(toSmsPermission(undefined)).toBe("unsupported");
  });
  it("is unsupported on the web (no native plugin calls)", async () => {
    expect(await getSmsPermission()).toBe("unsupported");
    expect(await requestSmsPermission()).toBe("unsupported");
  });
});
