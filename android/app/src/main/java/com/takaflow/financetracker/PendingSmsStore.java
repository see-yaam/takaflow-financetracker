package com.takaflow.financetracker;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Durable queue of captured financial SMS/notifications waiting for the web
 * layer to record them.
 *
 * Two-phase handoff (P0-03): JS reads entries with list(), records them in its
 * own durable outbox, and only then calls ack(ids). Nothing is removed on read,
 * so an app kill, a not-yet-loaded wallet list, or a failed save can never lose
 * a captured message.
 *
 * All access goes through one lock and uses commit() (synchronous) because the
 * SMS receiver, the notification listener and the Capacitor plugin all write
 * the same SharedPreferences entry from different threads.
 */
public final class PendingSmsStore {
    private static final String TAG = "TakaFlowSmsStore";
    static final String PREF_NAME = "takaflow_pending_sms";
    private static final String KEY_PENDING_TX = "pending_transactions";
    private static final String KEY_SEEN_HASHES = "seen_notification_hashes";
    private static final String KEY_OVERFLOW = "overflow_count";
    static final int MAX_ENTRIES = 2000;

    private static final Object LOCK = new Object();

    private PendingSmsStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    private static JSONArray readArray(SharedPreferences p) {
        try {
            return new JSONArray(p.getString(KEY_PENDING_TX, "[]"));
        } catch (Exception e) {
            Log.e(TAG, "Pending queue unreadable; starting a new one", e);
            return new JSONArray();
        }
    }

    /** Deterministic id for entries written by older app versions (no id field). */
    static String legacyId(String sender, long timestamp, String body) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest((sender + "|" + timestamp + "|" + body).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder("legacy-");
            for (int i = 0; i < 12; i++) sb.append(String.format("%02x", digest[i]));
            return sb.toString();
        } catch (Exception e) {
            return "legacy-" + Integer.toHexString((sender + "|" + timestamp + "|" + body).hashCode());
        }
    }

    /** Appends a captured message. Returns false only if it could not be persisted. */
    public static boolean enqueue(Context ctx, String sender, String body, long timestamp, String source) {
        synchronized (LOCK) {
            try {
                SharedPreferences p = prefs(ctx);
                JSONArray array = readArray(p);
                int overflow = p.getInt(KEY_OVERFLOW, 0);
                // Bounded size: keep the newest MAX_ENTRIES (and count what was dropped so JS can report it).
                while (array.length() >= MAX_ENTRIES) {
                    array.remove(0);
                    overflow++;
                }
                JSONObject entry = new JSONObject();
                entry.put("id", UUID.randomUUID().toString());
                entry.put("sender", sender);
                entry.put("body", body);
                entry.put("timestamp", timestamp > 0 ? timestamp : System.currentTimeMillis());
                entry.put("source", source);
                array.put(entry);
                boolean ok = p.edit().putString(KEY_PENDING_TX, array.toString()).putInt(KEY_OVERFLOW, overflow).commit();
                if (!ok) Log.e(TAG, "Failed to persist captured message");
                return ok;
            } catch (Exception e) {
                Log.e(TAG, "Error storing captured message", e);
                return false;
            }
        }
    }

    /** Snapshot of all unacknowledged entries (never clears anything). */
    public static JSONArray list(Context ctx) {
        synchronized (LOCK) {
            JSONArray raw = readArray(prefs(ctx));
            JSONArray out = new JSONArray();
            for (int i = 0; i < raw.length(); i++) {
                JSONObject obj = raw.optJSONObject(i);
                if (obj == null) continue;
                try {
                    JSONObject item = new JSONObject();
                    String sender = obj.optString("sender");
                    String body = obj.optString("body");
                    long ts = obj.optLong("timestamp");
                    String id = obj.optString("id", "");
                    item.put("id", id.isEmpty() ? legacyId(sender, ts, body) : id);
                    item.put("sender", sender);
                    item.put("body", body);
                    item.put("timestamp", ts);
                    item.put("source", obj.optString("source", "sms"));
                    out.put(item);
                } catch (Exception e) {
                    Log.e(TAG, "Skipping unreadable pending entry", e);
                }
            }
            return out;
        }
    }

    public static int overflowCount(Context ctx) {
        synchronized (LOCK) {
            return prefs(ctx).getInt(KEY_OVERFLOW, 0);
        }
    }

    /** Removes exactly the acknowledged entries. Returns how many were removed. */
    public static int ack(Context ctx, Set<String> ids) {
        if (ids == null || ids.isEmpty()) return 0;
        synchronized (LOCK) {
            SharedPreferences p = prefs(ctx);
            JSONArray raw = readArray(p);
            JSONArray keep = new JSONArray();
            int removed = 0;
            for (int i = 0; i < raw.length(); i++) {
                JSONObject obj = raw.optJSONObject(i);
                if (obj == null) continue;
                String id = obj.optString("id", "");
                if (id.isEmpty()) id = legacyId(obj.optString("sender"), obj.optLong("timestamp"), obj.optString("body"));
                if (ids.contains(id)) {
                    removed++;
                } else {
                    keep.put(obj);
                }
            }
            if (removed > 0) {
                p.edit().putString(KEY_PENDING_TX, keep.toString()).commit();
            }
            return removed;
        }
    }

    /**
     * Notification reposts (same sender + text) are recorded once. Returns true
     * if this key was already seen. Bounded to the last ~200 keys.
     */
    public static boolean markNotificationSeen(Context ctx, String key) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(ctx);
            Set<String> seen = new HashSet<>(p.getStringSet(KEY_SEEN_HASHES, new HashSet<String>()));
            if (seen.contains(key)) return true;
            if (seen.size() >= 200) seen.clear();
            seen.add(key);
            p.edit().putStringSet(KEY_SEEN_HASHES, seen).commit();
            return false;
        }
    }
}
