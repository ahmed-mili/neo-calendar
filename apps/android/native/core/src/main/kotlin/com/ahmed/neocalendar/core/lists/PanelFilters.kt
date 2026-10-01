package com.ahmed.neocalendar.core.lists

import com.ahmed.neocalendar.core.format.formatDatedDay
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.tasks.normalizeForSearch
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.max
import kotlin.math.roundToLong

/*
 * Les filtres de la liste d'un calendrier : port de filterPanelEvents, summarizePanelEvents,
 * formatTotalMinutes, formatPanelPeriod et getCalendarColorName (CalendarEventsPanel.helpers.ts).
 */

enum class StatusFilter { ALL, TODO, COMPLETE }

enum class DateFilter { ALL, SCHEDULED, UNSCHEDULED, PERIOD }

/** Une période de jours, bornes comprises. */
data class PanelPeriod(val start: LocalDate, val end: LocalDate)

/** Tient la place de « aucun lien ICS » dans l'ensemble des sources cachées : isoler un lien cache aussi les notes personnelles. */
const val NO_ICS_FEED = "__panel-no-ics-feed__"

/** Un évènement recoupe la période : un sans-date ou une période inversée ne la recoupe jamais. */
private fun overlapsPeriod(event: DisplayEvent, period: PanelPeriod?, zone: ZoneId): Boolean {
    if (event.isSomeday || period == null || period.end < period.start) return false
    val from = period.start.atStartOfDay(zone).toInstant()
    val toExclusive = period.end.plusDays(1).atStartOfDay(zone).toInstant()
    return event.start < toExclusive && event.end > from
}

/**
 * Les évènements qui passent les filtres. `feedOf` rend le lien ICS d'un évènement (null : une note
 * personnelle) ; ceux dont le lien est dans `hiddenFeeds` sont écartés.
 */
fun filterPanelEvents(
    events: List<DisplayEvent>,
    status: StatusFilter,
    date: DateFilter,
    query: String,
    period: PanelPeriod?,
    hiddenFeeds: Set<String>,
    zone: ZoneId,
    feedOf: (DisplayEvent) -> String?,
): List<DisplayEvent> {
    val q = normalizeForSearch(query.trim())
    return events.filter { event ->
        when {
            (feedOf(event) ?: NO_ICS_FEED) in hiddenFeeds -> false
            date == DateFilter.SCHEDULED && event.isSomeday -> false
            date == DateFilter.UNSCHEDULED && !event.isSomeday -> false
            date == DateFilter.PERIOD && !overlapsPeriod(event, period, zone) -> false
            status != StatusFilter.ALL && (!event.isTask || event.taskStatus != status.name.lowercase()) -> false
            q.isNotEmpty() && !normalizeForSearch("${event.title} ${event.description.orEmpty()}").contains(q) -> false
            else -> true
        }
    }
}

data class PanelSummary(val totalMinutes: Long, val taskCount: Int)

/** Le temps planifié (les sans-date et les journées entières ne comptent pas) et le nombre de tâches. */
fun summarizePanelEvents(events: List<DisplayEvent>): PanelSummary {
    var minutes = 0L
    var tasks = 0
    for (event in events) {
        if (event.isTask) tasks++
        if (!event.isSomeday && !event.allDay) {
            minutes += max(0L, ((event.end.toEpochMilli() - event.start.toEpochMilli()) / 60000.0).roundToLong())
        }
    }
    return PanelSummary(minutes, tasks)
}

/** « 3h 05min ». */
fun formatTotalMinutes(totalMinutes: Long): String {
    val safe = max(0L, totalMinutes)
    return "${safe / 60}h ${(safe % 60).toString().padStart(2, '0')}min"
}

/** Ce que la ligne « Période » des totaux écrit selon le filtre de date. */
fun formatPanelPeriod(filter: DateFilter, period: PanelPeriod?): String {
    if (filter == DateFilter.SCHEDULED) return "Planifiés"
    if (filter == DateFilter.UNSCHEDULED) return "Non planifiés"
    if (filter != DateFilter.PERIOD || period == null) return "Toutes les dates"
    val sameYear = period.start.year == period.end.year
    fun day(date: LocalDate, withYear: Boolean) =
        formatDatedDay(date, weekday = false) + if (withYear) " ${date.year}" else ""
    return "${day(period.start, !sameYear)} – ${day(period.end, true)}"
}

private val COLOR_NAMES = mapOf(
    "#ed201d" to "Rouge", "#fd7941" to "Orange", "#f4be40" to "Jaune", "#5ecc89" to "Vert",
    "#33b5b5" to "Turquoise", "#4ca8df" to "Bleu", "#6c6fe8" to "Indigo", "#985df6" to "Violet",
    "#f45d9e" to "Rose", "#b07d53" to "Marron", "#b8b8b8" to "Gris", "#6b7684" to "Ardoise",
)

/** Le nom d'une couleur de la palette du sélecteur, « Personnalisé » pour toute autre. */
fun calendarColorName(color: String): String = COLOR_NAMES[color.trim().lowercase()] ?: "Personnalisé"
