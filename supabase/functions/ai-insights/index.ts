import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeadersFor } from "../_shared/cors.ts";
import { GeminiError, geminiGenerateJson, INSIGHTS_SCHEMA, sanitizeInsights } from "../_shared/gemini.ts";

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

    const {
      currentTransactions,
      previousTransactions,
      budget,
      currentDate,
      daysLeft,
      dailyAvgSpend,
      prevDailyAvgSpend,
    } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI insights are not configured (GEMINI_API_KEY missing)." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt =
      "You are a personal finance advisor. Analyze the user's spending data and give realistic, specific, actionable insights. Be direct and data-driven like an economist. Use actual numbers from the data.";

    const userPrompt = `Here is my financial data:

Current month transactions: ${JSON.stringify(currentTransactions)}

Previous month transactions: ${JSON.stringify(previousTransactions)}

Monthly budget: ${budget || "not set"}

Today is ${currentDate}, ${daysLeft} days left in this month.
Daily average spend so far: ৳${dailyAvgSpend}
Previous month daily average: ৳${prevDailyAvgSpend}

Please provide exactly 4 insights analyzing my finances: one of each type (comparison, budget, forecast, advice).`;

    let insights;
    try {
      const raw = await geminiGenerateJson({
        apiKey: GEMINI_API_KEY,
        system: systemPrompt,
        parts: [{ text: userPrompt }],
        responseSchema: INSIGHTS_SCHEMA,
        temperature: 0.4,
      });
      insights = sanitizeInsights(raw);
    } catch (err) {
      const status = err instanceof GeminiError ? err.status : 500;
      console.error("Gemini insights error:", err);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
