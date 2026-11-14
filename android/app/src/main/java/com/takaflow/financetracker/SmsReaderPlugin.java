package com.takaflow.financetracker;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;

// "sms" alias: Capacitor exposes checkPermissions()/requestPermissions({ permissions: ["sms"] }) to JS.
// RECEIVE_SMS is a dangerous permission: without a runtime grant SmsReceiver never gets broadcasts.
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(alias = "sms", strings = { android.Manifest.permission.RECEIVE_SMS, android.Manifest.permission.READ_SMS })
    }
)
public class SmsReaderPlugin extends Plugin {

    /**
     * Returns every captured message that JS has not acknowledged yet.
     * Nothing is removed here: JS calls ackPendingSms(ids) only after it has
     * durably recorded each message (two-phase handoff).
     */
    @PluginMethod
    public void getPendingSms(PluginCall call) {
        try {
            JSONArray entries = PendingSmsStore.list(getContext());
            JSArray messages = new JSArray();
            for (int i = 0; i < entries.length(); i++) {
                messages.put(JSObject.fromJSONObject(entries.getJSONObject(i)));
            }
            JSObject ret = new JSObject();
            ret.put("messages", messages);
            ret.put("overflowCount", PendingSmsStore.overflowCount(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read SMS: " + e.getMessage());
        }
    }

    /** Removes exactly the given message ids from the native queue. */
    @PluginMethod
    public void ackPendingSms(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids");
            Set<String> idSet = new HashSet<>();
            if (ids != null) {
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.optString(i, null);
                    if (id != null && !id.isEmpty()) idSet.add(id);
                }
            }
            int removed = PendingSmsStore.ack(getContext(), idSet);
            JSObject ret = new JSObject();
            ret.put("removed", removed);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to acknowledge SMS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isNotificationListenerEnabled(PluginCall call) {
        try {
            android.content.Context context = getContext();
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

    /** Opens this app's system settings page (the only way back after "Don't ask again"). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            android.content.Context context = getContext();
            android.content.Intent intent = new android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.fromParts("package", context.getPackageName(), null)
            );
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open app settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openNotificationListenerSettings(PluginCall call) {
        try {
            android.content.Context context = getContext();
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
