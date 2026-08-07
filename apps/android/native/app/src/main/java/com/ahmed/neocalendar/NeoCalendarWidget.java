package com.ahmed.neocalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * The home-screen widget: the next events, grouped by the day they fall on.
 *
 * Everything it shows comes from the payload the app last wrote (see
 * WidgetData). That means it still shows the right thing when the app is not
 * running, and that it never has to agree with the app about how a date is
 * written — there is only one implementation of that, in the app.
 */
public class NeoCalendarWidget extends AppWidgetProvider {
    static final String ACTION_NEW_EVENT = "com.ahmed.neocalendar.WIDGET_NEW_EVENT";

    /** Fallbacks for a widget placed before the app has ever run. */
    private static final int FALLBACK_SURFACE = 0xFF252539;
    private static final int FALLBACK_TEXT = 0xFFE6E9F5;

    static int colorOf(JSONObject theme, String key, int fallback) {
        if (theme == null) return fallback;
        String raw = theme.optString(key, "");
        if (raw.isEmpty()) return fallback;
        try {
            return Color.parseColor(raw);
        } catch (IllegalArgumentException ignored) {
            return fallback;
        }
    }

    static JSONObject payload(Context context) {
        String raw = WidgetData.read(context);
        if (raw == null || raw.isEmpty()) return new JSONObject();
        try {
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    /** Redraws every placed widget. Called by the app whenever events change. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, NeoCalendarWidget.class);
        int[] ids = manager.getAppWidgetIds(provider);
        if (ids.length == 0) return;
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        new NeoCalendarWidget().onUpdate(context, manager, ids);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject data = payload(context);
        JSONObject theme = data.optJSONObject("theme");
        int surface = colorOf(theme, "surface", FALLBACK_SURFACE);
        int text = colorOf(theme, "text", FALLBACK_TEXT);
        String emptyDate = "";
        org.json.JSONArray weekdays = data.optJSONArray("weekdays");
        if (weekdays != null && weekdays.length() == 7) {
            java.util.Calendar today = java.util.Calendar.getInstance();
            emptyDate = weekdays.optString(today.get(java.util.Calendar.DAY_OF_WEEK) - 1, "")
                    + " " + today.get(java.util.Calendar.DAY_OF_MONTH);
        }

        /*
         * The list is rebuilt on every update, not only when the app writes a
         * new one. Android calls onUpdate on its own schedule, and that is the
         * only chance the widget gets to notice that events have ended or that
         * the date has turned while nothing was running.
         */
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_root);

            views.setInt(R.id.widget_card, "setColorFilter", surface);

            Intent items = new Intent(context, WidgetService.class);
            items.setData(Uri.parse(items.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_list, items);
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);

            views.setTextViewText(R.id.widget_empty_date, emptyDate);
            views.setTextViewText(R.id.widget_empty_label, data.optString("emptyLabel", ""));
            views.setTextColor(R.id.widget_empty_date, text);

            // Tapping a row opens that event; the template carries the action and
            // each row fills in which event it is.
            Intent open = new Intent(context, MainActivity.class);
            open.setAction(Intent.ACTION_VIEW);
            views.setPendingIntentTemplate(
                    R.id.widget_list,
                    PendingIntent.getActivity(
                            context, 0, open,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));

            Intent create = new Intent(context, MainActivity.class);
            create.setAction(ACTION_NEW_EVENT);
            create.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            views.setOnClickPendingIntent(
                    R.id.widget_add,
                    PendingIntent.getActivity(
                            context, 1, create,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

            manager.updateAppWidget(id, views);
        }
    }
}
