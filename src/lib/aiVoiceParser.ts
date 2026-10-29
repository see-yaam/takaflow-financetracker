import { supabase } from "@/integrations/supabase/client";
import { ParsedVoiceTransaction } from "./voiceParser";

interface AiParsePayload {
  amount?: number;
  type?: "income" | "expense";
  category?: string;
  note?: string;
  detectedWallet?: string;
}

/**
 * Attempts to parse spoken voice input using AI as a silent fallback
 * when local rule-based regex parsing fails to identify amount or intent.
 * 
 * Priority order:
 * 1. Direct Gemini API call if VITE_GEMINI_API_KEY is configured
 * 2. Supabase Edge Function 'ai-parse-voice' (using Lovable / Supabase AI Gateway)
 * 3. Returns null if AI services are unconfigured or fail
 */
export async function parseVoiceWithAi(
  spokenText: string,
  existingCategories?: string[],
  walletNames?: string[]
): Promise<ParsedVoiceTransaction | null> {
  const text = spokenText.trim();
  if (!text) return null;

  // 1. Try Google Gemini API directly if configured
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim().length > 0) {
    try {
      const parsed = await callGeminiDirect(text, geminiKey.trim(), existingCategories, walletNames);
      if (parsed) return parsed;
    } catch (err) {
      console.warn("Direct Gemini voice parse error, trying edge function fallback:", err);
    }
  }

  // 2. Try Supabase Edge Function 'ai-parse-voice'
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

/**
 * Calls Google Gemini (gemini-2.5-flash / gemini-1.5-flash) using structured JSON output
 */
async function callGeminiDirect(
  text: string,
  apiKey: string,
  existingCategories?: string[],
  walletNames?: string[]
): Promise<ParsedVoiceTransaction | null> {
  const systemPrompt = `You are an expert Bangladeshi financial transaction voice parser.
The user speaks in Bengali, Banglish (Bengali written in English letters), or English.
Your goal is to parse their speech into a structured transaction JSON.

RULES:
1. amount: Must be a positive number (convert Bengali words/digits like 'পাঁচশত', '৫০০', 'pachuto', '500 taka' to numeric integer/float).
2. type: Must be either 'expense' or 'income'. Defaults to 'expense' unless speech indicates money received/salary/bonus/income.
3. category: MUST ALWAYS BE STRICTLY IN ENGLISH (e.g. 'Food & Dining', 'Groceries', 'Transport', 'Healthcare', 'Education', 'Lost Money', 'Shopping', 'Utilities', 'Maintenance', 'Fitness & Gym', 'Salary', 'Income').
   - If user lost money, maps to 'Lost Money'.
   - If user paid teacher/tuition, maps to 'Education' or 'Tuition'.
   - If user paid doctor/medicine, maps to 'Healthcare' or 'Medicine'.
   - Prioritize existing categories if they fit: ${JSON.stringify(existingCategories || [])}.
4. note: Short, clean summary of what happened without amount digits or currency symbols.
5. detectedWallet: If a wallet was mentioned (e.g. bKash, Nagad, Cash, Pocket, Bank, Rocket), return the matching wallet name from ${JSON.stringify(walletNames || ["bKash", "Cash", "Bank", "Pocket", "Nagad"])}. Note that 'pocket', 'পকেট', 'মানিব্যাগ', 'cash' refer to Cash or Pocket.

Output strictly valid JSON with keys: amount, type, category, note, detectedWallet.`;

  // Available active models: flash-latest, 3.8-flash, 2.5-flash-lite, 2.5-flash
  const models = [
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-1.5-flash"
  ];

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: `${systemPrompt}\n\nUser Speech: "${text}"` }
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const parsed: AiParsePayload = JSON.parse(rawText);
      if (parsed.amount && Number(parsed.amount) > 0) {
        return {
          amount: Number(parsed.amount),
          type: parsed.type === "income" ? "income" : "expense",
          category: parsed.category || (parsed.type === "income" ? "Income" : "General Expense"),
          note: parsed.note || text,
          detectedWallet: parsed.detectedWallet || undefined,
          confidence: 0.99,
          rawText: text,
        };
      }
    } catch {
      // try next model
    }
  }

  return null;
}
