package com.ahmed.neocalendar.nativeapp

import android.content.Context
import com.ahmed.neocalendar.NeoCalendarWidget
import com.ahmed.neocalendar.WidgetData
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.widget.buildWidgetPayload
import com.ahmed.neocalendar.core.widget.widgetThemeOf
import java.time.Instant

/** Catppuccin Mocha (inventaire §6) : surface, encre, accent ; le noyau en tire les quatre couleurs du widget. */
private const val SURFACE = "#1e1e2e"
private const val INK = "#c6d0f5"
private const val ACCENT = "#658ff2"

internal fun widgetJson(data: WorkspaceData, events: List<DisplayEvent>, now: Instant): String =
    buildWidgetPayload(events, now, data.timeFormat24h, widgetThemeOf(SURFACE, INK, ACCENT)).toJson().toString()

/** Écrit la charge du widget puis redessine ceux qui sont posés ; à appeler sur le fil principal pour le redessin. */
internal fun writeWidget(context: Context, data: WorkspaceData, events: List<DisplayEvent>, now: Instant) {
    WidgetData.write(context, widgetJson(data, events, now))
}

internal fun refreshWidgets(context: Context) = NeoCalendarWidget.refreshAll(context)
