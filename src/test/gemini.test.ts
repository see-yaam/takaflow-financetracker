import { describe, it, expect, vi } from "vitest";
import { geminiGenerateJson, parseJsonText, sanitizeInsights, GeminiError } from "../../supabase/functions/_shared/gemini";

const okResponse = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe("Edge Function Gemini helper", () => {
  it("sends the key in a header (never the URL) and parses JSON output", async () => {
    const fetchImpl = vi.fn(async () => okResponse('{"insights":[]}'));
    const out = await geminiGenerateJson({ apiKey: "secret", parts: [{ text: "hi" }], fetchImpl });
    expect(out).toEqual({ insights: [] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
  });

  it("surfaces HTTP status (e.g. 429) as GeminiError", async () => {
    const fetchImpl = vi.fn(async () => new Response("quota", { status: 429 }));
    await expect(geminiGenerateJson({ apiKey: "k", parts: [{ text: "x" }], fetchImpl })).rejects.toMatchObject({
      status: 429,
    });
    await expect(geminiGenerateJson({ apiKey: "k", parts: [{ text: "x" }], fetchImpl })).rejects.toBeInstanceOf(GeminiError);
  });

  it("accepts fenced JSON", () => {
    expect(parseJsonText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("keeps only well-formed insights, max 4", () => {
    const raw = {
      insights: [
        { type: "comparison", title: " A ", message: "m" },
        { type: "bogus", title: "B", message: "m" },
        { type: "budget", title: "C" },
        { type: "forecast", title: "D", message: "m" },
        { type: "advice", title: "E", message: "m" },
        { type: "advice", title: "F", message: "m" },
        { type: "advice", title: "G", message: "m" },
      ],
    };
    const out = sanitizeInsights(raw);
    expect(out.map((i) => i.title)).toEqual(["A", "D", "E", "F"]);
    expect(sanitizeInsights(null)).toEqual([]);
  });
});
