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

    // Known Bangladeshi MFS & Banking Application Packages
    private static final Set<String> TARGET_PACKAGES = new HashSet<>();
    static {
        TARGET_PACKAGES.add("com.bKash.customerapp");
        TARGET_PACKAGES.add("com.konasl.nagad");
        TARGET_PACKAGES.add("bd.com.upay.customer");
        TARGET_PACKAGES.add("com.ibbl.cellfin");
        TARGET_PACKAGES.add("com.thecitybank.citytouch");
        TARGET_PACKAGES.add("com.bracbank.astha");
        TARGET_PACKAGES.add("com.dbbl.nexus.pay");
        // Major SMS app packages on Android
        TARGET_PACKAGES.add("com.google.android.apps.messaging");
        TARGET_PACKAGES.add("com.samsung.android.messaging");
        TARGET_PACKAGES.add("com.android.mms");
        TARGET_PACKAGES.add("com.miui.mms");
        TARGET_PACKAGES.add("com.oppo.mms");
        TARGET_PACKAGES.add("com.coloros.mms");
        TARGET_PACKAGES.add("com.vivo.mms");
    }

    // Pattern to check if text contains financial transaction indicators
    private static final Pattern FINANCIAL_INDICATOR_PATTERN = Pattern.compile(
        "(?:Tk\\.?|BDT|৳|debited|credited|paid|payment|received|cash out|cash in|send money|transfer|recharge|balance)",
        Pattern.CASE_INSENSITIVE
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

        String title = titleChars != null ? titleChars.toString().trim() : "";
        String text = (bigTextChars != null && bigTextChars.length() > 0)
                ? bigTextChars.toString().trim()
                : (textChars != null ? textChars.toString().trim() : "");

        if (text.isEmpty() && title.isEmpty()) return;

        String combined = (title + " " + text).trim();

        // 1. Is this from a targeted package OR does it mention a Bangladeshi bank/MFS?
        boolean isTargetApp = TARGET_PACKAGES.contains(packageName);
        boolean mentionsFinance = FINANCIAL_INDICATOR_PATTERN.matcher(combined).find();

        if (!isTargetApp && !mentionsFinance) {
            return;
        }

        // Must contain financial transaction keywords
        if (!mentionsFinance) {
            return;
        }

        // Determine friendly sender name
        String sender = resolveSender(packageName, title);

        // Deduplication: create a content hash to avoid recording the same notification twice
        String dedupeKey = sender + "|" + text;
        if (isAlreadySeen(dedupeKey)) {
            return;
        }

        Log.i(TAG, "Captured Financial Notification from [" + sender + "]: " + text);
        storeNotificationTransaction(sender, text, sbn.getPostTime());
    }

    private String resolveSender(String packageName, String title) {
        if ("com.bKash.customerapp".equals(packageName)) return "bKash";
        if ("com.konasl.nagad".equals(packageName)) return "Nagad";
        if ("bd.com.upay.customer".equals(packageName)) return "Upay";
        if ("com.ibbl.cellfin".equals(packageName)) return "Cellfin";
        if ("com.thecitybank.citytouch".equals(packageName)) return "City Bank";
        if ("com.bracbank.astha".equals(packageName)) return "BRAC Bank";
        if ("com.dbbl.nexus.pay".equals(packageName)) return "DBBL";

        if (title != null && !title.isEmpty()) {
            return title;
        }
        return "Bank";
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
