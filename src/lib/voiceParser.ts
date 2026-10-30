/**
 * Natural Language Voice Transaction Parser for TakaFlow
 * Supports Bengali (বাংলা), Banglish (English letters with Bengali syntax), and English.
 */

export interface ParsedVoiceTransaction {
  amount: number;
  type: "income" | "expense";
  category: string;
  note: string;
  detectedWallet?: string;
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
  // Hundreds
  "একশো": 100, "একশত": 100, "একশ": 100, "ek sho": 100, "eksho": 100, "ek so": 100, "ekso": 100, "one hundred": 100,
  "দুইশো": 200, "দুইশত": 200, "দুইশ": 200, "dui sho": 200, "duisho": 200, "dui so": 200, "duiso": 200, "two hundred": 200,
  "তিনশো": 300, "তিনশত": 300, "তিনশ": 300, "tin sho": 300, "tinsho": 300, "tin so": 300, "tinso": 300, "three hundred": 300,
  "চারশো": 400, "চারশত": 400, "চারশ": 400, "char sho": 400, "charsho": 400, "char so": 400, "charso": 400, "four hundred": 400,
  "পাঁচশো": 500, "পাঁচশত": 500, "পাচশো": 500, "পাঁচশ": 500, "পাচশ": 500, "পাঁচ শত": 500, "পাচ শত": 500,
  "panch sho": 500, "panchsho": 500, "pach sho": 500, "pachsho": 500, "pashsho": 500, "pash sho": 500,
  "pachu": 500, "pacho": 500, "pashu": 500, "pasho": 500, "panch so": 500, "panchso": 500, "five hundred": 500,
  "ছয়শো": 600, "ছয়শো": 600, "ছয়শ": 600, "ছয়শ": 600, "choy sho": 600, "choysho": 600, "six hundred": 600,
  "সাতশো": 700, "সাতশত": 700, "সাতশ": 700, "sat sho": 700, "satsho": 700, "seven hundred": 700,
  "আটশো": 800, "আটশত": 800, "আটশ": 800, "aat sho": 800, "aatsho": 800, "at sho": 800, "eight hundred": 800,
  "নয়শো": 900, "নয়শো": 900, "নয়শ": 900, "noy sho": 900, "noysho": 900, "nine hundred": 900,

  // Thousands
  "ওয়ান থাউজ্যান্ড": 1000, "ওয়ান থাউজ্যান্ড": 1000, "থাউজ্যান্ড": 1000, "thousand": 1000, "one thousand": 1000,
  "হাজার": 1000, "এক হাজার": 1000, "hajar": 1000, "ek hajar": 1000,
  "দেড় হাজার": 1500, "দেড় হাজার": 1500, "der hajar": 1500, "dedh hajar": 1500, "one and half thousand": 1500,
  "দুই হাজার": 2000, "dui hajar": 2000, "two thousand": 2000, "টু থাউজ্যান্ড": 2000,
  "আড়াই হাজার": 2500, "আড়াই হাজার": 2500, "arai hajar": 2500, "two and half thousand": 2500,
  "তিন হাজার": 3000, "tin hajar": 3000, "three thousand": 3000, "থ্রি থাউজ্যান্ড": 3000,
  "চার হাজার": 4000, "char hajar": 4000, "four thousand": 4000,
  "পাঁচ হাজার": 5000, "পাচ হাজার": 5000, "panch hajar": 5000, "pach hajar": 5000, "five thousand": 5000, "ফাইভ থাউজ্যান্ড": 5000,
  "ছয় হাজার": 6000, "ছয় হাজার": 6000, "choy hajar": 6000,
  "সাত হাজার": 7000, "sat hajar": 7000,
  "আট হাজার": 8000, "aat hajar": 8000,
  "নয় হাজার": 9000, "noy hajar": 9000,
  "দশ হাজার": 10000, "dosh hajar": 10000, "ten thousand": 10000, "টেন থাউজ্যান্ড": 10000,
  "পনেরো হাজার": 15000, "ponero hajar": 15000,
  "বিশ হাজার": 20000, "কুড়ি হাজার": 20000, "bish hajar": 20000, "twenty thousand": 20000,
  "পঁচিশ হাজার": 25000, "pochish hajar": 25000,
  "পঞ্চাশ হাজার": 50000, "পচাশ হাজার": 50000, "ponchash hajar": 50000,
  "এক লাখ": 100000, "ek lakh": 100000, "ek lac": 100000, "one lakh": 100000,

  // Tens & Single
  "পঞ্চাশ": 50, "পচাশ": 50, "ponchash": 50, "pachash": 50, "pashash": 50,
  "চল্লিশ": 40, "chollish": 40,
  "ত্রিশ": 30, "trish": 30,
  "বিশ": 20, "কুড়ি": 20, "bish": 20, "kuri": 20,
  "দশ": 10, "dosh": 10
};

// Category keywords mapping
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Food & Dining": [
    "restaurant", "resturant", "restora", "রেস্টুরেন্ট", "রেস্তোরাঁ", "khabar", "খাবার", "khailam", "খেলাম",
    "kacchi", "কাচ্চি", "biryani", "বিরিয়ানি", "বিরিয়ানি", "burger", "বার্গার", "pizza", "পিজ্জা",
    "fuchka", "ফুচকা", "chotpoti", "চটপটি", "momo", "মোমো", "cha", "চা", "coffee", "কফি",
    "nasta", "নাস্তা", "lunch", "লঞ্চ", "dinner", "ডিনার", "breakfast", "সকাল", "ভাত", "bhat",
    "sweets", "মিষ্টি", "mishti", "bakery", "বেকারি", "cake", "কেক", "snack", "snacks", "স্ন্যাক্স"
  ],
  "Transport": [
    "rickshaw", "রিকশা", "রিক্সায়", "রিকশায়", "cng", "সিএনজি", "uber", "উবার", "pathao", "পাঠাও",
    "bus", "বাস", "vara", "ভাড়া", "ভাড়া", "petrol", "অকটেন", "octane", "cng pump", "gas",
    "train", "ট্রেন", "metro", "মেট্রো", "metrorail", "মেট্রোরেল", "fare", "toll", "টোল"
  ],
  "Groceries": [
    "bazar", "bajar", "বাজার", "grocery", "মুদি", "shwapno", "স্বপ্ন", "agora", "আগোরা", "meena bazar", "মীনা বাজার",
    "unimart", "চাল", "ডাল", "তেল", "সবজি", "sobji", "chal", "dal", "tel", "mach", "মাছ", "mangsho", "মাংস",
    "super shop", "কাঁচাবাজার", "ডিম", "egg", "দুধ", "milk"
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
    "pharmacy", "ফার্মেসি", "টেস্ট", "test", "চিকিৎসা", "dentist", "ডেন্টিস্ট", "clinic", "ক্লিনিক"
  ],
  "Education": [
    "teacher", "টিচার", "teacher fee", "টিচার ফি", "teachers", "শিক্ষক", "স্যার", "ম্যাডাম", "ম্যাম",
    "tuition", "টিউশনি", "টিউশন", "school", "স্কুল", "college", "কলেজ", "university", "ভার্সিটি",
    "boi", "বই", "khata", "খাতা", "coaching", "কোচিং", "exam fee", "পরীক্ষার ফি", "fee", "ফি"
  ],
  "Entertainment": [
    "ghurte", "ঘুরতে", "tour", "ট্যুর", "cinema", "সিনেমা", "movie", "মুভি", "star cineplex",
    "adda", "আড্ডা", "game", "গেম", "outing"
  ],
  "Fitness & Gym": [
    "gym", "জিম", "fitness", "ফিটনেস", "workout", "ব্যায়াম", "swimming", "সুইমিং", "sports", "খেলাধূলা"
  ],
  "Donation & Charity": [
    "donation", "ডোনেশন", "দান", "সদকা", "sadaqah", "zakat", "যাকাত", "সাহায্য", "charity", "মসজিদ", "mosque"
  ],
  "Personal Care": [
    "salon", "সেলুন", "haircut", "চুল কাটা", "parlour", "পার্লার", "spa", "রূপচর্চা"
  ],
  "Maintenance": [
    "car wash", "কার ওয়াশ", "wash", "garage", "গ্যারেজ", "servicing", "সার্ভিসিং", "repair", "মেরামত"
  ],
  "Housing & Rent": [
    "rent", "ভাড়া", "ভাড়া", "বাড়ি ভাড়া", "বাসা ভাড়া", "bari bhara", "basa bhara"
  ],
  "Laundry": [
    "laundry", "লন্ড্রি", "লন্ড্রিতে", "ধোপা", "dry clean", "ড্রাই ক্লিন", "istri", "ইস্ত্রি"
  ],
  "Pets": [
    "pet", "pets", "cat", "dog", "বিড়াল", "বিড়ালের", "কুকুর", "পোষা প্রাণী"
  ],
  "Lost Money": [
    "lost", "লস্ট", "হারায়", "হারায়", "হারায় গেছে", "হারায় গেছে", "হারিয়ে গেছে", "হারিয়ে গেছে",
    "হারিয়ে", "হারিয়ে", "হারালাম", "haray", "harie", "haraye", "haralam",
    "চুরি", "চুরি গেছে", "churi", "stolen", "misplaced", "lost money"
  ]
};

// Expense intent keywords (Bangla, Banglish, English)
const EXPENSE_INTENT_WORDS = [
  "খরচ", "দিলাম", "কিনলাম", "গেছে", "লাগল", "কাটলো", "কাটসে", "শেষ", "খাইলাম", "উড়াইলাম",
  "উড়ালাম", "দিছি", "বিল", "পাঠালাম", "পাঠাইলাম", "সেন্ড", "পেমেন্ট", "লস্ট", "হারিয়ে গেছে", "হারিয়ে গেছে",
  "হারায় গেছে", "হারায় গেছে", "হারায়", "হারায়", "হারিয়ে", "হারিয়ে", "হারালাম", "চুরি", "চুরি গেছে", "ফি",
  "khoroch", "dilam", "kinlam", "geche", "laglo", "katlo", "katse", "sesh", "khailam",
  "urailam", "dichi", "bill", "pathalam", "pathailam", "send", "payment", "paid",
  "spent", "cost", "costing", "shopping", "lost", "fee", "haray", "churi"
];

// Income intent keywords
const INCOME_INTENT_WORDS = [
  "পেলাম", "আসলো", "ঢুকলো", "পাইছি", "পাইসি", "পেয়েছি", "পেয়েছি", "দিছে", "দিয়েছে", "দিয়েছে", "জমা",
  "বেতন", "স্যালারি", "টিউশনি", "লাভ", "ইনকাম", "আয়", "আয়", "বোনাস", "ক্যাশব্যাক", "ফেরত", "উঠাইলাম",
  "উপহার", "সালামি",
  "pelam", "ashlo", "dhuklo", "paisi", "paici", "peyechi", "diche", "joma", "beton", "salary",
  "bonus", "income", "received", "got", "credited", "cashback", "refund", "salami", "profit"
];

// Wallet keywords mapping for Bangladeshi users
export const WALLET_KEYWORDS: Record<string, string[]> = {
  "bKash": ["bkash", "b-kash", "বিকাশ", "বিকাশে", "বিকাশ থেকে", "bikas"],
  "Nagad": ["nagad", "নগদ", "নগদে", "নগদ থেকে", "nogod"],
  "Rocket": ["rocket", "রকেট", "রকেটে", "16216"],
  "Cash": [
    "cash", "ক্যাশ", "নগদ টাকা", "ক্যাশে", "হাতে", "হাত খরচ",
    "pocket", "পকেট", "পকেটে", "পকেট থেকে", "পকেটের", "poket",
    "মানিব্যাগ", "মানিব্যাগে", "মানিব্যাগ থেকে", "মানিব্যাগের", "wallet", "মানি ব্যাগ", "moneybag", "manibag"
  ],
  "Bank": ["bank", "ব্যাংক", "ব্যাংকে", "city bank", "citybank", "সিটি ব্যাংক", "brac bank", "brac", "ব্র্যাক", "dbbl", "nexus", "নেক্সাস", "cellfin", "সেলফিন", "ibbl", "ebl", "sonali", "সোনালী", "ডাচ বাংলা"],
  "Upay": ["upay", "উপায়", "উপায়ে"]
};

export function extractWallet(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [walletName, keywords] of Object.entries(WALLET_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return walletName;
    }
  }
  return undefined;
}

/**
 * Automatically assigns a fitting emoji to a new or custom category
 */
export function guessCategoryEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("gym") || lower.includes("fitness") || lower.includes("ব্যায়াম") || lower.includes("জিম")) return "🏋️";
  if (lower.includes("car") || lower.includes("wash") || lower.includes("গাড়ি") || lower.includes("গাড়ি")) return "🚗";
  if (lower.includes("dentist") || lower.includes("doctor") || lower.includes("ডাক্তার") || lower.includes("চিকিৎসা") || lower.includes("medicine") || lower.includes("ঔষধ")) return "🩺";
  if (lower.includes("laundry") || lower.includes("লন্ড্রি")) return "🧺";
  if (lower.includes("donation") || lower.includes("charity") || lower.includes("দান") || lower.includes("সদকা") || lower.includes("যাকাত")) return "🤲";
  if (lower.includes("book") || lower.includes("বই") || lower.includes("library")) return "📚";
  if (lower.includes("coffee") || lower.includes("কফি") || lower.includes("tea") || lower.includes("চা")) return "☕";
  if (lower.includes("pet") || lower.includes("cat") || lower.includes("dog") || lower.includes("বিড়াল") || lower.includes("কুকুর")) return "🐾";
  if (lower.includes("gift") || lower.includes("উপহার")) return "🎁";
  if (lower.includes("salon") || lower.includes("hair") || lower.includes("পার্লার") || lower.includes("সেলুন")) return "💇";
  if (lower.includes("movie") || lower.includes("cinema") || lower.includes("সিনেমা") || lower.includes("নাটক")) return "🎬";
  if (lower.includes("game") || lower.includes("gaming") || lower.includes("গেম")) return "🎮";
  if (lower.includes("rent") || lower.includes("ভাড়া") || lower.includes("ভাড়া") || lower.includes("বাসা")) return "🏠";
  if (lower.includes("food") || lower.includes("খাবার") || lower.includes("রেস্টুরেন্ট") || lower.includes("restaurant") || lower.includes("burger") || lower.includes("pizza") || lower.includes("biryani")) return "🍔";
  if (lower.includes("travel") || lower.includes("ট্যুর") || lower.includes("tour") || lower.includes("trip")) return "✈️";
  if (lower.includes("shop") || lower.includes("শপিং") || lower.includes("cloth") || lower.includes("কাপড়")) return "🛍️";
  if (lower.includes("lost") || lower.includes("haray") || lower.includes("হারায়") || lower.includes("হারায়") || lower.includes("হারিয়ে") || lower.includes("হারিয়ে") || lower.includes("stolen") || lower.includes("চুরি")) return "💸";
  if (lower.includes("tech") || lower.includes("mobile") || lower.includes("phone") || lower.includes("ফোন")) return "📱";
  return "🏷️";
}

/**
 * Extracts a dynamic subject noun from speech when no predefined keyword matches.
 * Strips digits, currency units, intent verbs, wallets, and trailing locative suffixes.
 */
function extractDynamicSubject(text: string, detectedWallet?: string): string | null {
  let clean = text
    .replace(/[০-৯0-9]+/g, " ")
    .replace(/(?:taka|টাকা|tk|bdt|৳|poisa|পয়সা)/gi, " ")
    .trim();

  // Strip wallet names and prepositions
  if (detectedWallet) {
    clean = clean.replace(new RegExp(`(?:theke|diye|e|থেকে|দিয়ে|দিয়ে)?\\s*${detectedWallet}\\s*(?:theke|diye|e|থেকে|দিয়ে|দিয়ে)?`, "gi"), " ");
  }
  clean = clean.replace(/(?:বিকাশ|বিকাশে|বিকাশ থেকে|নগদ|নগদে|নগদ থেকে|রকেট|রকেটে|ক্যাশ|ক্যাশে|ক্যাশ থেকে|ব্যাংক|ব্যাংকে|পকেট|পকেটে|পকেট থেকে|মানিব্যাগ|মানিব্যাগে|মানিব্যাগ থেকে|pocket|wallet)(?:\s*(?:থেকে|diye|theke|দিয়ে|দিয়ে))?/gi, " ");

  // Strip known common verbs / intent / filler words
  // Strip known common verbs / intent / filler words (both Bengali and English/Banglish)
  const removeWords = new Set([
    "খরচ", "দিলাম", "কিনলাম", "গেছে", "লাগল", "কাটলো", "কাটসে", "শেষ", "খাইলাম", "উড়াইলাম",
    "উড়ালাম", "দিছি", "বিল", "পাঠালাম", "পাঠাইলাম", "সেন্ড", "পেমেন্ট", "আজকে", "কালকে",
    "হারায়", "হারায়", "হারিয়ে", "হারিয়ে", "হারালাম", "লস্ট", "চুরি",
    "khoroch", "dilam", "kinlam", "geche", "laglo", "katlo", "katse", "sesh", "khailam",
    "urailam", "dichi", "bill", "pathalam", "pathailam", "send", "payment", "paid",
    "spent", "cost", "costing", "shopping", "pay", "ajke", "kalke", "today", "yesterday",
    "amar", "amake", "kore", "ashlam", "giye", "geye", "করে", "আসলাম", "গিয়ে", "গিয়ে",
    "theke", "diye", "jonno", "pichone", "থেকে", "দিয়ে", "দিয়ে", "lost", "haray", "churi",
    "জন্য", "পিছনে", "বাবদ", "নিয়ে", "নিলাম", "nilam", "fee", "ফি", "rate", "রেট"
  ]);

  // Strip postposition suffixes in Banglish (e, te, tey, er) and Bangla (এ, তে, য়, য়ে, র, এর, কে)
  const words = clean
    .split(/\s+/)
    .map((word) => word.trim().replace(/[.,!?;:'"()[\]{}]/g, ""))
    .filter((w) => w.length > 0 && !removeWords.has(w.toLowerCase()))
    .map((word) => {
      let w = word.trim();
      if (w.length > 3) {
        w = w.replace(/(?:tey|te|er)$/i, "");
        if (w.length > 3 && w.endsWith("e") && !["coffee", "free", "tree", "shoe"].includes(w.toLowerCase())) {
          w = w.slice(0, -1);
        }
      }
      w = w.replace(/(?:তে|য়ের|কে|দের|এর|এ)$/g, "");
      return w;
    })
    .filter((w) => w.length > 1 && !removeWords.has(w.toLowerCase()));

  if (!words.length) return null;

  // Title-case the extracted word(s)
  const result = words
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return result.length >= 2 ? result : null;
}

export const BENGALI_TO_ENGLISH_CATEGORY_MAP: Record<string, string> = {
  // Laundry / Cleaning
  "লন্ড্রি": "Laundry",
  "লন্ড্রিতে": "Laundry",
  "ধোপা": "Laundry",
  "ড্রাই ক্লিন": "Dry Cleaning",
  "ইস্ত্রি": "Laundry",
  "কাপড় ধোয়া": "Laundry",
  "কাপড় ধোয়া": "Laundry",
  "ওয়াশ": "Maintenance",
  "ওয়াশ": "Maintenance",

  // Fitness / Sports
  "জিম": "Fitness & Gym",
  "ফিটনেস": "Fitness & Gym",
  "ব্যায়াম": "Fitness & Gym",
  "ব্যায়াম": "Fitness & Gym",
  "সাঁতার": "Fitness & Gym",
  "সুইমিং": "Fitness & Gym",
  "খেলাধূলা": "Fitness & Gym",
  "খেলাধুলা": "Fitness & Gym",
  "স্পোর্টস": "Fitness & Gym",
  "ফুটবল": "Fitness & Gym",
  "ক্রিকেট": "Fitness & Gym",
  "ব্যাডমিন্টন": "Fitness & Gym",

  // Health / Medical
  "ডাক্তার": "Healthcare",
  "ডেন্টিস্ট": "Dentist",
  "দাঁত": "Dentist",
  "ওষুধ": "Medicine",
  "ঔষধ": "Medicine",
  "ফার্মেসি": "Pharmacy",
  "হাসপাতাল": "Hospital",
  "ক্লিনিক": "Clinic",
  "চিকিৎসা": "Healthcare",
  "টেস্ট": "Healthcare",
  "প্রেসক্রিপশন": "Healthcare",
  "ব্যান্ডেজ": "Healthcare",

  // Vehicles / Maintenance
  "গাড়ি ওয়াশ": "Car Wash",
  "কার ওয়াশ": "Car Wash",
  "কার ওয়াশ": "Car Wash",
  "গ্যারেজ": "Maintenance",
  "সার্ভিসিং": "Maintenance",
  "মেরামত": "Maintenance",
  "মেকানিক": "Maintenance",
  "গাড়ির কাজ": "Maintenance",
  "বাইক": "Maintenance",

  // Fuel / Energy
  "পেট্রোল": "Fuel",
  "ডিজেল": "Fuel",
  "অকটেন": "Fuel",
  "তেল": "Fuel",

  // Food / Dining / Cafe
  "খাবার": "Food & Dining",
  "রেস্টুরেন্ট": "Food & Dining",
  "রেস্তোরাঁ": "Food & Dining",
  "নাস্তা": "Food & Dining",
  "চা": "Food & Dining",
  "কফি": "Coffee",
  "মিষ্টি": "Food & Dining",
  "বেকারি": "Food & Dining",
  "বিরিয়ানি": "Food & Dining",
  "বিরিয়ানি": "Food & Dining",
  "বার্গার": "Food & Dining",
  "পিজ্জা": "Food & Dining",
  "ফুচকা": "Food & Dining",
  "চটপটি": "Food & Dining",
  "মোমো": "Food & Dining",
  "কাচ্চি": "Food & Dining",
  "হালিম": "Food & Dining",
  "আইসক্রিম": "Food & Dining",
  "জুস": "Food & Dining",
  "ফাস্টফুড": "Food & Dining",
  "ডিনার": "Food & Dining",
  "লাঞ্চ": "Food & Dining",
  "ভাত": "Food & Dining",

  // Groceries
  "বাজার": "Groceries",
  "মুদি": "Groceries",
  "কাঁচাবাজার": "Groceries",
  "সবজি": "Groceries",
  "শাকসবজি": "Groceries",
  "তরকারি": "Groceries",
  "মাছ": "Groceries",
  "মাংস": "Groceries",
  "চাল": "Groceries",
  "ডাল": "Groceries",
  "ডিম": "Groceries",
  "দুধ": "Groceries",
  "ফল": "Groceries",
  "পেঁয়াজ": "Groceries",
  "আলু": "Groceries",
  "সুপারশপ": "Groceries",

  // Rent / Housing
  "বাসা ভাড়া": "Housing & Rent",
  "বাড়ি ভাড়া": "Housing & Rent",
  "মেস ভাড়া": "Housing & Rent",
  "রুম ভাড়া": "Housing & Rent",
  "ফ্ল্যাট ভাড়া": "Housing & Rent",
  "ভাড়া": "Housing & Rent",
  "বাসা": "Housing & Rent",
  "বাড়ি": "Housing & Rent",
  "মেস": "Housing & Rent",

  // Shopping / Clothing
  "শপিং": "Shopping",
  "কেনাকাটা": "Shopping",
  "কাপড়": "Shopping",
  "কাপড়": "Shopping",
  "শার্ট": "Shopping",
  "প্যান্ট": "Shopping",
  "টিশার্ট": "Shopping",
  "পাঞ্জাবি": "Shopping",
  "শাড়ি": "Shopping",
  "পোশাক": "Shopping",
  "জুতা": "Shopping",
  "জুতো": "Shopping",
  "স্যান্ডেল": "Shopping",
  "ব্যাগ": "Shopping",
  "ঘড়ি": "Shopping",
  "চশমা": "Shopping",
  "কসমেটিক্স": "Shopping",
  "মেকআপ": "Shopping",
  "আড়ং": "Shopping",
  "দারাজ": "Shopping",
  "এপেক্স": "Shopping",
  "বাটা": "Shopping",
  "খেলনা": "Shopping",

  // Utilities / Bills
  "বিদ্যুৎ": "Utilities",
  "কারেন্ট": "Utilities",
  "কারেন্ট বিল": "Utilities",
  "পানি": "Utilities",
  "পানির বিল": "Utilities",
  "গ্যাস": "Utilities",
  "গ্যাস বিল": "Utilities",
  "বিল": "Utilities",
  "ওয়াইফাই": "Utilities",
  "ইন্টারনেট": "Utilities",
  "নেট বিল": "Utilities",
  "রিচার্জ": "Utilities",
  "ফ্লেক্সিলোড": "Utilities",
  "মোবাইল রিচার্জ": "Utilities",

  // Transport
  "রিকশা": "Transport",
  "বাস": "Transport",
  "সিএনজি": "Transport",
  "উবার": "Transport",
  "পাঠাও": "Transport",
  "মেট্রোরেল": "Transport",
  "মেট্রো": "Transport",
  "ট্রেন": "Transport",
  "যাতায়াত": "Transport",
  "টিকিট": "Transport",
  "টোল": "Transport",
  "পার্কিং": "Transport",
  "ট্যাক্সি": "Transport",

  // Personal Care
  "সেলুন": "Personal Care",
  "পার্লার": "Personal Care",
  "চুল কাটা": "Personal Care",
  "হেয়ারকাট": "Personal Care",
  "সেভ": "Personal Care",
  "ফেসিয়াল": "Personal Care",
  "রূপচর্চা": "Personal Care",
  "স্পা": "Personal Care",

  // Entertainment / Travel
  "সিনেমা": "Entertainment",
  "মুভি": "Entertainment",
  "নাটক": "Entertainment",
  "কনসার্ট": "Entertainment",
  "ট্যুর": "Entertainment",
  "ভ্রমণ": "Entertainment",
  "হোটেল": "Entertainment",
  "ঘুরতে": "Entertainment",
  "ঘোরাঘুরি": "Entertainment",
  "পিকনিক": "Entertainment",
  "আড্ডা": "Entertainment",

  // Education
  "টিচার ফি": "Education",
  "টিচার": "Education",
  "teacher fee": "Education",
  "teacher": "Education",
  "শিক্ষক": "Education",
  "মাস্টার": "Education",
  "স্যার": "Education",
  "ম্যাডাম": "Education",
  "ম্যাম": "Education",
  "টিউশনি": "Tuition",
  "টিউশন": "Tuition",
  "স্কুল": "Education",
  "কলেজ": "Education",
  "ভার্সিটি": "Education",
  "বিশ্ববিদ্যালয়": "Education",
  "বই": "Education",
  "খাতা": "Education",
  "কলম": "Education",
  "কোচিং": "Education",
  "পরীক্ষার ফি": "Education",
  "সেমিস্টার ফি": "Education",
  "ফি": "Education",

  // Charity / Gifts / Pets
  "দান": "Donation & Charity",
  "সদকা": "Donation & Charity",
  "যাকাত": "Donation & Charity",
  "সাহায্য": "Donation & Charity",
  "উপহার": "Gift",
  "গিফট": "Gift",
  "সালামি": "Gift",
  "বিড়াল": "Pets",
  "কুকুর": "Pets",
  "বিড়ালের খাবার": "Pets",
  "পোষা প্রাণী": "Pets",

  // Services
  "দর্জি": "Tailor",
  "টেইলার": "Tailor",
  "কুরিয়ার": "Services",
  "ফার্নিচার": "Home & Living",

  // Lost / Misplaced Money
  "হারায় গেছে": "Lost Money",
  "হারায়": "Lost Money",
  "হারায় গেছে": "Lost Money",
  "হারায়": "Lost Money",
  "হারিয়ে গেছে": "Lost Money",
  "হারিয়ে গেছে": "Lost Money",
  "হারিয়ে": "Lost Money",
  "হারিয়ে": "Lost Money",
  "হারালাম": "Lost Money",
  "লস্ট": "Lost Money",
  "চুরি গেছে": "Lost Money",
  "চুরি": "Lost Money",
  "haray": "Lost Money",
  "harie": "Lost Money",
  "haraye": "Lost Money",
  "haralam": "Lost Money",
  "churi": "Lost Money",
  "lost money": "Lost Money",
  "lost": "Lost Money"
};

/**
 * Safely matches a keyword in text, ensuring that short keywords (<= 3 characters, like "চা", "বাস", "ডাল", "তেল", "বিল", "গ্যাস", "ফি")
 * are not falsely matched as substrings inside other words (e.g. "টিচার" should never match "চা", "অভ্যাস" should never match "গ্যাস")!
 */
export function matchKeyword(text: string, kw: string): boolean {
  const cleanKw = kw.trim().toLowerCase();
  const lowerText = text.toLowerCase();

  if (!cleanKw || !lowerText.includes(cleanKw)) return false;

  // Words with 4 or more characters (e.g. "restaurant", "medicine", "লন্ড্রি", "টিচার") can safely be substring matched
  if (cleanKw.length > 3) {
    return true;
  }

  // For short words (length <= 3 like "চা", "বাস", "ভাত", "ডাল", "তেল", "বিল", "গ্যাস", "ফি"),
  // MUST enforce word boundaries (whitespace, punctuation, start/end of string, or optional locative inflection)
  const escaped = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|[\\s।,?!.:;'"()[\\]{}/_\\-])${escaped}(?:[েয়য়েররতে]|te|e)?(?:[\\s।,?!.:;'"()[\\]{}/_\\-]|$)`, "i");
  return regex.test(lowerText);
}

/**
 * Ensures any category name is ALWAYS a real, proper English category.
 * If spoken in Bengali, it resolves via semantic dictionary or sentence context.
 * Never creates crude letter-by-letter Avro transliteration.
 */
export function ensureEnglishCategory(category: string, fullSentence?: string): string {
  const trimmed = category.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct dictionary match against Bengali mapping
  const entries = Object.entries(BENGALI_TO_ENGLISH_CATEGORY_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [bnWord, enCategory] of entries) {
    if (matchKeyword(lower, bnWord) || matchKeyword(bnWord, lower)) {
      return enCategory;
    }
  }

  // 2. If text contains Bengali script ([\u0980-\u09FF]), DO NOT Avro-transliterate!
  // Instead, infer intent from full sentence context or default to a standard category
  if (/[\u0980-\u09FF]/.test(trimmed)) {
    const context = (fullSentence || "").toLowerCase();
    if (
      context.includes("খাই") ||
      context.includes("খেলা") ||
      context.includes("খাবার") ||
      context.includes("নাস্তা") ||
      context.includes("ভাত")
    ) {
      return "Food & Dining";
    }
    if (
      context.includes("কিন") ||
      context.includes("শপিং") ||
      context.includes("দোকান") ||
      context.includes("দারাজ")
    ) {
      return "Shopping";
    }
    if (
      context.includes("গেলা") ||
      context.includes("আসলা") ||
      context.includes("ভাড়া") ||
      context.includes("ভাড়া") ||
      context.includes("যাতায়াত")
    ) {
      return "Transport";
    }
    if (
      context.includes("বাজার") ||
      context.includes("মুদি") ||
      context.includes("শাকসবজি")
    ) {
      return "Groceries";
    }
    if (
      context.includes("অসুস্থ") ||
      context.includes("ব্যথা") ||
      context.includes("চিকিৎসা") ||
      context.includes("ডাক্তার")
    ) {
      return "Healthcare";
    }
    if (
      context.includes("হারায়") ||
      context.includes("হারায়") ||
      context.includes("হারিয়ে") ||
      context.includes("হারিয়ে") ||
      context.includes("লস্ট") ||
      context.includes("চুরি") ||
      context.includes("lost")
    ) {
      return "Lost Money";
    }
    return "General Expense";
  }

  // 3. Already in English / Latin: title-case cleanly (e.g. "Dentist", "Car Wash", "Gym")
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Guesses category from spoken text. Matches user custom categories, then standard keywords,
 * and if none matches, dynamically extracts the subject noun so it NEVER falls back to 'Other'.
 * ALWAYS returns the category name strictly in English.
 */
export function extractCategory(
  text: string,
  type: "income" | "expense",
  existingCategories?: string[],
  detectedWallet?: string
): string {
  const lower = text.toLowerCase();

  // 1. Check existing custom categories (longest first to avoid substring confusion)
  if (existingCategories && existingCategories.length > 0) {
    const sorted = [...existingCategories].sort((a, b) => b.length - a.length);
    for (const cat of sorted) {
      if (cat && cat.trim() && lower.includes(cat.trim().toLowerCase())) {
        return ensureEnglishCategory(cat.trim(), text);
      }
    }
  }

  // 2. Income categories (always English)
  if (type === "income") {
    if (lower.includes("salary") || lower.includes("বেতন") || lower.includes("beton") || lower.includes("স্যালারি")) return "Salary";
    if (lower.includes("freelance") || lower.includes("ফ্রিল্যান্স") || lower.includes("upwork") || lower.includes("fiverr")) return "Freelance";
    if (lower.includes("tuition") || lower.includes("টিউশন") || lower.includes("টিউশনি")) return "Tuition";
    if (lower.includes("investment") || lower.includes("লাভ") || lower.includes("শেয়ার") || lower.includes("profit") || lower.includes("dividend")) return "Investments";
    if (lower.includes("gift") || lower.includes("উপহার") || lower.includes("সালামি") || lower.includes("salami")) return "Gift";
    if (lower.includes("bonus") || lower.includes("বোনাস")) return "Bonus";
    if (lower.includes("cashback") || lower.includes("ক্যাশব্যাক") || lower.includes("refund") || lower.includes("ফেরত")) return "Cashback";
    return "Income";
  }

  // 3. Predefined keywords matching (always English, safely boundary-checked)
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => matchKeyword(lower, kw))) {
      return category;
    }
  }

  // 4. Direct Bengali semantic dictionary scan across spoken text (longest word first)
  const sortedDict = Object.entries(BENGALI_TO_ENGLISH_CATEGORY_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [bnWord, enCategory] of sortedDict) {
    if (matchKeyword(lower, bnWord)) {
      return enCategory;
    }
  }

  // 5. Dynamic extraction: Extract spoken noun/subject and ensure it is strictly English
  const dynamic = extractDynamicSubject(text, detectedWallet);
  if (dynamic && dynamic.length >= 2 && dynamic.length <= 30) {
    return ensureEnglishCategory(dynamic, text);
  }

  return "General Expense";
}

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

  // 1. Check spoken phrases first (longest phrases first to avoid partial substring collisions)
  const sortedPhrases = Object.entries(SPOKEN_NUMBERS).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [phrase, value] of sortedPhrases) {
    if (
      new RegExp(`(?:^|\\s|[.,!?])${phrase}(?:\\s|[.,!?]|$)`, "i").test(normalized) ||
      normalized.includes(phrase)
    ) {
      return value;
    }
  }

  // 2. Look for "k" notation: e.g. "1.5k", "2k", "10k"
  const kMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch && kMatch[1]) {
    const val = parseFloat(kMatch[1]) * 1000;
    if (!isNaN(val) && val > 0) return val;
  }

  // 3. Look for explicit number patterns: "500 takar", "400 taka", "৳ 500", "500.00", "1500"
  const numberMatches = normalized.match(/(?:tk\.?|bdt|৳|টাকা|টাকার|takar|taka)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:tk\.?|bdt|৳|টাকা|টাকার|takar|taka)?/gi);
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

  return incomeScore > expenseScore ? "income" : "expense";
}

/**
 * Creates a clean, human-readable note from spoken speech
 */
function extractNote(
  text: string,
  category: string,
  amount: number | null,
  detectedWallet?: string,
  type?: "income" | "expense"
): string {
  let clean = text;

  // 1. Remove currency symbols and numbers with optional trailing suffixes (e.g. "400 টাকার", "৳1,00,000", "500 taka")
  clean = clean
    .replace(/(?:৳|tk\.?|bdt|টাকা|টাকায়|টাকায়|টাকার|taka|takar)?\s*[০-৯0-9,]+(?:\.[০-৯0-9]+)?\s*(?:টাকার|টাকায়|টাকায়|টাকা|taka|takar|tk\.?|bdt|৳)?/gi, " ")
    .replace(/[০-৯0-9]+/g, " ");

  // 2. Remove all mentions of wallets with their inflected locative cases (e.g. বিকাশে, ব্যাংকে, পকেটে, ক্যাশে)
  clean = clean.replace(
    /(?:বিকাশ(?:ে|ের|টায়|টা| এ)?|নগদ(?:ে|ের)?|রকেট(?:ে|ের)?|ব্যাংক(?:ে|ের)?|ক্যাশ(?:ে|ের)?|পকেট(?:ে|ের)?|মানিব্যাগ(?:ে|ের)?|bkash|nagad|rocket|bank|cash|pocket|wallet)(?:\s*(?:থেকে|theke|diye|দিয়ে|দিয়ে|এ|e))?/gi,
    " "
  );

  // 3. Remove standalone prepositions left behind
  clean = clean.replace(/\b(?:theke|diye|e|থেকে|দিয়ে|দিয়ে|দারা|দ্বারা)\b/gi, " ");

  // 4. If transaction is Income, remove leading redundant intent words (e.g. "ইনকাম ঈদ বোনাস" -> "ঈদ বোনাস")
  if (type === "income") {
    clean = clean.replace(/^(?:\s*ইনকাম|\s*আয়|\s*আয়|\s*income)\s+/i, " ");
  }

  // 5. Remove any leftover commas, punctuation, and orphaned Bengali vowel signs/diacritics
  clean = clean
    .replace(/(?:^|\s)[\u0981-\u0983\u09BC-\u09CD\u09D7\u09E2\u09E3]+/g, " ")
    // Remove isolated single-letter Bengali genitives or prepositions left dangling (e.g. "র ", "এর ")
    .replace(/(?:^|\s)(?:র|এর|ো|ে)(?:\s|$)/g, " ")
    // Clean all punctuation from beginning and end
    .replace(/^[\s,।.?!:;'"()[\]{}/_\-]+|[\s,।.?!:;'"()[\]{}/_\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // If text is too short or empty, default to category name
  if (clean.length < 2) {
    return category;
  }

  // Clean trailing punctuation again if any remains
  clean = clean.replace(/[\s,।.?!:;'"()[\]{}/_\-]+$/g, "").trim();

  // Capitalize first letter
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Main parser entry point
 */
export function parseVoiceInput(
  spokenText: string,
  existingCategories?: string[]
): ParsedVoiceTransaction | null {
  if (!spokenText || typeof spokenText !== "string") return null;

  const text = spokenText.trim();
  if (text.length === 0) return null;

  const amount = extractAmount(text);
  if (!amount || amount <= 0) {
    return null; // Could not identify an amount
  }

  const type = extractType(text);
  const detectedWallet = extractWallet(text);
  const category = extractCategory(text, type, existingCategories, detectedWallet);
  const note = extractNote(text, category, amount, detectedWallet, type);

  return {
    amount,
    type,
    category,
    note,
    detectedWallet,
    confidence: 0.95,
    rawText: text,
  };
}
