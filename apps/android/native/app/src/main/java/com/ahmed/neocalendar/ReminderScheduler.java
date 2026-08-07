package com.ahmed.neocalendar;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reminds, one alarm at a time.
 *
 * The obvious implementation sets an alarm per event. It runs into Android's
 * cap on pending alarms as soon as a calendar gets busy, and every edit means
 * cancelling and re-registering hundreds of them. Instead the whole list is
 * kept here and a single alarm is set on the nearest one; firing it posts the
 * notification and arms the next. One alarm outstanding, whatever the calendar
 * holds.
 *
 * The list itself is written by the app, already worded in the chosen language
 * and time format — the phone is handed times and finished sentences.
 */
final class ReminderScheduler {
    private static final String TAG = "NeoCalendarReminder";
    private static final String PREF_FILE = "neo-calendar-reminders";
    private static final String KEY_PAYLOAD = "payload";
    private static final String CHANNEL_ID = "neo-calendar-reminders";

    /** A reminder later than this has missed its point, and is skipped. */
    private static final long STALE_AFTER_MS = 5 * 60_000L;

    private ReminderScheduler() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE);
    }

    static void write(Context context, String payload) {
        prefs(context).edit().putString(KEY_PAYLOAD, payload).apply();
        schedule(context);
    }

    private static JSONArray reminders(Context context) {
        String raw = prefs(context).getString(KEY_PAYLOAD, "");
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction(ReminderReceiver.ACTION_FIRE);
        return PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Arms the alarm on the nearest reminder still ahead of us. */
    static void schedule(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;

        JSONArray list = reminders(context);
        long now = System.currentTimeMillis();
        long next = Long.MAX_VALUE;
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item == null) continue;
            long at = item.optLong("atMs", 0L);
            if (at > now && at < next) next = at;
        }

        PendingIntent pending = alarmIntent(context);
        if (next == Long.MAX_VALUE) {
            alarms.cancel(pending);
            return;
        }

        try {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending);
        } catch (SecurityException e) {
            // Exact alarms can be refused; an inexact reminder beats none.
            Log.w(TAG, "Alarme exacte refusee, repli inexact", e);
            alarms.set(AlarmManager.RTC_WAKEUP, next, pending);
        }
    }

    /**
     * Posts everything that has come due, then arms the next one.
     *
     * Due rather than exactly now: the phone may have been asleep and a batch
     * of alarms can arrive together. Anything more than a few minutes late is
     * dropped instead — a reminder arriving after its event has started is one
     * nobody can act on.
     */
    static void fire(Context context) {
        JSONArray list = reminders(context);
        long now = System.currentTimeMillis();
        JSONArray remaining = new JSONArray();

        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item == null) continue;
            long at = item.optLong("atMs", 0L);

            if (at > now) {
                remaining.put(item);
                continue;
            }
            if (now - at <= STALE_AFTER_MS) {
                post(context, item, i);
            }
        }

        prefs(context).edit().putString(KEY_PAYLOAD, remaining.toString()).apply();
        schedule(context);
    }

    private static void post(Context context, JSONObject reminder, int index) {
        ensureChannel(context);

        String eventId = reminder.optString("id", "");
        Intent open = new Intent(context, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.putExtra(MainActivity.EXTRA_EVENT_ID, eventId);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(reminder.optString("title", ""))
                .setContentText(reminder.optString("body", ""))
                .setCategory(Notification.CATEGORY_EVENT)
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(
                        context, index + 100, open,
                        PendingIntent.FLAG_UPDATE_CURRENT
                                | PendingIntent.FLAG_IMMUTABLE))
                .build();

        NotificationManager manager =
                context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        try {
            manager.notify(
                    eventId.isEmpty() ? index : eventId.hashCode(), notification);
        } catch (SecurityException e) {
            // Notifications not granted: nothing to do but stay quiet.
            Log.w(TAG, "Notification refusee", e);
        }
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
                context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.reminder_channel),
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(
                context.getString(R.string.reminder_channel_description));
        manager.createNotificationChannel(channel);
    }
}
