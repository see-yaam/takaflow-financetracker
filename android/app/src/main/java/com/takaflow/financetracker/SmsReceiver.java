package com.takaflow.financetracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

/**
 * Universal SMS BroadcastReceiver for Bangladeshi Banks and MFS Providers,
 * with strict anti-fraud and personal-number blocking (see SenderShield).
 *
 * The manifest requires android.permission.BROADCAST_SMS for this receiver, so
 * only the system telephony stack can deliver SMS_RECEIVED to it.
 */
public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "TakaFlowSmsReceiver";

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
        long timestamp = 0;

        for (Object pdu : pdus) {
            SmsMessage sms;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                sms = SmsMessage.createFromPdu((byte[]) pdu, format);
            } else {
                sms = SmsMessage.createFromPdu((byte[]) pdu);
            }

            if (sms != null) {
                if (sender == null || sender.isEmpty()) {
                    sender = sms.getDisplayOriginatingAddress();
                }
                if (timestamp == 0) {
                    timestamp = sms.getTimestampMillis();
                }
                fullBody.append(sms.getMessageBody());
            }
        }

        if (sender == null || sender.trim().isEmpty()) {
            return;
        }

        // 🛡️ Shield 1: never accept a personal phone number (SIM-based fake MFS SMS)
        if (SenderShield.isPersonalNumber(sender)) {
            Log.w(TAG, "[ANTI-SCAM SHIELD] Rejected financial-looking SMS from a personal number");
            return;
        }

        // 🛡️ Shield 2: must be an official bank/MFS mask or short code
        if (!SenderShield.isOfficialSender(sender)) {
            Log.w(TAG, "[ANTI-SCAM SHIELD] Rejected SMS from an unregistered sender");
            return;
        }

        // 🛡️ Shield 3: must look like a financial transaction (English & Bangla)
        String messageText = fullBody.toString();
        if (!SenderShield.hasFinancialKeyword(messageText)) {
            return;
        }

        if (PendingSmsStore.enqueue(context, sender, messageText, timestamp, "sms")) {
            Log.i(TAG, "Captured verified official financial SMS");
        }
    }
}
