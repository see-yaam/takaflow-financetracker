/**
 * Natural Language Voice Transaction Parser for TakaFlow
 * Supports Bengali (বাংলা), Banglish (English letters with Bengali syntax), and English.
 */

export interface ParsedVoiceTransaction {
  amount: number;
  type: "income" | "expense";
  category: string;
  note: string;
  confidence: number;
  rawText: string;
}

// Bengali digit map
const BN_DIGIT_MAP: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9"
};

// Spoken numbers in Bengali/Banglish words
const SPOKEN_NUMBERS: Record<string, number> = {
  "একশো": 100, "একশত": 100, "ek sho": 100, "eksho": 100,
  "দ্বিশত": 200, "দুইশো": 200, "dui sho": 200, "duisho": 200,
  "তিনশো": 300, "tin sho": 300, "tinsho": 300,
  "চারশো": 400, "char sho": 400, "charsho": 400,
  "পাঁচশো": 500, "পাঁচশত": 500, "panch sho": 500, "panchsho": 500,
  "ছয়শো": 600, "choy sho": 600,
  "সাতশো": 700, "sat sho": 700,
  "আটশো": 800, "aat sho": 800,
  "নয়শো": 900, "noy sho": 900,
  "হাজার": 1000, "hajar": 1000, "ek hajar": 1000, "এক হাজার": 1000,
  "দেড় হাজার": 1500, "der hajar": 1500, "দেড় হাজার": 1500,
  "দুই হাজার": 2000, "dui hajar": 2000,
  "আড়াই হাজার": 2500, "আড়াই হাজার": 2500, "arai hajar": 2500,
  "তিন হাজার": 3000, "tin hajar": 3000,
  "পাঁচ হাজার": 5000, "panch hajar": 5000,
  "দশ হাজার": 10000, "dosh hajar": 10000,
  "বিশ হাজার": 20000, "bish hajar": 20000,
  "পঞ্চাশ হাজার": 50000, "ponchash hajar": 50000,
  "এক লাখ": 100000, "ek lakh": 100000, "ek lac": 100000
};

// Category keywords mapping
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Food & Dining": [
    "restaurant", "restora", "রেস্টুরেন্ট", "রেস্তোরাঁ", "khabar", "খাবার", "khailam", "খেলাম",
    "kacchi", "কাচ্চি", "biryani", "বিরিয়ানি", "বিরিয়ানি", "burger", "বার্গার", "pizza", "পিজ্জা",
    "fuchka", "ফুচকা", "chotpoti", "চটপটি", "momo", "মোমো", "cha", "চা", "coffee", "কফি",
    "nasta", "নাস্তা", "lunch", "লঞ্চ", "dinner", "ডিনার", "breakfast", "সকাল", "ভাত", "bhat"
  ],
  "Transport": [
    "rickshaw", "রিকশা", "রিক্সায়", "রিকশায়", "cng", "সিএনজি", "uber", "উবার", "pathao", "পাঠাও",
    "bus", "বাস", "vara", "ভাড়া", "ভাড়া", "petrol", "অকটেন", "octane", "cng pump", "gas",
    "train", "ট্রেন", "metro", "মেট্রো", "metrorail", "মেট্রোরেল", "fare", "toll", "টোল"
  ],
  "Groceries": [
    "bazar", "বাজার", "grocery", "মুদি", "shwapno", "স্বপ্ন", "agora", "আগোরা", "meena bazar", "মীনা বাজার",
    "unimart", "চাল", "ডাল", "তেল", "সবজি", "sobji", "chal", "dal", "tel", "mach", "মাছ", "mangsho", "মাংস",
    "super shop", "কাঁচাবাজার"
  ],
  "Shopping": [
    "shopping", "শপিং", "shirt", "শার্ট", "pant", "প্যান্ট", "dress", "কাপড়", "কাপড়", "cloth",
    "aarong", "আড়ং", "daraz", "দারাজ", "apex", "এপেক্স", "bata", "বাটা", "shoes", "জুতা", "কেনাকাটা"
  ],
  "Utilities": [
    "bill", "বিল", "current", "বিদ্যুৎ", "electric", "wasa", "পানি", "পানি বিল", "gas", "গ্যাস",
    "wifi", "ওয়াইফাই", "internet", "ইন্টারনেট", "recharge", "রিচার্জ", "mobile recharge"
  ],
  "Healthcare": [
    "medicine", "ঔষধ", "ওষুধ", "osudh", "doctor", "ডাক্তার", "hospital", "হাসপাতাল", "pharma",
    "pharmacy", "ফার্মেসি", "টেস্ট", "test", "চিকিৎসা"
  ],
  "Education": [
    "tuition", "টিউশনি", "টিউশন", "school", "স্কুল", "college", "কলেজ", "university", "ভার্সিটি",
    "boi", "বই", "khata", "খাতা", "coaching", "কোচিং", "exam fee", "পরীক্ষার ফি"
  ],
  "Entertainment": [
    "ghurte", "ঘুরতে", "tour", "ট্যুর", "cinema", "সিনেমা", "movie", "মুভি", "star cineplex",
    "adda", "আড্ডা", "game", "গেম", "outing"
  ]
};

// Expense intent keywords (Bangla, Banglish, English)
const EXPENSE_INTENT_WORDS = [
  "খরচ", "দিলাম", "কিনলাম", "গেছে", "লাগল", "কাটলো", "কাটসে", "শেষ", "খাইলাম", "উড়াইলাম",
  "উড়ালাম", "দিছি", "বিল", "পাঠালাম", "পাঠাইলাম", "সেন্ড", "পেমেন্ট",
  "khoroch", "dilam", "kinlam", "geche", "laglo", "katlo", "katse", "sesh", "khailam",
  "urailam", "dichi", "bill", "pathalam", "pathailam", "send", "payment", "paid",
  "spent", "cost", "costing", "shopping"
];

// Income intent keywords
const INCOME_INTENT_WORDS = [
  "পেলাম", "আসলো", "ঢুকলো", "পাইছি", "দিছে", "জমা", "বেতন", "টিউশনি", "লাভ", "ইনকাম",
  "আয়", "বোনাস", "ক্যাশব্যাক", "ফেরত", "উঠাইলাম",
  "pelam", "ashlo", "dhuklo", "paisi", "diche", "joma", "beton", "salary", "bonus",
  "income", "received", "got", "credited", "cashback", "refund"
];

/**
 * Converts Bengali digits to standard Western digits (০-৯ -> 0-9)
 */
export function convertBnDigitsToEn(str: string): string {
  return str.replace(/[০-৯]/g, (digit) => BN_DIGIT_MAP[digit] || digit);
}

/**
 * Extracts numeric amount from speech text
 */
function extractAmount(text: string): number | null {
  const normalized = convertBnDigitsToEn(text).toLowerCase();

  // 1. Check spoken phrases first: "der hajar" -> 1500, "panch sho" -> 500
  for (const [phrase, value] of Object.entries(SPOKEN_NUMBERS)) {
    if (normalized.includes(phrase)) {
      return value;
    }
  }

  // 2. Look for "k" notation: e.g. "1.5k", "2k", "10k"
  const kMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch && kMatch[1]) {
    const val = parseFloat(kMatch[1]) * 1000;
    if (!isNaN(val) && val > 0) return val;
  }

  // 3. Look for explicit number patterns: "400 taka", "৳ 500", "500.00", "1500"
  // Look for number adjacent to taka/৳/tk/টাকা or standalone numbers
  const numberMatches = normalized.match(/(?:tk\.?|bdt|৳|টাকা)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:tk\.?|bdt|৳|টাকা)?/gi);
  if (numberMatches) {
    for (const match of numberMatches) {
      const cleanDigits = match.replace(/[^0-9.]/g, "");
      const parsed = parseFloat(cleanDigits);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 5000000) {
        return parsed;
      }
    }
  }

  // 4. Any standalone number > 0
  const anyDigits = normalized.match(/\b([0-9]+)\b/);
  if (anyDigits && anyDigits[1]) {
    const parsed = parseInt(anyDigits[1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}

/**
 * Determines transaction type: income or expense
 */
function extractType(text: string): "income" | "expense" {
  const lower = convertBnDigitsToEn(text).toLowerCase();

  let incomeScore = 0;
  let expenseScore = 0;

  for (const word of INCOME_INTENT_WORDS) {
    if (lower.includes(word)) incomeScore += 2;
  }

  for (const word of EXPENSE_INTENT_WORDS) {
    if (lower.includes(word)) expenseScore += 2;
  }

  // Default assumption in money trackers is expense unless income indicators exist
  return incomeScore > expenseScore ? "income" : "expense";
}

/**
 * Guesses category from spoken text
 */
function extractCategory(text: string, type: "income" | "expense"): string {
  const lower = text.toLowerCase();

  if (type === "income") {
    if (lower.includes("salary") || lower.includes("বেতন") || lower.includes("beton")) return "Salary";
    if (lower.includes("freelance") || lower.includes("ফ্রিল্যান্স")) return "Freelance";
    if (lower.includes("tuition") || lower.includes("টিউশন")) return "Tuition";
    if (lower.includes("investment") || lower.includes("লাভ") || lower.includes("শেয়ার")) return "Investments";
    return "Income";
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }

  return "Other";
}

/**
 * Creates a clean note from speech
 */
function extractNote(text: string, category: string, amount: number | null): string {
  // Strip out amount digits and words like "taka"
  let clean = text
    .replace(/[০-৯0-9]+/g, "")
    .replace(/(?:taka|টাকা|tk|bdt|৳)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // If text is too short, default to category name
  if (clean.length < 3) {
    return category;
  }

  // Capitalize first letter
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Main parser entry point
 */
export function parseVoiceInput(spokenText: string): ParsedVoiceTransaction | null {
  if (!spokenText || typeof spokenText !== "string") return null;

  const text = spokenText.trim();
  if (text.length === 0) return null;

  const amount = extractAmount(text);
  if (!amount || amount <= 0) {
    return null; // Could not identify an amount
  }

  const type = extractType(text);
  const category = extractCategory(text, type);
  const note = extractNote(text, category, amount);

  return {
    amount,
    type,
    category,
    note,
    confidence: 0.95,
    rawText: text,
  };
}
