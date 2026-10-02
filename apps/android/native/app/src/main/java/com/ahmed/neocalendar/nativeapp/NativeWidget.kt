package com.ahmed.neocalendar.nativeapp

import android.content.Context
import com.ahmed.neocalendar.NeoCalendarWidget
import com.ahmed.neocalendar.WidgetData
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.widget.WidgetCalendar
import com.ahmed.neocalendar.core.widget.NATIVE_PAYLOAD_MAX_ROWS
import com.ahmed.neocalendar.core.widget.buildWidgetPayload
import com.ahmed.neocalendar.core.widget.widgetThemeOf
import java.time.Instant

/** Catppuccin Mocha (inventaire §6) : surface, encre, accent ; le noyau en tire les quatre couleurs du widget. */
private const val SURFACE = "#1e1e2e"
private const val INK = "#cdd6f4"
private const val ACCENT = "#89b4fa"

internal fun widgetJson(data: WorkspaceData, events: List<DisplayEvent>, now: Instant): String =
    buildWidgetPayload(
        events, now, data.timeFormat24h, widgetThemeOf(SURFACE, INK, ACCENT),
        // Les calendriers visibles : la liste à cocher de la configuration du widget.
        calendars = data.calendars
            .filter { it.id !in data.hiddenCalendarIds }
            .map { WidgetCalendar(it.id, it.name, it.color) },
        // Les 60 lignes se comptent par widget, après son filtre (WidgetService) : pas de coupe ici.
        maxRows = NATIVE_PAYLOAD_MAX_ROWS,
    ).toJson().toString()

/** Écrit la charge du widget puis redessine ceux qui sont posés ; à appeler sur le fil principal pour le redessin. */
internal fun writeWidget(context: Context, data: WorkspaceData, events: List<DisplayEvent>, now: Instant) {
    WidgetData.write(context, widgetJson(data, events, now))
}

internal fun refreshWidgets(context: Context) = NeoCalendarWidget.refreshAll(context)
