package com.ahmed.neocalendar.core.lists

import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.recurrence.neoEventToDisplayEvents
import com.ahmed.neocalendar.core.tasks.getTaskStatus
import com.ahmed.neocalendar.core.tasks.isTask
import com.ahmed.neocalendar.core.tasks.normalizeForSearch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/*
 * Les évènements des listes : celle d'un calendrier, celle des tâches, la
 * recherche. Port de `panelEvents` et de l'assemblage des « someday » de
 * CalendarApp.tsx, de filterPanelEvents et de groupEventsByDay.
 */

/** Un évènement sans date : il ne figure pas dans la grille, seulement dans les listes. */
fun somedayToDisplayEvent(event: NeoEvent.Someday, id: String, calendar: CalendarModel, now: Instant): DisplayEvent =
    DisplayEvent(
        id = id,
        title = event.title.trim().ifEmpty { "Sans titre" },
        start = now,
        end = now,
        allDay = true,
        color = calendar.color,
        editable = calendar.editable,
        calendarId = calendar.id,
        calendarName = calendar.name,
        isTask = isTask(event),
        taskCompleted = event.completed?.takeUnless { it is JsonNull } ?: JsonPrimitive(false),
        taskStatus = getTaskStatus(event),
        reminders = event.reminders,
        isRecurring = false,
        isSeriesStart = false,
        isMultiDay = false,
        isSomeday = true,
        description = event.description,
        location = event.location,
    )

/** Les occurrences d'une note sur [from, to] ; un « someday » tient en un seul évènement. */
fun displayEventsOf(
    stored: StoredEvent,
    calendar: CalendarModel,
    from: Instant,
    to: Instant,
    now: Instant,
): List<DisplayEvent> = when (val event = stored.event) {
    is NeoEvent.Someday -> listOf(somedayToDisplayEvent(event, stored.id, calendar, now))
    else -> neoEventToDisplayEvents(event, stored.id, calendar.id, calendar.name, calendar.color, calendar.editable, from, to)
}

/** L'évènement d'une tâche, pour la feuille de lecture : null si la note n'a pas d'occurrence. */
fun displayEventOfNote(stored: StoredEvent, calendar: CalendarModel, now: Instant): DisplayEvent? =
    displayEventsOf(stored, calendar, Instant.parse("1900-01-01T00:00:00Z"), Instant.parse("2200-01-01T00:00:00Z"), now).firstOrNull()

/**
 * Tout ce que contient un calendrier, les séries étendues de deux ans avant à
 * deux ans après l'année courante : les sans-date d'abord, puis du plus récent
 * au plus ancien.
 */
fun calendarPanelEvents(
    notes: List<StoredEvent>,
    calendar: CalendarModel,
    zone: ZoneId,
    now: Instant,
): List<DisplayEvent> {
    val year = now.atZone(zone).year
    val from = LocalDate.of(year - 2, 1, 1).atStartOfDay(zone).toInstant()
    val to = LocalDate.of(year + 2, 12, 31).plusDays(1).atStartOfDay(zone).toInstant()
    val out = ArrayList<DisplayEvent>()
    for (stored in notes) {
        if (stored.calendarId != calendar.id) continue
        out += displayEventsOf(stored, calendar, from, to, now)
    }
    return out.sortedWith { a, b ->
        if (a.isSomeday != b.isSomeday) (if (a.isSomeday) -1 else 1) else b.start.compareTo(a.start)
    }
}

/**
 * Ce que la recherche fouille : les évènements de tous les calendriers (masqués
 * compris, comme la palette du PC) sur la fenêtre de l'affichage, du mois
 * courant moins deux au mois courant plus deux, et les sans-date.
 */
fun searchCorpus(
    notes: List<StoredEvent>,
    calendars: Map<String, CalendarModel>,
    anchor: LocalDate,
    zone: ZoneId,
    now: Instant,
): List<DisplayEvent> {
    val month = anchor.withDayOfMonth(1)
    val from = month.minusMonths(2).atStartOfDay(zone).toInstant()
    val to = month.plusMonths(3).atStartOfDay(zone).toInstant()
    val out = ArrayList<DisplayEvent>()
    for (stored in notes) {
        val calendar = calendars[stored.calendarId] ?: continue
        out += displayEventsOf(stored, calendar, from, to, now)
    }
    return out
}

/** Le titre ou la description contient la saisie, sans casse ni accents ; un champ vide ne cache rien. */
fun filterPanelEvents(events: List<DisplayEvent>, query: String): List<DisplayEvent> {
    val q = normalizeForSearch(query.trim())
    if (q.isEmpty()) return events
    return events.filter { normalizeForSearch("${it.title} ${it.description.orEmpty()}").contains(q) }
}

enum class Timeframe { PAST, NOW, FUTURE }

/** Où se situe un évènement par rapport à maintenant ; null pour un sans-date (il attend, il n'est pas en retard). */
fun panelTimeframe(event: DisplayEvent, now: Instant): Timeframe? = when {
    event.isSomeday -> null
    event.end <= now -> Timeframe.PAST
    event.start > now -> Timeframe.FUTURE
    else -> Timeframe.NOW
}

/** Les résultats d'une recherche : le titre contient la saisie (sans casse ni accents) ; rien de saisi, rien de listé. */
fun searchEvents(events: List<DisplayEvent>, query: String): List<DisplayEvent> {
    val q = normalizeForSearch(query.trim())
    if (q.isEmpty()) return emptyList()
    return events.filter { normalizeForSearch(it.title).contains(q) }
}

/** Un jour de résultats ; `date` est null pour les évènements sans date. */
data class EventDay(val date: LocalDate?, val events: List<DisplayEvent>)

/** Les résultats du plus ancien au plus récent, regroupés sous leur jour de début ; les sans-date à la fin. */
fun groupEventsByDay(events: List<DisplayEvent>, zone: ZoneId): List<EventDay> {
    val (someday, dated) = events.partition { it.isSomeday }
    val days = dated.sortedBy { it.start }
        .groupBy { it.start.atZone(zone).toLocalDate() }
        .map { (date, list) -> EventDay(date, list) }
    return if (someday.isEmpty()) days else days + EventDay(null, someday)
}
