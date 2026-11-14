import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { geminiGenerateJson, GeminiError } from "../_shared/gemini.ts";
import { RECEIPT_SCHEMA, sanitizeReceipt } from "../_shared/receipt.ts";

// ~1.5 MB of JPEG after the client downscales to <= 1280 px.
const MAX_BASE64_CHARS = 2_100_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("Origin"), Deno.env.get("ALLOWED_ORIGIN"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Receipt scanning is not configured (GEMINI_API_KEY missing)." }, 503);

    const { image, mimeType } = await req.json();
    if (typeof image !== "string" || !image) return json({ error: "Image is required" }, 400);
    if (image.length > MAX_BASE64_CHARS) return json({ error: "Image is too large. Please retake it closer." }, 413);
    const mime = typeof mimeType === "string" && ALLOWED_MIME.has(mimeType) ? mimeType : "image/jpeg";

    const raw = await geminiGenerateJson({
      apiKey,
      system:
        "You read shop receipts and invoices from Bangladesh (Bangla or English). Extract the merchant, the final total paid, the purchase date (YYYY-MM-DD), VAT if shown, line items, the currency (default BDT) and one English spending category. Use null when a field is not visible. Never invent amounts.",
      parts: [{ inlineData: { mimeType: mime, data: image } }, { text: "Extract this receipt." }],
      responseSchema: RECEIPT_SCHEMA,
      temperature: 0.1,
    });
    return json(sanitizeReceipt(raw));
  } catch (err) {
    console.error("scan-receipt error:", err);
    if (err instanceof GeminiError && err.status === 429) return json({ error: "Rate limit exceeded. Please try again later." }, 429);
    return json({ error: "Could not read this receipt." }, 502);
  }
});
