package com.takaflow.financetracker;

import java.util.regex.Pattern;

/**
 * Anti-scam checks shared by every native capture path (SMS receiver and the
 * notification listener). Pure Java with no Android dependencies so it can be
 * unit-tested on the JVM (see SenderShieldTest).
 *
 * Scammers send fake "bKash/Nagad" SMS from ordinary SIM numbers
 * (+88017..., 018..., 019...). Genuine MFS and bank alerts come from BTRC
 * alphanumeric masks or short codes, so only those are accepted.
 */
public final class SenderShield {
    private SenderShield() {}

    // Personal mobile numbers (+8801..., 8801..., 01...)
    private static final Pattern PERSONAL_PHONE_PATTERN = Pattern.compile("^(\\+?88)?01[3-9]\\d{8}$");

    // Any long numeric sender (international/personal numbers)
    private static final Pattern LONG_NUMBER_PATTERN = Pattern.compile("^\\+?\\d{10,}$");

    // Official BTRC alphanumeric sender masks and banking short codes
    private static final Pattern OFFICIAL_SENDER_PATTERN = Pattern.compile(
        "^(bKash|NAGAD|Rocket|16216|16247|16167|16234|16221|16230|16233|IBBL|CELLFIN|DBBL|BRACBANK|CITYBANK|EBL|SCB|SONALI|SONALIBANK|UPAY|PUBALI|PRIMEBANK|TRUSTBANK|MIDLAND|DHAKABANK|BANKASIA|COMMUNITY|EXIM|SIBL|SJIBL|MBL|ONEBANK|PREMIER|SOUTHEAST|NCCB|MUTUALTRUST|MTBL|JAMUNA|STANDARDBANK|IFIC|UCB|SHAHJALAL|ALARAFAH|AIBL|JANATA|AGRANI|RUPALI|HSBC)",
        Pattern.CASE_INSENSITIVE
    );

    // Financial transaction indicators (English & Bangla)
    private static final Pattern FINANCIAL_KEYWORD_PATTERN = Pattern.compile(
        "(?:Tk\\.?|BDT|৳|debited|credited|paid|payment|received|cash out|cash in|send money|transfer|transferred|recharge|balance|spent|successful|trxid|টাকা|পেমেন্ট|পাঠানো|পেয়েছেন|ক্যাশ|উত্তোলন|জমা|ব্যালেন্স|রিচার্জ|খরচ|সফল|সফলভাবে|গৃহীত)",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    /** Strips spaces, hyphens and parentheses: "BRAC-BANK" -> "BRACBANK", "+880 171-..." -> "+880171...". */
    public static String cleanSender(String sender) {
        if (sender == null) return "";
        return sender.trim().replaceAll("[\\s\\-()]", "");
    }

    public static boolean isPersonalNumber(String sender) {
        String clean = cleanSender(sender);
        if (clean.isEmpty()) return false;
        return PERSONAL_PHONE_PATTERN.matcher(clean).matches() || LONG_NUMBER_PATTERN.matcher(clean).matches();
    }

    /** True only for a registered bank/MFS mask or short code. Personal numbers are never official. */
    public static boolean isOfficialSender(String sender) {
        if (sender == null || sender.trim().isEmpty()) return false;
        if (isPersonalNumber(sender)) return false;
        return OFFICIAL_SENDER_PATTERN.matcher(cleanSender(sender)).find()
            || OFFICIAL_SENDER_PATTERN.matcher(sender.trim()).find();
    }

    public static boolean hasFinancialKeyword(String text) {
        return text != null && FINANCIAL_KEYWORD_PATTERN.matcher(text).find();
    }

    /** All three shields for an SMS (or an SMS app's notification, whose title is the SMS sender). */
    public static boolean acceptSms(String sender, String body) {
        return isOfficialSender(sender) && hasFinancialKeyword(body);
    }
}
