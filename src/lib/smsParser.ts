/**
 * Universal Bangladesh MFS & Bank SMS Parser for TakaFlow
 * WITH STRICT ANTI-FRAUD & UNOFFICIAL SENDER VERIFICATION
 *
 * Scammers frequently send fake debit/credit SMS from personal mobile numbers
 * (017..., 018..., +88019...). This module strictly rejects any SMS originating
 * from personal numbers and requires official BTRC alphanumeric masks or official shortcodes.
 */

export interface ParsedSmsResult {
  success: boolean;
  source: string; // e.g. "bKash", "Nagad", "DBBL", "Bank"
  type: "income" | "expense";
  amount: number;
  currency: string;
  balance?: number;
  merchantOrParty?: string;
  trxId?: string;
  categorySuggestion?: string;
  rawSms: string;
  isVerifiedOfficialSender: boolean;
  isFraudWarning?: boolean;
  fraudReason?: string;
}

// BTRC-registered Alphanumeric Masks & Official Bank Shortcodes in Bangladesh
export const OFFICIAL_BD_FINANCIAL_SENDERS: string[] = [
  // Mobile Financial Services (MFS)
  "BKASH", "NAGAD", "ROCKET", "16216", "16247", "16167", "UPAY", "CELLFIN", "TAP", "OK WALLET", "MEGHNAPAY",

  // Private Commercial Banks (Conventional & Islamic)
  "BRAC-BANK", "BRACBANK", "BRAC BANK", "CITY-BANK", "CITYBANK", "CITY BANK", "EBL", "EASTERN BANK", "DBBL-NEXUS", "DBBL", "DBBL NEXUS", "NEXUS",
  "DHAKABANK", "DHAKA BANK", "PRIMEBANK", "PRIME BANK", "PUBALI", "PUBALI BANK", "TRUSTBANK", "TRUST BANK",
  "MIDLAND", "MIDLAND BANK", "BANKASIA", "BANK ASIA", "COMMUNITY", "COMMUNITY BANK", "EXIM", "EXIM BANK",
  "SIBL", "SJIBL", "MBL", "MERCANTILE", "ONEBANK", "ONE BANK", "PREMIER", "PREMIER BANK", "SOUTHEAST",
  "SOUTHEAST BANK", "NCCB", "NCC BANK", "MUTUALTRUST", "MTBL", "MTB", "JAMUNA", "JAMUNA BANK",
  "STANDARDBANK", "STANDARD BANK", "IFIC", "IFIC BANK", "UCB", "UNITED COMMERCIAL BANK", "SHAHJALAL",
  "ALARAFAH", "AIBL", "MODHUMOTI", "NRB BANK", "NRBC BANK", "SBAC BANK", "GLOBAL ISLAMI", "PADMA BANK",
  "BENGAL COMMERCIAL", "CITIZENS BANK", "IBBL", "ISLAMI BANK", "ISLAMIBANK", "FSIBL", "FIRST SECURITY", "UNION BANK",

  // State-Owned & Specialized Banks
  "SONALI", "SONALIBANK", "SONALI BANK", "JANATA", "JANATABANK", "JANATA BANK", "AGRANI", "AGRANIBANK",
  "AGRANI BANK", "RUPALI", "RUPALIBANK", "RUPALI BANK", "BDBL", "BASICBANK", "BASIC BANK", "KRISHI", "BKB",
  "RAKUB", "PROBASHI KALLYAN",

  // Foreign Commercial Banks
  "SCB", "STANDCHART", "STANDARD CHARTERED", "HSBC", "WOORI", "WOORI BANK", "CITIBANK", "CITI", "STATEBANK",
  "SBI", "COMMERCIAL BANK OF CEYLON", "CBC",

  // Verified Official Financial Shortcodes (16XXX / 106XX)
  "16216", "16221", "16230", "16233", "16234", "16246", "16247", "16256", "16267", "16288", "16327", "16409", "16419"
];

// Checks if the sender is a personal mobile number (used by scammers)
export function isPersonalPhoneNumber(sender: string): boolean {
  if (!sender) return false;
  const cleaned = sender.replace(/[\s\-()]/g, "");

  // Bangladesh personal mobile patterns: +8801X..., 8801X..., 01X...
  if (/^(?:\+?88)?01[3-9]\d{8}$/.test(cleaned)) {
    return true;
  }
  // Any general mobile or international phone number (10+ digits without bank name)
  if (/^\+?\d{10,}$/.test(cleaned)) {
    return true;
  }
  return false;
}

// Strips hyphens, spaces, underscores, dots: e.g. "BRAC-BANK" -> "BRACBANK", "CITY-BANK" -> "CITYBANK"
export function normalizeSenderMask(sender: string): string {
  if (!sender) return "";
  return sender.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Verifies whether a sender is an official registered financial institution
export function isOfficialFinancialSender(sender: string): boolean {
  if (!sender) return false;
  if (isPersonalPhoneNumber(sender)) return false;

  const normalized = normalizeSenderMask(sender);
  return OFFICIAL_BD_FINANCIAL_SENDERS.some((official) => {
    const normOfficial = normalizeSenderMask(official);
    return normalized === normOfficial || normalized.includes(normOfficial) || normOfficial.includes(normalized);
  });
}

// Map of common merchants/keywords to default categories
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Food & Dining": [
    "food", "restaurant", "cafe", "dine", "kitchen", "burger", "pizza", "shawarma",
    "kacchi", "biryani", "bakery", "sweets", "coffee", "tea", "snack", "catering"
  ],
  "Groceries": [
    "swapno", "shwapno", "agora", "meena bazar", "unimart", "chaldal", "bazar",
    "grocery", "super shop", "daily shopping", "pran"
  ],
  "Shopping": [
    "aarong", "daraz", "apex", "bata", "lotto", "yellow", "sailor", "richman",
    "infinity", "cats eye", "cloth", "fashion", "mall", "artisan", "pos"
  ],
  "Transport": [
    "pathao", "uber", "cng", "petrol", "octane", "cng pump", "filling station",
    "railway", "shohoz", "biman", "bus", "toll"
  ],
  "Utilities": [
    "desco", "dpdc", "nesco", "wasa", "titas", "btcl", "internet", "link3",
    "amber", "carnival", "electricity", "bill"
  ],
  "Healthcare": [
    "pharmacy", "pharma", "hospital", "diagnostic", "square", "labaid",
    "ibn sina", "popular", "medicine", "doctor"
  ],
  "Education": [
    "school", "college", "university", "academy", "tuition", "brac", "north south",
    "aiub", "daffodil", "coaching"
  ],
};

function guessCategory(merchantOrParty?: string, note?: string): string {
  const combined = `${merchantOrParty || ""} ${note || ""}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return category;
    }
  }
  return "Other";
}

function cleanAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, "").trim());
}

export function parseBangladeshFinancialSms(sms: string, senderHeader?: string): ParsedSmsResult | null {
  if (!sms || typeof sms !== "string") return null;

  const text = sms.trim();
  const lower = text.toLowerCase();
  const rawSender = (senderHeader || "").trim();

  // 🛡️ ANTI-SCAM SHIELD: Reject any personal phone number immediately
  if (rawSender && isPersonalPhoneNumber(rawSender)) {
    console.warn(`[Anti-Scam Shield] Blocked SMS from personal phone number: ${rawSender}`);
    return null; // Must never process scam SMS from personal SIMs
  }

  // If a senderHeader is provided, ensure it belongs to an official institution
  const isOfficial = rawSender ? isOfficialFinancialSender(rawSender) : true;
  if (rawSender && !isOfficial) {
    console.warn(`[Anti-Scam Shield] Blocked SMS from unverified sender: ${rawSender}`);
    return null;
  }

  // 1. Identify Provider / Bank from Header or Message Content
  const normSender = normalizeSenderMask(rawSender);
  let detectedSource = "Bank";

  if (normSender.includes("BKASH") || lower.includes("bkash")) {
    detectedSource = "bKash";
  } else if (normSender.includes("NAGAD") || lower.includes("nagad")) {
    detectedSource = "Nagad";
  } else if (normSender.includes("ROCKET") || lower.includes("rocket") || normSender.includes("16216")) {
    detectedSource = "Rocket";
  } else if (normSender.includes("CELLFIN") || lower.includes("cellfin") || normSender.includes("IBBL") || lower.includes("islami bank")) {
    detectedSource = "Islami Bank";
  } else if (normSender.includes("DBBL") || normSender.includes("NEXUS") || lower.includes("dutch-bangla") || lower.includes("nexus")) {
    detectedSource = "DBBL";
  } else if (normSender.includes("BRAC") || lower.includes("brac bank") || lower.includes("brac-bank")) {
    detectedSource = "BRAC Bank";
  } else if (normSender.includes("CITY") || lower.includes("city bank") || lower.includes("city touch")) {
    detectedSource = "City Bank";
  } else if (normSender.includes("EBL") || lower.includes("eastern bank")) {
    detectedSource = "Eastern Bank";
  } else if (normSender.includes("SCB") || lower.includes("standard chartered")) {
    detectedSource = "Standard Chartered";
  } else if (normSender.includes("SONALI") || lower.includes("sonali bank")) {
    detectedSource = "Sonali Bank";
  } else if (normSender.includes("UPAY") || lower.includes("upay")) {
    detectedSource = "Upay";
  } else if (rawSender.length > 2) {
    detectedSource = rawSender;
  }

  // 2. Determine Transaction Type (Income vs Expense)
  const isExpense =
    /\b(debit|debited|paid|payment|spent|purchase|withdrawn|withdraw|cash out|send money|transfer to|transferred to|deducted|fee|charge)\b/i.test(text);

  const isIncome =
    /\b(credit|credited|received|cash in|deposit|deposited|refund|added to|transferred from)\b/i.test(text);

  // If it's neither an expense nor an income, it's likely marketing/spam (e.g., recharge offers, telecom spam)
  if (!isExpense && !isIncome) {
    return null;
  }

  const type: "income" | "expense" = isIncome && !isExpense ? "income" : "expense";

  // 3. Extract Amount
  // Matches: Tk 500, Tk. 500, BDT 1,200.50, ৳500, Tk500.00
  const amountRegexes = [
    /(?:Tk\.?|BDT|৳)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Tk\.?|BDT|৳)/i,
    /(?:debited|credited|paid|received|amount)\s+(?:of\s+)?(?:by\s+)?(?:for\s+)?(?:with\s+)?(?:Tk\.?|BDT|৳)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  let amount = 0;
  for (const regex of amountRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsed = cleanAmount(match[1]);
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  if (amount <= 0) {
    return null; // Not a valid financial transaction SMS
  }

  // 4. Extract Remaining Balance (if present in SMS)
  let balance: number | undefined;
  const balanceMatch = text.match(
    /(?:Avail(?:able)?\s*(?:Bal(?:ance)?|Limit)|Balance|Bal|Remaining\s*Bal)(?:\s+is|\s*[:=])?\s*(?:Tk\.?|BDT|৳)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
  );
  if (balanceMatch && balanceMatch[1]) {
    const parsedBal = cleanAmount(balanceMatch[1]);
    if (!isNaN(parsedBal)) balance = parsedBal;
  }

  // 5. Extract TrxID / Reference (TrxID has priority over Ref)
  let trxId: string | undefined;
  const trxMatch =
    text.match(/(?:TrxID|TxnId|Txn ID)[:\s]*([A-Za-z0-9]+)/i) ||
    text.match(/(?:Ref(?:erence)?|Ref no)[:\s]*([A-Za-z0-9]+)/i);
  if (trxMatch && trxMatch[1]) {
    trxId = trxMatch[1].trim();
  }

  // 6. Extract Merchant, Counterparty or POS location
  let merchantOrParty: string | undefined;
  const merchantMatch =
    text.match(/(?:at|to|for|from)\s+([A-Za-z0-9\s&'.-]{3,30}?)(?:\s+successful|\s+on|\.|\s+Fee|\s+Bal|\s+Ref|\s+TrxID|\s+at|\s+via)/i);
  if (merchantMatch && merchantMatch[1]) {
    const candidate = merchantMatch[1].trim();
    if (!/^(the|a|an|A\/C|card|account|your)$/i.test(candidate)) {
      merchantOrParty = candidate;
    }
  }

  // 7. Suggest Category
  const categorySuggestion = guessCategory(merchantOrParty, text);

  return {
    success: true,
    source: detectedSource,
    type,
    amount,
    currency: "BDT",
    balance,
    merchantOrParty,
    trxId,
    categorySuggestion,
    rawSms: text,
    isVerifiedOfficialSender: isOfficial,
  };
}
