package com.ahmed.neocalendar;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * What the home-screen widget knows.
 *
 * The widget cannot read the calendar itself: the event files live behind a
 * document tree whose permission belongs to the activity, and parsing Markdown
 * in a RemoteViewsFactory would mean a second implementation of every date
 * rule the app already has. So the app hands it a finished list — already
 * grouped by day, already formatted in the chosen language and time format,
 * already coloured — and the widget only lays it out.
 */
final class WidgetData {
    private static final String PREF_FILE = "neo-calendar-widget";
    private static final String KEY_PAYLOAD = "payload";

    private WidgetData() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE);
    }

    static void write(Context context, String payload) {
        prefs(context).edit().putString(KEY_PAYLOAD, payload).apply();
    }

    static String read(Context context) {
        return prefs(context).getString(KEY_PAYLOAD, "");
    }
}
