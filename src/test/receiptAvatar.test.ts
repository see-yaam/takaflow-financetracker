import { describe, it, expect } from "vitest";
import { sanitizeReceipt } from "../../supabase/functions/_shared/receipt";
import { avatarPathFromUrl, dataUrlToBlob, isInlineAvatar } from "@/lib/avatarStorage";

describe("receipt OCR sanitizer", () => {
  it("normalises amounts, dates and items", () => {
    const r = sanitizeReceipt({
      merchant: "  Shwapno ",
      total: "৳1,250.50",
      date: "2026-11-10",
      vat: 0,
      category: "Groceries",
      items: [{ name: "Rice", amount: 900 }, { name: "", amount: 5 }, { name: "Oil", amount: "350.5" }],
    });
    expect(r).toMatchObject({ merchant: "Shwapno", total: 1250.5, date: "2026-11-10", vat: null, category: "Groceries" });
    expect(r.items).toEqual([{ name: "Rice", amount: 900 }, { name: "Oil", amount: 350.5 }]);
  });
  it("drops invalid dates and garbage", () => {
    expect(sanitizeReceipt({ total: -5, date: "10/11/2026" })).toMatchObject({ total: null, date: null, items: [] });
    expect(sanitizeReceipt(null).total).toBeNull();
  });
});

describe("avatar storage helpers", () => {
  it("detects inline avatars and converts data URLs", () => {
    expect(isInlineAvatar("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isInlineAvatar("https://x.supabase.co/storage/v1/object/public/avatars/u/a.jpg")).toBe(false);
    const blob = dataUrlToBlob("data:image/png;base64,aGVsbG8=");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(5);
  });
  it("extracts our own object path from a public URL", () => {
    expect(avatarPathFromUrl("https://p.supabase.co/storage/v1/object/public/avatars/uid-1/avatar-1.jpg?v=2")).toBe("uid-1/avatar-1.jpg");
    expect(avatarPathFromUrl("https://elsewhere.com/a.jpg")).toBeNull();
  });
});
