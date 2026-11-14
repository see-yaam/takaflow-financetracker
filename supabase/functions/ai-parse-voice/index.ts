import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeadersFor } from "../_shared/cors.ts";
import { geminiGenerateJson } from "../_shared/gemini.ts";

const VOICE_SCHEMA = {
  type: "OBJECT",
  properties: {
    amount: { type: "NUMBER" },
    type: { type: "STRING", enum: ["income", "expense"] },
    category: { type: "STRING" },
    note: { type: "STRING" },
    detectedWallet: { type: "STRING", nullable: true },
  },
  required: ["amount", "type"],
};

function getCorsHeaders(req: Request) {
  return corsHeadersFor(req.headers.get("Origin"), Deno.env.get("ALLOWED_ORIGIN"));
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, categories, wallets } = await req.json();
    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (GEMINI_API_KEY) {
      try {
        const raw = await geminiGenerateJson<Record<string, unknown>>({
          apiKey: GEMINI_API_KEY,
          system: `You are an expert financial transaction voice parser for Bangladeshi users.
Parse spoken Bengali, Banglish, or English speech into a transaction JSON.
Rules:
- amount: positive number (convert Bengali digits/number words such as '৫০০', 'পাঁচশো', 'pachsho').
- type: 'income' or 'expense' (default 'expense' unless money was received/earned).
- category: strictly in English (e.g. 'Food & Dining', 'Groceries', 'Transport', 'Healthcare', 'Lost Money', 'Education', 'Salary').
- note: concise clean note without amounts or currency words.
- detectedWallet: wallet name if mentioned (e.g. 'Cash', 'bKash', 'Bank', 'Pocket'), else null. Pocket/মানিব্যাগ refers to Cash or Pocket.
Prefer these categories when they fit: ${JSON.stringify(categories || [])}
Wallet names: ${JSON.stringify(wallets || [])}`,
          parts: [{ text: `Parse this speech: "${String(text).slice(0, 1000)}"` }],
          responseSchema: VOICE_SCHEMA,
          temperature: 0.1,
        });
        const amount = Number(raw?.amount);
        if (Number.isFinite(amount) && amount > 0) {
          const result = {
            amount,
            type: raw?.type === "income" ? "income" : "expense",
            category: typeof raw?.category === "string" ? raw.category : null,
            note: typeof raw?.note === "string" ? raw.note : null,
            detectedWallet: typeof raw?.detectedWallet === "string" ? raw.detectedWallet : null,
          };
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (aiErr) {
        console.error("Gemini voice parse error:", aiErr);
      }
    }

    return new Response(
      JSON.stringify({ error: "AI parser service not configured or unavailable" }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
