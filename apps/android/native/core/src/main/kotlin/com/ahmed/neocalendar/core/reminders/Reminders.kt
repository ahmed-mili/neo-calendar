package com.ahmed.neocalendar.core.reminders

import com.ahmed.neocalendar.core.jsNumber

import com.ahmed.neocalendar.core.notes.jsTrim
import com.ahmed.neocalendar.core.notes.numberOf
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.recurrence.addDays
import com.ahmed.neocalendar.core.recurrence.localZone
import com.ahmed.neocalendar.core.recurrence.startOfDay
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de apps/windows/src/platform/androidReminders.ts : quand le téléphone
 * doit se manifester pour un évènement, avec les phrases toutes faites.
 */

/** Au-delà, un rappel n'est pas planifié. */
const val REMINDER_HORIZON_DAYS = 30L

/** Rappel d'une journée entière sans liste propre : la veille à cette heure. */
const val ALL_DAY_REMINDER_HOUR = 20

/** Au-delà, la note est coupée. */
private const val DESCRIPTION_LIMIT = 200

private const val DAY_MS = 24 * 60 * 60_000.0

data class Reminder(
    val id: String,
    val key: String,
    /** Le moment du rappel, en millisecondes (un `number` : peut être fractionnaire). */
    val atMs: Double,
    val title: String,
    val body: String,
    val details: String,
) {
    fun toJson(): JsonObject = JsonObject(
        mapOf<String, JsonElement>(
            "id" to JsonPrimitive(id),
            "key" to JsonPrimitive(key),
            "atMs" to numberOf(atMs),
            "title" to JsonPrimitive(title),
            "body" to JsonPrimitive(body),
            "details" to JsonPrimitive(details),
        )
    )
}

/** `formatTime` de calendarFormatters.ts. */
internal fun formatTime(date: Instant, format24h: Boolean): String {
    val local = date.atZone(localZone())
    val h = local.hour
    val m = local.minute.toString().padStart(2, '0')
    if (format24h) return "${h.toString().padStart(2, '0')}:$m"
    val ampm = if (h >= 12) "PM" else "AM"
    val h12 = if (h == 0) 12 else if (h > 12) h - 12 else h
    return "$h12:$m $ampm"
}

/** `Date.getDay()` : dimanche = 0. */
private fun weekdayIndex(date: Instant): Int = date.atZone(localZone()).dayOfWeek.value % 7

/** `formatDatedDay` en français : « lun 28 sept ». */
private fun formatDatedDay(date: Instant): String {
    val local = date.atZone(localZone())
    return "${DAYS_SHORT[weekdayIndex(date)]} ${local.dayOfMonth} ${MONTHS_SHORT[local.monthValue - 1]}"
}

/** L'heure, qualifiée quand l'évènement n'est pas aujourd'hui (jours civils locaux). */
private fun whenFor(start: Instant, now: Instant, timeFormat24h: Boolean): String {
    val time = formatTime(start, timeFormat24h)
    val diff = (startOfDay(start).toEpochMilli() - startOfDay(now).toEpochMilli()) / DAY_MS
    val days = Math.floor(diff + 0.5).toLong()
    if (days <= 0) return time
    if (days == 1L) return "${t("Tomorrow")} $time"
    if (days < 7) return "${DAYS_SHORT[weekdayIndex(start)]} $time"
    return "${formatDatedDay(start)} $time"
}

private fun bodyFor(offsetMinutes: Double, start: Instant, now: Instant, timeFormat24h: Boolean): String {
    val whenText = whenFor(start, now, timeFormat24h)
    if (offsetMinutes <= 0) return "${t("Starting now")} · $whenText"
    return "${t("In")} ${relativeDelayLabel(offsetMinutes)} · $whenText"
}

private fun withPlace(line: String, location: String?): String {
    val place = (location ?: "").jsTrim()
    return if (place.isNotEmpty()) "$line · $place" else line
}

private fun detailsFor(event: DisplayEvent, timeFormat24h: Boolean): String {
    val whenText = if (event.allDay) {
        t("All-day")
    } else {
        "${formatTime(event.start, timeFormat24h)} – ${formatTime(event.end, timeFormat24h)}"
    }
    val note = (event.description ?: "").jsTrim()
    return listOf(
        whenText,
        (event.location ?: "").jsTrim(),
        event.calendarName.jsTrim(),
        if (note.length > DESCRIPTION_LIMIT) note.substring(0, DESCRIPTION_LIMIT - 1) + "…" else note,
    ).filter { it.isNotEmpty() }.joinToString("\n")
}

/** La veille à `ALL_DAY_REMINDER_HOUR`, heure locale. */
private fun eveningBefore(start: Instant): Double {
    val date = start.atZone(localZone()).toLocalDate().minusDays(1)
    return LocalDateTime.of(date, LocalTime.of(ALL_DAY_REMINDER_HOUR, 0)).atZone(localZone()).toInstant()
        .toEpochMilli().toDouble()
}

/**
 * `at.setMinutes(at.getMinutes() - offset)` : arithmétique locale, l'heure du
 * mur est gardée de part et d'autre d'un changement d'heure. L'argument est
 * tronqué vers zéro, comme le fait JavaScript.
 */
private fun allDayReminderAt(start: Instant, offsetMinutes: Double): Double {
    val local = start.atZone(localZone()).toLocalDateTime()
    val raw = local.minute - offsetMinutes
    val minutes = (if (raw < 0) Math.ceil(raw) else Math.floor(raw)).toLong()
    return local.withMinute(0).plusMinutes(minutes).atZone(localZone()).toInstant().toEpochMilli().toDouble()
}

/**
 * Les rappels que demande chaque évènement : les siens, sinon ceux de son
 * calendrier, sinon ceux des Paramètres. Une liste vide est un silence demandé.
 */
fun buildReminders(
    events: List<DisplayEvent>,
    now: Instant,
    minutesBefore: List<Long>,
    minutesByCalendar: Map<String, List<Long>>,
    timeFormat24h: Boolean,
): List<Reminder> {
    val horizon = addDays(now, REMINDER_HORIZON_DAYS)
    val nowMs = now.toEpochMilli().toDouble()

    return events
        .filter { !it.isSomeday }
        .filter { it.start < horizon }
        .flatMap { event ->
            val title = event.title.ifEmpty { t("Untitled") }
            val details = detailsFor(event, timeFormat24h)
            val fallback = (minutesByCalendar[event.calendarId] ?: minutesBefore).map { it.toDouble() }
            val own = event.reminders

            if (event.allDay) {
                if (own != null) {
                    return@flatMap own.map { offset ->
                        Reminder(
                            id = event.id,
                            key = "${event.id}#day:${jsNumber(offset)}",
                            atMs = allDayReminderAt(event.start, offset),
                            title = title,
                            body = withPlace(t("All-day"), event.location),
                            details = details,
                        )
                    }
                }
                if (fallback.isEmpty()) return@flatMap emptyList()
                return@flatMap listOf(
                    Reminder(
                        id = event.id,
                        key = "${event.id}#day",
                        atMs = eveningBefore(event.start),
                        title = title,
                        body = withPlace(t("Tomorrow, all day"), event.location),
                        details = details,
                    )
                )
            }

            val offsets = own ?: fallback
            offsets.map { offset ->
                Reminder(
                    id = event.id,
                    key = "${event.id}#${jsNumber(offset)}",
                    atMs = event.start.toEpochMilli().toDouble() - offset * 60_000,
                    title = title,
                    body = withPlace(bodyFor(offset, event.start, now, timeFormat24h), event.location),
                    details = details,
                )
            }
        }
        // Un rappel dont l'instant est passé est écarté plutôt que tiré en retard.
        .filter { it.atMs > nowMs }
        .sortedBy { it.atMs }
}

/**
 * Les délais réglés calendrier par calendrier, relus sous l'identifiant que les
 * évènements portent (`remindersByCalendarId` de androidReminders.ts). Un chemin
 * qu'aucun calendrier ne porte est laissé de côté : il vient d'un dossier retiré.
 */
fun remindersByCalendarId(
    calendars: List<Pair<String, String>>,
    minutesByPath: Map<String, List<Long>>,
): Map<String, List<Long>> =
    calendars.filter { (_, path) -> path in minutesByPath }.associate { (id, path) -> id to minutesByPath.getValue(path) }
