package com.ahmed.neocalendar;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.HashSet;
import java.util.Set;

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
public final class WidgetData {
    private static final String PREF_FILE = "neo-calendar-widget";
    private static final String KEY_PAYLOAD = "payload";

    private WidgetData() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE);
    }

    public static void write(Context context, String payload) {
        prefs(context).edit().putString(KEY_PAYLOAD, payload).apply();
    }

    public static String read(Context context) {
        return prefs(context).getString(KEY_PAYLOAD, "");
    }

    private static final String CHOICE_FILE = "neo-calendar-widget-calendars";

    private static SharedPreferences choices(Context context) {
        return context.getSharedPreferences(CHOICE_FILE, Context.MODE_PRIVATE);
    }

    private static String choiceKey(int appWidgetId) {
        return "w" + appWidgetId;
    }

    /**
     * The calendars kept for one widget, or null when nothing was ever chosen
     * for it (a widget placed before the choice existed): it then shows all.
     */
    public static Set<String> chosenCalendars(Context context, int appWidgetId) {
        Set<String> stored = choices(context).getStringSet(choiceKey(appWidgetId), null);
        return stored == null ? null : new HashSet<>(stored);
    }

    public static void chooseCalendars(Context context, int appWidgetId, Set<String> ids) {
        choices(context).edit().putStringSet(choiceKey(appWidgetId), new HashSet<>(ids)).apply();
    }

    /** A removed widget takes its choice with it. */
    public static void forgetCalendars(Context context, int appWidgetId) {
        choices(context).edit().remove(choiceKey(appWidgetId)).apply();
    }
}
