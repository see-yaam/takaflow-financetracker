// Minimal Google Gemini client for Edge Functions. Pure (no Deno globals): the
// caller passes the key, and `fetchImpl` can be swapped in unit tests.

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string }; // base64 (no data: prefix)
}

export interface GeminiJsonRequest {
  apiKey: string;
  system?: string;
  parts: GeminiPart[];
  /** OpenAPI-style schema for structured JSON output. */
  responseSchema?: Record<string, unknown>;
  model?: string;
  temperature?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Calls generateContent and returns the parsed JSON object the model produced. */
export async function geminiGenerateJson<T = unknown>(req: GeminiJsonRequest): Promise<T> {
  const doFetch = req.fetchImpl ?? fetch;
  const model = req.model ?? DEFAULT_GEMINI_MODEL;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: req.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: req.temperature ?? 0.2,
      ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
    },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };

  const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    // Header, not ?key=, so the key never appears in URLs or proxy logs.
    headers: { "Content-Type": "application/json", "x-goog-api-key": req.apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(`Gemini request failed (${res.status}): ${detail.slice(0, 300)}`, res.status);
  }
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new GeminiError("Gemini returned no content", 502);
  return parseJsonText<T>(text);
}

/** Accepts plain JSON or JSON wrapped in ``` fences. */
export function parseJsonText<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned) as T;
}

export type InsightType = "comparison" | "budget" | "forecast" | "advice";
export interface Insight {
  type: InsightType;
  title: string;
  message: string;
}

export const INSIGHTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    insights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["comparison", "budget", "forecast", "advice"] },
          title: { type: "STRING" },
          message: { type: "STRING" },
        },
        required: ["type", "title", "message"],
      },
    },
  },
  required: ["insights"],
};

const INSIGHT_TYPES = new Set<InsightType>(["comparison", "budget", "forecast", "advice"]);

/** Keeps only well-formed insights (at most 4). */
export function sanitizeInsights(raw: unknown): Insight[] {
  const list = (raw as { insights?: unknown })?.insights;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (i): i is Insight =>
        !!i &&
        INSIGHT_TYPES.has((i as Insight).type) &&
        typeof (i as Insight).title === "string" &&
        typeof (i as Insight).message === "string"
    )
    .slice(0, 4)
    .map((i) => ({ type: i.type, title: i.title.trim(), message: i.message.trim() }));
}
