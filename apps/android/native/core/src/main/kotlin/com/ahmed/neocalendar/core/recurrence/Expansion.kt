package com.ahmed.neocalendar.core.recurrence

import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.jsTrim
import com.ahmed.neocalendar.core.reminders.t
import java.time.Instant
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de src/ui/calendar/eventExpansion.ts : un NeoEvent (format de stockage)
 * devient des DisplayEvent (format d'affichage) pour une fenêtre visible. Les
 * séries `rrule` viennent avec la tâche suivante ; ici elles ne donnent rien.
 */

private class ExpandContext(
    val id: String,
    val calendarId: String,
    val calendarName: String,
    val color: String,
    val editable: Boolean,
    val rangeStart: Instant,
    val rangeEnd: Instant,
)

/** `DAY_CODE_TO_INDEX` du TypeScript : dimanche = 0, comme `Date.getDay()`. */
private val DAY_CODE_TO_INDEX = mapOf("U" to 0, "M" to 1, "T" to 2, "W" to 3, "R" to 4, "F" to 5, "S" to 6)

private const val HOUR_MS = 3_600_000L

private class Times(val start: Instant, val end: Instant)

/** `a || b` de JavaScript sur une chaîne absente ou vide. */
private fun String?.orElse(fallback: String): String = if (this.isNullOrEmpty()) fallback else this

/**
 * Construit la paire début / fin d'un évènement, ou null si la lecture échoue.
 * Pour un all-day, `end` est exclusive (minuit du lendemain).
 */
private fun resolveTimes(
    dateStr: String,
    endDateStr: String?,
    allDay: Boolean,
    startTime: String?,
    endTime: String?,
): Times? {
    if (allDay) {
        val start = parseDateOnly(dateStr) ?: return null
        var endBase = parseDateOnly(endDateStr.orElse(dateStr)) ?: return null
        // Un all-day ne finit pas avant de commencer. Une donnée dégénérée (par
        // ex. endDate un jour avant date, produite par certaines éditions en
        // lot) donnerait end <= start, écraserait la barre et casserait le
        // placement des couloirs. On borne : l'évènement couvre au moins son
        // jour de début.
        if (endBase < start) endBase = start
        return Times(start, addDays(endBase, 1))
    }

    val effectiveStartTime = startTime.orElse("00:00")
    val start = parseTimeToDate(dateStr, effectiveStartTime) ?: return null

    // Une plage horaire dont l'heure de fin est après celle de début tient dans
    // un seul jour : tout endDate est ignoré. Une donnée contradictoire (par ex.
    // un endDate du lendemain sur un 23:30 -> 23:45) étirerait sinon l'évènement
    // sur deux jours et l'afficherait en colonne pleine. Un vrai passage de
    // minuit a endTime <= startTime, le décalage plus bas s'en charge : il n'a
    // pas besoin d'endDate.
    val endBaseDate =
        if (!endTime.isNullOrEmpty() && endTime > effectiveStartTime) dateStr else endDateStr.orElse(dateStr)
    var end =
        if (!endTime.isNullOrEmpty()) {
            parseTimeToDate(endBaseDate, endTime) ?: start.plusMillis(HOUR_MS)
        } else {
            start.plusMillis(HOUR_MS)
        }
    // Une heure de fin égale ou antérieure au début : l'évènement finit le
    // LENDEMAIN à cette heure (23:00 -> 01:45). On avance le jour de fin plutôt
    // que de borner à minuit.
    if (end <= start) end = addDays(end, 1)
    // Toujours dégénéré (par ex. un endDate très antérieur issu d'une mauvaise
    // édition) : une heure.
    if (end <= start) end = start.plusMillis(HOUR_MS)
    return Times(start, end)
}

/** `getTaskStatus` (src/ui/tasks/index.ts) d'un évènement qui porte son statut :
 *  null tant que `completed` est absent ou null. */
private fun taskStatusOf(completed: JsonElement?): String? {
    if (completed == null || completed is JsonNull) return null
    val primitive = completed as JsonPrimitive
    // Tout le reste est une date ISO : le moment où la tâche a été finie.
    val todo = if (primitive.isString) primitive.content == "in-progress" else primitive.content == "false"
    return if (todo) "todo" else "complete"
}

private fun isTask(completed: JsonElement?): Boolean = completed != null && completed !is JsonNull

private fun displayTitle(title: String): String = title.jsTrim().ifEmpty { t("Untitled") }

// ── Évènements ponctuels ───────────────────────────────────

private fun expandSingle(event: NeoEvent.Single, ctx: ExpandContext): List<DisplayEvent> {
    val times = resolveTimes(
        event.date,
        event.endDate,
        event.allDay,
        if (event.allDay) null else event.startTime.orElse("00:00"),
        if (event.allDay) null else event.endTime?.ifEmpty { null },
    ) ?: return emptyList()

    val startTime = event.startTime.orElse("00:00")
    val endTime = event.endTime
    return listOf(
        DisplayEvent(
            id = ctx.id,
            title = displayTitle(event.title),
            start = times.start,
            end = times.end,
            allDay = event.allDay,
            color = ctx.color,
            editable = ctx.editable,
            calendarId = ctx.calendarId,
            calendarName = ctx.calendarName,
            isTask = isTask(event.completed),
            taskCompleted = event.completed?.takeUnless { it is JsonNull } ?: JsonPrimitive(false),
            taskStatus = taskStatusOf(event.completed),
            reminders = event.reminders,
            isRecurring = false,
            isSeriesStart = false,
            isMultiDay = !event.allDay &&
                !event.endDate.isNullOrEmpty() &&
                event.endDate != event.date &&
                // Même garde que resolveTimes : une plage horaire du même jour
                // (endTime après startTime) n'est jamais multi-jours, quoi que
                // dise endDate.
                !(!endTime.isNullOrEmpty() && endTime > startTime),
            isSomeday = false,
            description = event.description,
            location = event.location,
        )
    )
}

// ── Séries par jours de la semaine ─────────────────────────

private fun expandRecurring(event: NeoEvent.Recurring, ctx: ExpandContext): List<DisplayEvent> {
    val targetDays = event.daysOfWeek.mapNotNull { DAY_CODE_TO_INDEX[it] }
    if (targetDays.isEmpty()) return emptyList()

    // Une date illisible donne NaN en JavaScript, donc une boucle qui ne tourne
    // jamais : aucune occurrence.
    val startRecur = event.startRecur
    val endRecur = event.endRecur
    val effectiveStart = if (startRecur.isNullOrEmpty()) ctx.rangeStart else parseDateOnly(startRecur) ?: return emptyList()
    val effectiveEnd = if (endRecur.isNullOrEmpty()) ctx.rangeEnd else parseDateOnly(endRecur) ?: return emptyList()

    val startMs = maxOf(effectiveStart, ctx.rangeStart)
    val limit = minOf(effectiveEnd, ctx.rangeEnd)

    // Les dates dont une occurrence a été détachée (déplacée ou redimensionnée
    // seule). Sans cela la date détachée reviendrait à la lecture suivante et
    // se poserait sur la copie déplacée.
    val skipSet = event.skipDates.toSet()
    val seriesIsTask = isTask(event.completed)
    val doneDays = (event.completedDates ?: emptyList()).toSet()
    // Lu une fois pour toute la série : la première occurrence restante est un
    // fait de la série, pas de la fenêtre dessinée.
    val startsOn = seriesStartDate(event)

    val results = ArrayList<DisplayEvent>()
    var current = startOfDay(startMs)

    while (current <= limit) {
        val day = current.atZone(localZone()).toLocalDate()
        // Date.getDay() : dimanche = 0.
        if (day.dayOfWeek.value % 7 in targetDays) {
            val dateStr = day.toString()
            if (dateStr in skipSet) {
                current = addDays(current, 1)
                continue
            }
            val times = resolveTimes(
                dateStr,
                null,
                event.allDay,
                if (event.allDay) null else event.startTime.orElse("00:00"),
                if (event.allDay) null else event.endTime?.ifEmpty { null },
            )
            if (times != null) {
                val done = dateStr in doneDays
                results.add(
                    DisplayEvent(
                        id = "${ctx.id}_$dateStr",
                        title = displayTitle(event.title),
                        start = times.start,
                        end = times.end,
                        allDay = event.allDay,
                        color = ctx.color,
                        editable = ctx.editable,
                        calendarId = ctx.calendarId,
                        calendarName = ctx.calendarName,
                        // Chaque occurrence répond pour elle-même : la série dit
                        // si c'est une tâche, `completedDates` quels jours sont faits.
                        isTask = seriesIsTask,
                        taskCompleted = JsonPrimitive(done),
                        taskStatus = if (done) "complete" else "todo",
                        reminders = event.reminders,
                        isRecurring = true,
                        isSeriesStart = dateStr == startsOn,
                        isMultiDay = false,
                        isSomeday = false,
                        description = event.description,
                        location = event.location,
                    )
                )
            }
        }
        current = addDays(current, 1)
    }

    return results
}

// ── Point d'entrée ─────────────────────────────────────────

fun neoEventToDisplayEvents(
    event: NeoEvent,
    id: String,
    calendarId: String,
    calendarName: String,
    color: String,
    editable: Boolean,
    rangeStart: Instant,
    rangeEnd: Instant,
): List<DisplayEvent> {
    val ctx = ExpandContext(id, calendarId, calendarName, color, editable, rangeStart, rangeEnd)
    return when (event) {
        is NeoEvent.Single -> expandSingle(event, ctx)
        is NeoEvent.Recurring -> expandRecurring(event, ctx)
        // La série `rrule` est portée avec la tâche suivante.
        is NeoEvent.Rrule -> emptyList()
        // « someday » n'est pas étendu ici.
        is NeoEvent.Someday -> emptyList()
    }
}
