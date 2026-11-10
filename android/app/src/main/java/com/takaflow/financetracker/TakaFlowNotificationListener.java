package com.takaflow.financetracker;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Background Notification Listener for Bangladeshi financial apps and SMS apps.
 *
 * Anti-scam rules (P0-04):
 *  - Only allowlisted packages are read: official MFS/bank apps and the
 *    system SMS apps. Messengers (WhatsApp, Telegram, Messenger, ...) are ignored.
 *  - MFS/bank app notifications: the sender is the app itself (trusted by package).
 *  - SMS app notifications: the sender is the SMS sender shown in the title and
 *    must pass the same shields as SmsReceiver (no personal numbers, official
 *    mask/short code only). The sender is never guessed from message content
 *    and never defaults to "bKash".
 */
public class TakaFlowNotificationListener extends NotificationListenerService {
    private static final String TAG = "TakaFlowNotification";

    // Official MFS & banking app packages -> sender name recorded for them
    private static final Map<String, String> MFS_APP_SENDERS = new HashMap<>();
    private static final Set<String> SMS_APP_PACKAGES = new HashSet<>();
    static {
        MFS_APP_SENDERS.put("com.bKash.customerapp", "bKash");
        MFS_APP_SENDERS.put("com.konasl.nagad", "Nagad");
        MFS_APP_SENDERS.put("bd.com.upay.customer", "Upay");
        MFS_APP_SENDERS.put("com.ibbl.cellfin", "Cellfin");
        MFS_APP_SENDERS.put("com.thecitybank.citytouch", "City Bank");
        MFS_APP_SENDERS.put("com.bracbank.astha", "BRAC Bank");
        MFS_APP_SENDERS.put("com.dbbl.nexus.pay", "DBBL");
        MFS_APP_SENDERS.put("com.dutchbanglabank.rocket", "Rocket");

        SMS_APP_PACKAGES.add("com.google.android.apps.messaging");
        SMS_APP_PACKAGES.add("com.samsung.android.messaging");
        SMS_APP_PACKAGES.add("com.android.mms");
        SMS_APP_PACKAGES.add("com.miui.mms");
        SMS_APP_PACKAGES.add("com.oppo.mms");
        SMS_APP_PACKAGES.add("com.coloros.mms");
        SMS_APP_PACKAGES.add("com.vivo.mms");
        SMS_APP_PACKAGES.add("com.transsion.mms");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        boolean isMfsApp = MFS_APP_SENDERS.containsKey(packageName);
        boolean isSmsApp = SMS_APP_PACKAGES.contains(packageName);
        if (!isMfsApp && !isSmsApp) {
            return; // never read other apps' notifications
        }

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
        if (text.isEmpty()) return;

        String sender;
        if (isMfsApp) {
            sender = MFS_APP_SENDERS.get(packageName);
            if (!SenderShield.hasFinancialKeyword(title + " " + text)) return;
        } else {
            // SMS app: the notification title is the SMS sender (mask, short code, number or contact name).
            sender = title;
            if (!SenderShield.acceptSms(sender, text)) {
                Log.w(TAG, "[ANTI-SCAM SHIELD] Ignored SMS notification from an unverified sender");
                return;
            }
        }

        // The same notification is often reposted/updated: record it once.
        if (PendingSmsStore.markNotificationSeen(this, sender + "|" + text)) {
            return;
        }

        long postTime = sbn.getPostTime();
        if (PendingSmsStore.enqueue(this, sender, text, postTime > 0 ? postTime : System.currentTimeMillis(), "notification")) {
            Log.i(TAG, "Captured financial notification from " + sender);
        }
    }
}
