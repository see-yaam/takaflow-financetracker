package com.takaflow.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Universal SMS BroadcastReceiver for Bangladeshi Banks and MFS Providers.
 * WITH STRICT ANTI-FRAUD AND PERSONAL NUMBER BLOCKING.
 *
 * Scammers often send fake SMS from regular SIM cards (+88017..., 018..., 019...).
 * This receiver strictly blocks any personal phone number and only processes
 * SMS from registered BTRC alphanumeric bank masks or official banking shortcodes.
 */
public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "TakaFlowSmsReceiver";
    private static final String PREF_NAME = "takaflow_pending_sms";
    private static final String KEY_PENDING_TX = "pending_transactions";

    // Pattern detecting personal mobile numbers (+8801..., 8801..., 01...)
    private static final Pattern PERSONAL_PHONE_PATTERN = Pattern.compile(
        "^(\\+?88)?01[3-9]\\d{8}$"
    );

    // Official BTRC Alphanumeric Sender Masks & Shortcodes
    private static final Pattern OFFICIAL_BANK_PATTERN = Pattern.compile(
        "^(bKash|NAGAD|Rocket|16216|16247|16167|16234|16221|16230|16233|IBBL|CELLFIN|DBBL|BRACBANK|CITYBANK|EBL|SCB|SONALI|SONALIBANK|UPAY|PUBALI|PRIMEBANK|TRUSTBANK|MIDLAND|DHAKABANK|BANKASIA|COMMUNITY|EXIM|SIBL|SJIBL|MBL|ONEBANK|PREMIER|SOUTHEAST|NCCB|MUTUALTRUST|MTBL|JAMUNA|STANDARDBANK|IFIC|UCB|SHAHJALAL|ALARAFAH|AIBL|JANATA|AGRANI|RUPALI|HSBC)",
        Pattern.CASE_INSENSITIVE
    );

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        String format = bundle.getString("format");
        if (pdus == null) return;

        StringBuilder fullBody = new StringBuilder();
        String sender = "";

        for (Object pdu : pdus) {
            SmsMessage sms;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                sms = SmsMessage.createFromPdu((byte[]) pdu, format);
            } else {
                sms = SmsMessage.createFromPdu((byte[]) pdu);
            }

            if (sms != null) {
                sender = sms.getDisplayOriginatingAddress();
                fullBody.append(sms.getMessageBody());
            }
        }

        if (sender == null || sender.trim().isEmpty()) {
            return;
        }

        String cleanSender = sender.trim().replaceAll("[\\s\\-()]", "");

        // 🛡️ SECURITY SHIELD 1: Drop any SMS originating from a personal mobile phone number
        if (PERSONAL_PHONE_PATTERN.matcher(cleanSender).matches() || cleanSender.matches("^\\+?\\d{10,}$")) {
            Log.w(TAG, "[ANTI-SCAM SHIELD] Rejected fake/unauthorized financial SMS from personal number: " + sender);
            return; // Never process scam messages from personal SIM numbers
        }

        // 🛡️ SECURITY SHIELD 2: Must match an official bank mask or official shortcode
        // cleanSender has all hyphens/spaces removed: e.g. BRAC-BANK -> BRACBANK
        boolean isOfficialBank = OFFICIAL_BANK_PATTERN.matcher(cleanSender).find() || OFFICIAL_BANK_PATTERN.matcher(sender.trim()).find();
        if (!isOfficialBank) {
            Log.w(TAG, "[ANTI-SCAM SHIELD] Rejected SMS from unregistered/unofficial sender: " + sender);
            return;
        }

        String messageText = fullBody.toString();

        // 🛡️ SECURITY SHIELD 3: Must contain financial keywords
        boolean hasFinancialKeywords = messageText.matches("(?i).*(Tk\\.?|BDT|৳|debited|credited|paid|received|cash out|send money|balance).*");

        if (hasFinancialKeywords) {
            Log.i(TAG, "[VERIFIED OFFICIAL SMS] Captured message from: " + sender);
            storeParsedTransaction(context, sender, messageText);
        }
    }

    private void storeParsedTransaction(Context context, String sender, String text) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString(KEY_PENDING_TX, "[]");
            JSONArray array = new JSONArray(existingJson);

            JSONObject tx = new JSONObject();
            tx.put("sender", sender);
            tx.put("body", text);
            tx.put("timestamp", System.currentTimeMillis());

            array.put(tx);

            prefs.edit().putString(KEY_PENDING_TX, array.toString()).apply();
            Log.i(TAG, "Successfully captured and verified official financial SMS for TakaFlow.");
        } catch (Exception e) {
            Log.e(TAG, "Error storing verified financial SMS", e);
        }
    }
}
