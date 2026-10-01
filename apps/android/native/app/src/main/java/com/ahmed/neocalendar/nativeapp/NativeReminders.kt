package com.ahmed.neocalendar.nativeapp

import android.content.Context
import com.ahmed.neocalendar.ReminderScheduler
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.recurrence.neoEventToDisplayEvents
import com.ahmed.neocalendar.core.reminders.buildReminders
import com.ahmed.neocalendar.core.reminders.remindersByCalendarId
import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.JsonArray

/** Les rappels et le widget regardent un mois devant eux. */
private const val WINDOW_DAYS = 31L

/**
 * Les occurrences du prochain mois, quelle que soit la fenêtre de la grille, sans les calendriers
 * masqués (`reminderEvents` de DesktopCalendar). Démarre la veille à minuit : un évènement commencé
 * hier et encore en cours doit y être.
 */
internal fun upcomingOccurrences(data: WorkspaceData, now: Instant, zone: ZoneId = ZoneId.systemDefault()): List<DisplayEvent> {
    val from = now.atZone(zone).toLocalDate().minusDays(1).atStartOfDay(zone).toInstant()
    val to = now.atZone(zone).toLocalDate().plusDays(WINDOW_DAYS).atStartOfDay(zone).toInstant()
    val calendars = data.calendars.associateBy { it.id }
    return data.events.flatMap { stored ->
        val calendar = calendars[stored.calendarId]
        if (calendar == null || calendar.id in data.hiddenCalendarIds) emptyList()
        else neoEventToDisplayEvents(stored.event, stored.id, calendar.id, calendar.name, calendar.color, calendar.editable, from, to)
    }
}

/** Les rappels du dossier lu, au format JSON que `ReminderScheduler.write` reçoit de la WebView. */
internal fun remindersJson(data: WorkspaceData, events: List<DisplayEvent>, now: Instant): String {
    val reminders = buildReminders(
        events = events,
        now = now,
        minutesBefore = data.reminderMinutes,
        minutesByCalendar = remindersByCalendarId(data.calendars.map { it.id to it.relativePath }, data.calendarReminderMinutes),
        timeFormat24h = data.timeFormat24h,
    )
    return JsonArray(reminders.map { it.toJson() }).toString()
}

/** Remet la liste des rappels au planificateur Java, qui réarme l'alarme sur le plus proche. */
internal fun writeReminders(context: Context, data: WorkspaceData, events: List<DisplayEvent>, now: Instant) {
    ReminderScheduler.write(context, remindersJson(data, events, now))
}
