package com.ahmed.neocalendar;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.SpannableString;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Feeds the widget's list. One row per event, the date shown once per day.
 *
 * The list it is given outlives the app that wrote it — by hours, sometimes by
 * days. Events end and midnight passes in the meantime, so what is over is
 * dropped here, at the moment of drawing, and the days are re-grouped on what
 * is left. Only the wording came from the app; the passage of time is the
 * widget's own business.
 */
public class WidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static final class Row {
        String id = "";
        String weekday = "";
        String day = "";
        String title = "";
        String time = "";
        String color = "";
        boolean allDay;
        boolean opensDay;
        boolean today;
    }

    /** Drops what has ended and marks the first event of each remaining day. */
    static List<Row> visibleRows(JSONArray rows, long now) {
        List<Row> out = new ArrayList<>();
        if (rows == null) return out;

        Calendar todayCal = Calendar.getInstance();
        todayCal.setTimeInMillis(now);
        String todayKey = todayCal.get(Calendar.YEAR)
                + "-" + todayCal.get(Calendar.MONTH)
                + "-" + todayCal.get(Calendar.DAY_OF_MONTH);

        String previousDay = null;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject raw = rows.optJSONObject(i);
            if (raw == null) continue;
            if (raw.optLong("endMs", 0L) < now) continue;

            Row row = new Row();
            row.id = raw.optString("id", "");
            row.weekday = raw.optString("weekday", "");
            row.day = raw.optString("day", "");
            row.title = raw.optString("title", "");
            row.time = raw.optString("time", "");
            row.color = raw.optString("color", "");
            row.allDay = raw.optBoolean("allDay", false);

            String key = raw.optString("dayKey", "");
            row.opensDay = !key.equals(previousDay);
            row.today = key.equals(todayKey);
            previousDay = key;

            out.add(row);
        }
        return out;
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private List<Row> rows = new ArrayList<>();
        private int text = 0xFFE6E9F5;
        private int muted = 0xFF9AA0B4;
        /* Today's number is Notion's red rather than the app's accent: the
           accent is whatever theme is loaded, and this one marker has to stay
           the same colour whatever the calendar looks like. */
        private static final int TODAY = 0xFFDF6057;

        Factory(Context context) {
            this.context = context;
        }

        @Override public void onCreate() { reload(); }
        @Override public void onDataSetChanged() { reload(); }
        @Override public void onDestroy() { rows = new ArrayList<>(); }
        @Override public int getCount() { return rows.size(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return true; }

        private void reload() {
            JSONObject data = NeoCalendarWidget.payload(context);
            rows = visibleRows(data.optJSONArray("rows"), System.currentTimeMillis());
            JSONObject theme = data.optJSONObject("theme");
            text = NeoCalendarWidget.colorOf(theme, "text", text);
            muted = NeoCalendarWidget.colorOf(theme, "muted", muted);
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews views =
                    new RemoteViews(context.getPackageName(), R.layout.widget_row);
            if (position < 0 || position >= rows.size()) return views;
            Row row = rows.get(position);

            views.setTextViewText(R.id.row_weekday, row.opensDay ? row.weekday : "");
            views.setTextViewText(R.id.row_day, row.opensDay ? row.day : "");
            views.setTextColor(R.id.row_weekday, text);
            views.setTextColor(R.id.row_day, row.today ? TODAY : text);

            /*
             * An all-day event spans no hours, so it gets a dot instead of a
             * bar and its name in bold, with no second line under it. Reading
             * "All day" back was saying in three words what the dot says in
             * none, and it cost a row.
             */
            CharSequence title = row.title;
            if (row.allDay) {
                SpannableString bold = new SpannableString(row.title);
                bold.setSpan(
                        new StyleSpan(Typeface.BOLD), 0, bold.length(), 0);
                title = bold;
            }
            views.setTextViewText(R.id.row_title, title);
            views.setTextColor(R.id.row_title, text);

            views.setViewVisibility(
                    R.id.row_time, row.allDay ? View.GONE : View.VISIBLE);
            views.setTextViewText(R.id.row_time, row.time);
            views.setTextColor(R.id.row_time, muted);

            views.setViewVisibility(
                    R.id.row_bar, row.allDay ? View.GONE : View.VISIBLE);
            views.setViewVisibility(
                    R.id.row_dot, row.allDay ? View.VISIBLE : View.GONE);

            int colour = text;
            try {
                colour = Color.parseColor(row.color);
            } catch (IllegalArgumentException ignored) {
                // An event with no readable colour keeps the text colour.
            }
            views.setInt(R.id.row_bar, "setColorFilter", colour);
            views.setInt(R.id.row_dot, "setColorFilter", colour);

            if (!row.id.isEmpty()) {
                Intent fill = new Intent();
                fill.putExtra(MainActivity.EXTRA_EVENT_ID, row.id);
                views.setOnClickFillInIntent(R.id.row_root, fill);
            }
            return views;
        }
    }
}
