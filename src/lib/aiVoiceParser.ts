import { supabase } from "@/integrations/supabase/client";
import { ParsedVoiceTransaction } from "./voiceParser";

/**
 * Attempts to parse spoken voice input using AI as a silent fallback
 * when local rule-based regex parsing fails to identify amount or intent.
 *
 * The AI call always goes through the authenticated Supabase Edge Function
 * `ai-parse-voice`, which holds the provider keys (LOVABLE_API_KEY / GEMINI_API_KEY)
 * as server-side secrets. No AI provider key is ever shipped in the client bundle.
 *
 * Returns null if the AI service is unconfigured or fails.
 */
export async function parseVoiceWithAi(
  spokenText: string,
  existingCategories?: string[],
  walletNames?: string[]
): Promise<ParsedVoiceTransaction | null> {
  const text = spokenText.trim();
  if (!text) return null;

  try {
    const { data, error } = await supabase.functions.invoke("ai-parse-voice", {
      body: {
        text,
        categories: existingCategories || [],
        wallets: walletNames || [],
      },
    });

    if (!error && data && data.amount && data.amount > 0) {
      return {
        amount: Number(data.amount),
        type: data.type === "income" ? "income" : "expense",
        category: data.category || (data.type === "income" ? "Income" : "General Expense"),
        note: data.note || text,
        detectedWallet: data.detectedWallet || undefined,
        confidence: 0.99,
        rawText: text,
      };
    }
  } catch (fnErr) {
    console.warn("Supabase AI voice edge function fallback error:", fnErr);
  }

  return null;
}
