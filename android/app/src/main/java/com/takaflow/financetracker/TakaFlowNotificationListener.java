package com.takaflow.financetracker;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Background Notification Listener for Bangladeshi Financial Apps & Banks.
 * Intercepts push notifications from:
 * - bKash (com.bKash.customerapp)
 * - Nagad (com.konasl.nagad)
 * - Upay (bd.com.upay.customer)
 * - Cellfin / IBBL (com.ibbl.cellfin)
 * - SMS Notifications (Google Messages, Samsung Messages, default MMS)
 * - Bank apps (Citytouch, Astha, NexusPay)
 */
public class TakaFlowNotificationListener extends NotificationListenerService {
    private static final String TAG = "TakaFlowNotification";
    private static final String PREF_NAME = "takaflow_pending_sms";
    private static final String KEY_PENDING_TX = "pending_transactions";
    private static final String KEY_SEEN_HASHES = "seen_notification_hashes";

    // Known Bangladeshi MFS & Banking Application Packages (direct source)
    private static final Set<String> MFS_PACKAGES = new HashSet<>();
    private static final Set<String> TARGET_PACKAGES = new HashSet<>();
    static {
        MFS_PACKAGES.add("com.bKash.customerapp");
        MFS_PACKAGES.add("com.konasl.nagad");
        MFS_PACKAGES.add("bd.com.upay.customer");
        MFS_PACKAGES.add("com.ibbl.cellfin");
        MFS_PACKAGES.add("com.thecitybank.citytouch");
        MFS_PACKAGES.add("com.bracbank.astha");
        MFS_PACKAGES.add("com.dbbl.nexus.pay");
        MFS_PACKAGES.add("com.dutchbanglabank.rocket");

        TARGET_PACKAGES.addAll(MFS_PACKAGES);

        // Major SMS app packages on Android
        TARGET_PACKAGES.add("com.google.android.apps.messaging");
        TARGET_PACKAGES.add("com.samsung.android.messaging");
        TARGET_PACKAGES.add("com.android.mms");
        TARGET_PACKAGES.add("com.miui.mms");
        TARGET_PACKAGES.add("com.oppo.mms");
        TARGET_PACKAGES.add("com.coloros.mms");
        TARGET_PACKAGES.add("com.vivo.mms");
        TARGET_PACKAGES.add("com.transsion.mms");
    }

    // Pattern to check if text contains financial transaction indicators (English & Bangla)
    private static final Pattern FINANCIAL_INDICATOR_PATTERN = Pattern.compile(
        "(?:Tk\\.?|BDT|৳|debited|credited|paid|payment|received|cash out|cash in|send money|transfer|transferred|recharge|balance|spent|successful|trxid|টাকা|পেমেন্ট|পাঠানো|পেয়েছেন|ক্যাশ|উত্তোলন|জমা|ব্যালেন্স|রিচার্জ|খরচ|সফল|সফলভাবে|গৃহীত)",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        Notification notification = sbn.getNotification();
        if (notification == null || notification.extras == null) return;

        Bundle extras = notification.extras;
        CharSequence titleChars = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textChars = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextChars = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence subTextChars = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        CharSequence titleBigChars = extras.getCharSequence("android.title.big");

        StringBuilder fullTextBuilder = new StringBuilder();
        if (bigTextChars != null && bigTextChars.length() > 0) {
            fullTextBuilder.append(bigTextChars).append(" ");
        } else if (textChars != null && textChars.length() > 0) {
            fullTextBuilder.append(textChars).append(" ");
        }

        // Support InboxStyle multi-line notifications (SMS batches)
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) {
                if (line != null && line.length() > 0) {
                    fullTextBuilder.append(line).append(" ");
                }
            }
        }

        if (subTextChars != null && subTextChars.length() > 0) {
            fullTextBuilder.append(subTextChars).append(" ");
        }

        String title = titleChars != null ? titleChars.toString().trim() : (titleBigChars != null ? titleBigChars.toString().trim() : "");
        String text = fullTextBuilder.toString().trim();

        if (text.isEmpty() && title.isEmpty()) return;

        String combined = (title + " " + text).trim();

        // 1. Is this from a targeted package OR does it mention a Bangladeshi bank/MFS?
        boolean isMfsApp = MFS_PACKAGES.contains(packageName);
        boolean isTargetApp = TARGET_PACKAGES.contains(packageName);
        boolean mentionsFinance = FINANCIAL_INDICATOR_PATTERN.matcher(combined).find();

        if (!isTargetApp && !mentionsFinance) {
            return;
        }

        // For non-MFS apps (like generic SMS app), it MUST contain financial transaction keywords or amount symbols
        if (!isMfsApp && !mentionsFinance) {
            return;
        }

        // Determine friendly sender name
        String sender = resolveSender(packageName, title, combined);

        // Deduplication: create a content hash to avoid recording the same notification twice
        String dedupeKey = sender + "|" + text;
        if (isAlreadySeen(dedupeKey)) {
            return;
        }

        Log.i(TAG, "Captured Financial Notification from [" + sender + "]: " + text);
        storeNotificationTransaction(sender, text.isEmpty() ? title : text, sbn.getPostTime());
    }

    private String resolveSender(String packageName, String title, String combinedText) {
        if ("com.bKash.customerapp".equals(packageName)) return "bKash";
        if ("com.konasl.nagad".equals(packageName)) return "Nagad";
        if ("bd.com.upay.customer".equals(packageName)) return "Upay";
        if ("com.ibbl.cellfin".equals(packageName)) return "Cellfin";
        if ("com.thecitybank.citytouch".equals(packageName)) return "City Bank";
        if ("com.bracbank.astha".equals(packageName)) return "BRAC Bank";
        if ("com.dbbl.nexus.pay".equals(packageName)) return "DBBL";
        if ("com.dutchbanglabank.rocket".equals(packageName)) return "Rocket";

        String upper = combinedText.toUpperCase();
        if (upper.contains("BKASH")) return "bKash";
        if (upper.contains("NAGAD")) return "Nagad";
        if (upper.contains("ROCKET") || upper.contains("16216")) return "Rocket";
        if (upper.contains("CELLFIN") || upper.contains("IBBL")) return "Cellfin";
        if (upper.contains("BRAC")) return "BRAC Bank";
        if (upper.contains("CITY")) return "City Bank";
        if (upper.contains("EBL")) return "Eastern Bank";
        if (upper.contains("DBBL") || upper.contains("NEXUS")) return "DBBL";

        if (title != null && !title.trim().isEmpty() && !title.equalsIgnoreCase("Messages") && !title.equalsIgnoreCase("Notification")) {
            return title.trim();
        }
        return "bKash";
    }

    private boolean isAlreadySeen(String key) {
        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        Set<String> seen = prefs.getStringSet(KEY_SEEN_HASHES, new HashSet<String>());
        if (seen.contains(key)) {
            return true;
        }
        // Save to seen set (limit size to 100 entries)
        Set<String> newSeen = new HashSet<>(seen);
        if (newSeen.size() > 100) {
            newSeen.clear();
        }
        newSeen.add(key);
        prefs.edit().putStringSet(KEY_SEEN_HASHES, newSeen).apply();
        return false;
    }

    private void storeNotificationTransaction(String sender, String text, long timestamp) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString(KEY_PENDING_TX, "[]");
            JSONArray array = new JSONArray(existingJson);

            JSONObject tx = new JSONObject();
            tx.put("sender", sender);
            tx.put("body", text);
            tx.put("timestamp", timestamp > 0 ? timestamp : System.currentTimeMillis());

            array.put(tx);

            prefs.edit().putString(KEY_PENDING_TX, array.toString()).apply();
            Log.i(TAG, "Successfully stored financial notification for TakaFlow.");
        } catch (Exception e) {
            Log.e(TAG, "Error storing notification transaction", e);
        }
    }
}
