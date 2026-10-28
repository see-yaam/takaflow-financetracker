package com.takaflow.financetracker;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "SmsReader")
public class SmsReaderPlugin extends Plugin {
    private static final String PREF_NAME = "takaflow_pending_sms";
    private static final String KEY_PENDING_TX = "pending_transactions";

    @PluginMethod
    public void getPendingSms(PluginCall call) {
        try {
            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            String json = prefs.getString(KEY_PENDING_TX, "[]");

            JSONArray raw = new JSONArray(json);
            JSArray result = new JSArray();

            for (int i = 0; i < raw.length(); i++) {
                JSONObject obj = raw.getJSONObject(i);
                JSObject item = new JSObject();
                item.put("sender", obj.optString("sender"));
                item.put("body", obj.optString("body"));
                item.put("timestamp", obj.optLong("timestamp"));
                result.put(item);
            }

            // Clear after retrieving so they are not reprocessed
            prefs.edit().putString(KEY_PENDING_TX, "[]").apply();

            JSObject ret = new JSObject();
            ret.put("messages", result);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read SMS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isNotificationListenerEnabled(PluginCall call) {
        try {
            Context context = getContext();
            String flat = android.provider.Settings.Secure.getString(
                context.getContentResolver(),
                "enabled_notification_listeners"
            );
            boolean enabled = flat != null && flat.contains(context.getPackageName());
            JSObject ret = new JSObject();
            ret.put("enabled", enabled);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to check notification permission: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openNotificationListenerSettings(PluginCall call) {
        try {
            Context context = getContext();
            android.content.Intent intent = new android.content.Intent(
                "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"
            );
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open notification settings: " + e.getMessage());
        }
    }
}
