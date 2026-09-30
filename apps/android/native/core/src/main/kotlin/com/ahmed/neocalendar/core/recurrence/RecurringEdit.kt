package com.ahmed.neocalendar.core.recurrence

import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.reminders.t
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/*
 * Ports de src/ui/calendar/recurringEdit.ts, recurringEditChanges.ts et
 * recurrenceDeletion.ts, et de parseOccurrenceId / isSeries (src/ui/tasks) :
 * modifier ou supprimer UN jour d'une série.
 *
 * Une série est une seule note ; « cet évènement seulement » écarte le jour de
 * la série (skipDates) et l'écrit comme un évènement ponctuel à part,
 * « tous » écrit la série. Les fonctions de la fiche travaillent sur l'objet
 * JSON du formulaire (les clés absentes y sont absentes, comme en TypeScript) ;
 * celles de la suppression sur l'évènement validé.
 */

enum class RecurringEditScope { Occurrence, Series }

private val OCCURRENCE_ID = Regex("""^(.*)_(\d{4}-\d{2}-\d{2})$""")

/** `parseOccurrenceId` : (identifiant de la note, jour), ou null pour un identifiant ordinaire. */
fun parseOccurrenceId(displayId: String): Pair<String, String>? =
    OCCURRENCE_ID.matchEntire(displayId)?.let { it.groupValues[1] to it.groupValues[2] }

fun occurrenceDateOf(displayId: String?): String? = displayId?.let { parseOccurrenceId(it)?.second }

fun isSeries(event: NeoEvent): Boolean = event is NeoEvent.Recurring || event is NeoEvent.Rrule

private fun isSeriesRecord(event: JsonObject?): Boolean {
    val type = (event?.get("type") as? JsonPrimitive)?.takeIf { it.isString }?.content
    return type == "recurring" || type == "rrule"
}

/** La fiche regarde-t-elle UN jour d'une série, avec un choix à proposer ? */
fun needsScopeChoice(event: JsonObject?, eventId: String?, isDraft: Boolean): Boolean {
    if (isDraft || !isSeriesRecord(event)) return false
    return occurrenceDateOf(eventId) != null
}

/** Clés qui n'appartiennent qu'à une série et ne veulent rien dire sur un évènement ponctuel. */
private val SERIES_ONLY = listOf("daysOfWeek", "startRecur", "endRecur", "startDate", "rrule", "skipDates", "completedDates")

/**
 * L'évènement ponctuel qu'un jour devient quand on le modifie seul : le
 * formulaire de la série, sans ce que seule une série porte. `done` : ce jour
 * était déjà coché, la tâche reste faite (datée de `now`).
 */
fun detachedOccurrence(payload: JsonObject, dateISO: String, done: Boolean = false, now: () -> String): JsonObject {
    val single = LinkedHashMap(payload)
    for (key in SERIES_ONLY) single.remove(key)
    // `completed` dit deux choses : que c'est une tâche (la clé est là) et, sur un ponctuel, quand elle a été finie.
    val isTask = payload.containsKey("completed")
    single["type"] = JsonPrimitive("single")
    single["date"] = JsonPrimitive(dateISO)
    single["endDate"] = JsonNull
    if (isTask) single["completed"] = if (done) JsonPrimitive(now()) else JsonPrimitive(false)
    return JsonObject(single)
}

private fun skipDatesOf(series: JsonObject): List<String> =
    (series["skipDates"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }

/** La série sans ce jour : il rejoint `skipDates`. */
fun seriesWithoutOccurrence(series: JsonObject, dateISO: String): JsonObject {
    val skip = skipDatesOf(series)
    if (dateISO in skip) return series
    val next = LinkedHashMap(series)
    next["skipDates"] = JsonArray((skip + dateISO).map { JsonPrimitive(it) })
    return JsonObject(next)
}

fun occurrenceIsDone(series: JsonObject?, dateISO: String): Boolean =
    series != null && ((series["completedDates"] as? JsonArray).orEmpty().any { (it as? JsonPrimitive)?.content == dateISO })

// ── Suppression d'un jour, ou de ce jour et des suivants ─────────────────────

/** La règle RRULE remplacée, UNTIL (ou COUNT) revus : même ordre des parties que `new RRule(options).toString()`. */
private fun ruleEndingOn(rrule: String, lastDay: LocalDate): String {
    val parts = rruleParts(rrule).filter { it.first != "COUNT" }.toMutableList()
    val until = "UNTIL" to (lastDay.toString().replace("-", "") + "T235959Z")
    val index = parts.indexOfFirst { it.first == "UNTIL" }
    if (index >= 0) parts[index] = until else parts += until
    return "RRULE:" + parts.joinToString(";") { "${it.first}=${it.second}" }
}

/** La suppression doit-elle demander quoi supprimer : un jour de série, ou ce jour et les suivants ? */
fun needsOccurrenceChoice(event: NeoEvent, displayId: String): Boolean =
    isSeries(event) && parseOccurrenceId(displayId) != null

/** La série sans ce jour ; un évènement ponctuel est rendu tel quel. */
fun withOccurrenceRemoved(event: NeoEvent, dateISO: String): NeoEvent = when (event) {
    is NeoEvent.Recurring -> event.copy(skipDates = if (dateISO in event.skipDates) event.skipDates else event.skipDates + dateISO)
    is NeoEvent.Rrule -> event.copy(skipDates = if (dateISO in event.skipDates) event.skipDates else event.skipDates + dateISO)
    else -> event
}

/** La série arrêtée la veille de ce jour, ou null quand il n'en resterait rien (l'appelant supprime alors la note). */
fun withFollowingRemoved(event: NeoEvent, dateISO: String): NeoEvent? {
    if (!isSeries(event)) return null
    val start = seriesStartDate(event) ?: return null
    if (start >= dateISO) return null
    val endsOn = (parseIsoDate(dateISO) ?: return null).minusDays(1)
    return when (event) {
        is NeoEvent.Recurring -> event.copy(endRecur = endsOn.toString())
        is NeoEvent.Rrule -> event.copy(rrule = ruleEndingOn(event.rrule, endsOn))
        else -> null
    }
}

// ── recurringEditChanges : ce que la modification change, pour le dialogue de portée ─────

data class RecurringEditChange(val key: String, val label: String, val before: String, val after: String)

data class RecurringEditChangeContext(
    val previousCalendarId: String? = null,
    val nextCalendarId: String? = null,
    val previousCalendarLabel: String? = null,
    val nextCalendarLabel: String? = null,
)

private fun JsonObject.str(key: String): String = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()

private fun startDateOf(event: JsonObject): String = when (event.str("type")) {
    "recurring" -> event.str("startRecur")
    "rrule" -> event.str("startDate")
    else -> event.str("date")
}

private fun endDateOf(event: JsonObject): String {
    val type = event.str("type")
    if (type != "single" && (event["type"] != null)) return ""
    return event.str("endDate")
}

private fun shortText(value: String): String {
    val compact = value.replace(Regex("""\s+"""), " ").trim()
    if (compact.isEmpty()) return "Empty"
    return if (compact.length > 72) compact.substring(0, 69) + "…" else compact
}

private fun dateText(start: String, end: String): String {
    if (start.isEmpty()) return "None"
    return if (end.isNotEmpty() && end != start) "$start – $end" else start
}

private fun statusText(event: JsonObject): String {
    val completed = event["completed"] ?: return "Event"
    if (completed is JsonNull) return "Event"
    return if (completed is JsonPrimitive && completed.isString && completed.content.isNotEmpty()) "Done" else "To do"
}

private fun remindersText(event: JsonObject): String {
    val value = event["reminders"] ?: return "Default"
    if (value !is JsonArray || value.isEmpty()) return "None"
    return value.mapNotNull { (it as? JsonPrimitive)?.doubleOrNull ?: (it as? JsonPrimitive)?.content?.toDoubleOrNull() }
        .filter { it.isFinite() }
        .joinToString(", ") { minutes ->
            when {
                minutes == 0.0 -> "At start of event"
                minutes % 1440 == 0.0 -> (minutes / 1440).let { d -> "${jsInt(d)} day${if (d == 1.0) "" else "s"} before" }
                minutes % 60 == 0.0 -> (minutes / 60).let { h -> "${jsInt(h)} hour${if (h == 1.0) "" else "s"} before" }
                else -> "${jsInt(minutes)} min before"
            }
        }
}

private fun jsInt(value: Double): String = if (value == Math.floor(value) && Math.abs(value) < 1e15) value.toLong().toString() else value.toString()

private fun recurrenceKey(event: JsonObject): Pair<Boolean, RecurrenceState> =
    eventToRecurrenceState(event, startDateOf(event)).let { it.isRecurring to it.recurrence }

private fun recurrenceText(event: JsonObject): String {
    val state = eventToRecurrenceState(event, startDateOf(event))
    if (!state.isRecurring) return "Once"
    return recurrenceSummary(state.recurrence)
}

/**
 * Les différences entre la série telle qu'elle est et ce que la fiche veut
 * écrire. Les libellés et les valeurs sont les clés anglaises du TypeScript
 * (l'interface les traduit à l'affichage).
 */
fun recurringEditChanges(
    stable: JsonObject,
    payload: JsonObject,
    context: RecurringEditChangeContext = RecurringEditChangeContext(),
): List<RecurringEditChange> {
    val changes = mutableListOf<RecurringEditChange>()
    fun add(key: String, label: String, before: String, after: String) {
        if (before != after) changes += RecurringEditChange(key, label, before, after)
    }

    add("title", "Title", shortText(stable.str("title")), shortText(payload.str("title")))

    val beforeEnd = endDateOf(stable)
    val afterEnd = endDateOf(payload)
    val ranged = beforeEnd.isNotEmpty() || afterEnd.isNotEmpty()
    add(
        if (ranged) "dates" else "date", if (ranged) "Dates" else "Date",
        dateText(startDateOf(stable), beforeEnd), dateText(startDateOf(payload), afterEnd),
    )

    add("startTime", "Start time", stable.str("startTime").ifEmpty { "None" }, payload.str("startTime").ifEmpty { "None" })
    add("endTime", "End time", stable.str("endTime").ifEmpty { "None" }, payload.str("endTime").ifEmpty { "None" })
    fun allDay(event: JsonObject) = if ((event["allDay"] as? JsonPrimitive)?.booleanOrNull == true) "On" else "Off"
    add("allDay", "All day", allDay(stable), allDay(payload))

    if (recurrenceKey(stable) != recurrenceKey(payload)) {
        changes += RecurringEditChange("repeat", "Repeat", recurrenceText(stable), recurrenceText(payload))
    }

    val previous = context.previousCalendarId
    val next = context.nextCalendarId
    if (previous != null && next != null && previous != next) {
        changes += RecurringEditChange(
            "calendar", "Calendar",
            context.previousCalendarLabel?.ifEmpty { null } ?: previous,
            context.nextCalendarLabel?.ifEmpty { null } ?: next,
        )
    }

    add("status", "Status", statusText(stable), statusText(payload))
    add("reminders", "Reminders", remindersText(stable), remindersText(payload))
    add("description", "Description", shortText(stable.str("description")), shortText(payload.str("description")))
    return changes
}
