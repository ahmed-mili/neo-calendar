package com.ahmed.neocalendar.core.form

import com.ahmed.neocalendar.core.description.withStepsAppended
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.recurrence.RecurrenceState
import com.ahmed.neocalendar.core.recurrence.defaultRecurrence
import com.ahmed.neocalendar.core.recurrence.eventToRecurrenceState
import com.ahmed.neocalendar.core.recurrence.isSeries
import com.ahmed.neocalendar.core.recurrence.recurrenceToEventFields
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.notes.numberOf
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port du formulaire de la fiche : `useEventFormState` (src/ui/calendar/
 * useEventFormState.ts) sans React. `EventFormValues` est ce que la fiche tient
 * à l'écran ; `formValuesOfEvent` / `formValuesOfDraft` sont son chargement,
 * `buildPayload` ce qu'elle écrirait. Les champs que le formulaire ne tient pas
 * (id, geo, participants...) restent ceux de la note : `mergeForSave` les garde.
 */

data class EventFormValues(
    val title: String = "",
    val description: String = "",
    val location: String = "",
    /** `AAAA-MM-JJ` ; vide = évènement sans date. */
    val date: String = "",
    val endDate: String? = null,
    val startTime: String = "",
    val endTime: String = "",
    val allDay: Boolean = false,
    val isRecurring: Boolean = false,
    val recurrence: RecurrenceState,
    val calendarIndex: Int = 0,
    /** null = évènement ordinaire ; « todo » ou « complete » = tâche. */
    val taskStatus: String? = null,
    val due: String? = null,
    /** null = les rappels du réglage ; une liste (même vide) = ceux de l'évènement. */
    val reminders: List<Double>? = null,
    val completedDates: List<String>? = null,
    val skipDates: List<String>? = null,
)

private val CLOCK = DateTimeFormatter.ofPattern("HH:mm")

/** `DateTime.now().toISO()` de luxon : millisecondes et décalage local (`+02:00`, jamais `Z`). */
fun nowIso(): String = OffsetDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSxxx"))

/** `new Date().toISOString()` : UTC, millisecondes, `Z`. */
fun nowUtcIso(): String =
    OffsetDateTime.now(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))

/** `completedFor` : false = à faire, l'instant de fin = faite, absent = pas une tâche. */
private fun completedFor(taskStatus: String?, now: () -> String): JsonElement? = when (taskStatus) {
    null -> null
    "complete" -> JsonPrimitive(now())
    else -> JsonPrimitive(false)
}

private fun dueFor(taskStatus: String?, due: String?): String? = if (taskStatus == null || due.isNullOrEmpty()) null else due

/** `formStatusOf` : l'état que la fiche affiche, une série comprise (elle est « à faire » dès qu'elle est une tâche). */
fun formStatusOf(event: NeoEvent): String? {
    if (isSeries(event)) return if (com.ahmed.neocalendar.core.tasks.isTask(event)) "todo" else null
    return com.ahmed.neocalendar.core.tasks.getTaskStatus(event)
}

/** Les étapes de l'ancienne liste `subtasks` (`[x] titre`, `[ ] titre`, ou une ligne nue), lues comme le TypeScript. */
private val MARKED_STEP = Regex("""^\s*\[(.)]\s?(.*)$""", RegexOption.DOT_MATCHES_ALL)
private val OUTSTANDING_MARKS = setOf(" ", "", "/", "~")

private fun stepsOf(event: NeoEvent): List<Pair<String, Boolean>> = (event.subtasks ?: emptyList()).mapNotNull { line ->
    val marked = MARKED_STEP.matchEntire(line)
    val step = if (marked == null) line.trim() to false
    else marked.groupValues[2].trim() to (marked.groupValues[1] !in OUTSTANDING_MARKS)
    step.takeIf { it.first.isNotEmpty() }
}

private fun calendarIndexOf(calendarIds: List<String>, currentCalendarId: String) =
    calendarIds.indexOf(currentCalendarId).takeIf { it >= 0 } ?: 0

/** Le formulaire d'un évènement qui existe (ou d'un jour de série : c'est la série qui est lue). */
fun formValuesOfEvent(
    event: NeoEvent,
    calendarIds: List<String>,
    currentCalendarId: String,
    today: LocalDate = LocalDate.now(ZoneOffset.UTC),
): EventFormValues {
    val steps = stepsOf(event)
    val base = EventFormValues(
        title = event.title,
        description = withStepsAppended(event.description.orEmpty(), steps),
        location = event.location.orEmpty(),
        allDay = event.allDay,
        reminders = event.reminders,
        taskStatus = formStatusOf(event),
        calendarIndex = calendarIndexOf(calendarIds, currentCalendarId),
        recurrence = defaultRecurrence(today.toString()),
    )
    val record = event.toRecord()
    fun times() = if (!event.allDay) (event.startTime.orEmpty() to event.endTime.orEmpty()) else ("" to "")
    return when (event) {
        is NeoEvent.Single -> {
            val state = eventToRecurrenceState(record, event.date)
            val (start, end) = times()
            base.copy(
                date = event.date, endDate = event.endDate, startTime = start, endTime = end,
                isRecurring = state.isRecurring, recurrence = state.recurrence,
                due = (event.due as? JsonPrimitive)?.takeIf { it.isString }?.content,
            )
        }
        is NeoEvent.Recurring -> {
            val date = event.startRecur.orEmpty()
            val state = eventToRecurrenceState(record, date)
            val (start, end) = times()
            base.copy(
                date = date, startTime = start, endTime = end,
                isRecurring = state.isRecurring, recurrence = state.recurrence,
                completedDates = event.completedDates, skipDates = event.skipDates,
            )
        }
        is NeoEvent.Rrule -> {
            val state = eventToRecurrenceState(record, event.startDate)
            val (start, end) = times()
            base.copy(
                date = event.startDate, startTime = start, endTime = end,
                isRecurring = state.isRecurring, recurrence = state.recurrence,
                completedDates = event.completedDates, skipDates = event.skipDates,
            )
        }
        is NeoEvent.Someday -> base.copy(
            due = (event.due as? JsonPrimitive)?.takeIf { it.isString }?.content,
        )
    }
}

/** Le formulaire d'une ébauche (un créneau choisi sur la grille, le bouton +). */
fun formValuesOfDraft(
    start: LocalDateTime,
    end: LocalDateTime,
    allDay: Boolean,
    defaultAsTask: Boolean,
    calendarIds: List<String>,
    currentCalendarId: String,
): EventFormValues {
    val startDate = start.toLocalDate().toString()
    // La fin d'une journée entière est exclusive : le dernier jour est la veille.
    val endDate = (if (allDay) end.toLocalDate().minusDays(1) else end.toLocalDate()).toString()
    return EventFormValues(
        date = startDate,
        allDay = allDay,
        startTime = if (allDay) "" else start.format(CLOCK),
        endTime = if (allDay) "" else end.format(CLOCK),
        endDate = endDate.takeIf { it != startDate },
        recurrence = defaultRecurrence(startDate),
        taskStatus = if (defaultAsTask) "todo" else null,
        calendarIndex = calendarIndexOf(calendarIds, currentCalendarId),
    )
}

/** `buildPayload` : ce que la fiche écrirait, avant `mergeForSave`. Les clés absentes sont absentes. */
fun EventFormValues.buildPayload(now: () -> String = ::nowIso): JsonObject {
    val payload = LinkedHashMap<String, JsonElement>()
    payload["title"] = JsonPrimitive(title)
    reminders?.let { list -> payload["reminders"] = JsonArray(list.map { numberOf(it) }) }
    if (allDay) {
        payload["allDay"] = JsonPrimitive(true)
    } else {
        payload["allDay"] = JsonPrimitive(false)
        payload["startTime"] = JsonPrimitive(startTime)
        payload["endTime"] = JsonPrimitive(endTime)
    }
    if (isRecurring) {
        payload.putAll(recurrenceToEventFields(recurrence, date))
        // Sur une série, `completed` ne dit qu'une chose : que c'est une tâche.
        if (taskStatus != null) payload["completed"] = JsonPrimitive(false)
        completedDates?.let { payload["completedDates"] = JsonArray(it.map { d -> JsonPrimitive(d) }) }
        if (!skipDates.isNullOrEmpty()) payload["skipDates"] = JsonArray(skipDates.map { JsonPrimitive(it) })
    } else if (date.isNotEmpty()) {
        payload["type"] = JsonPrimitive("single")
        payload["date"] = JsonPrimitive(date)
        payload["endDate"] = endDate?.takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull
        completedFor(taskStatus, now)?.let { payload["completed"] = it }
        dueFor(taskStatus, due)?.let { payload["due"] = JsonPrimitive(it) }
    } else {
        payload["type"] = JsonPrimitive("someday")
        completedFor(taskStatus, now)?.let { payload["completed"] = it }
        dueFor(taskStatus, due)?.let { payload["due"] = JsonPrimitive(it) }
    }
    if (description.isNotEmpty()) payload["description"] = JsonPrimitive(description)
    if (location.isNotEmpty()) payload["location"] = JsonPrimitive(location)
    return JsonObject(payload)
}
