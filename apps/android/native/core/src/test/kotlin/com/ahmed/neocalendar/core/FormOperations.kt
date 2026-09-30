package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.description.ChecklistLine
import com.ahmed.neocalendar.core.form.EventFormValues
import com.ahmed.neocalendar.core.form.buildPayload
import com.ahmed.neocalendar.core.form.formValuesOfDraft
import com.ahmed.neocalendar.core.form.formValuesOfEvent
import com.ahmed.neocalendar.core.notes.numberOf
import java.time.LocalDateTime
import com.ahmed.neocalendar.core.description.attachmentPathFor
import com.ahmed.neocalendar.core.description.readChecklist
import com.ahmed.neocalendar.core.description.readInlineLinks
import com.ahmed.neocalendar.core.description.toggleLine
import com.ahmed.neocalendar.core.location.geoUrlFor
import com.ahmed.neocalendar.core.location.locationDestinationFor
import com.ahmed.neocalendar.core.location.locationDestinationOf
import com.ahmed.neocalendar.core.location.mapsAppsFor
import com.ahmed.neocalendar.core.location.mapsUrlFor
import com.ahmed.neocalendar.core.location.toJson
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.mergeForSave
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.notes.validateEvent
import com.ahmed.neocalendar.core.recurrence.PresetKey
import com.ahmed.neocalendar.core.recurrence.RecurringEditChangeContext
import com.ahmed.neocalendar.core.recurrence.dayCodeOf
import com.ahmed.neocalendar.core.recurrence.defaultRecurrence
import com.ahmed.neocalendar.core.recurrence.detachedOccurrence
import com.ahmed.neocalendar.core.recurrence.eventToRecurrenceState
import com.ahmed.neocalendar.core.recurrence.matchPreset
import com.ahmed.neocalendar.core.recurrence.needsScopeChoice
import com.ahmed.neocalendar.core.recurrence.occurrenceDateOf
import com.ahmed.neocalendar.core.recurrence.occurrenceIsDone
import com.ahmed.neocalendar.core.recurrence.presetToRecurrence
import com.ahmed.neocalendar.core.recurrence.recurrenceStateOf
import com.ahmed.neocalendar.core.recurrence.recurrenceSummary
import com.ahmed.neocalendar.core.recurrence.recurrenceToEventFields
import com.ahmed.neocalendar.core.recurrence.recurrenceToRRule
import com.ahmed.neocalendar.core.recurrence.recurringEditChanges
import com.ahmed.neocalendar.core.recurrence.rruleToRecurrence
import com.ahmed.neocalendar.core.recurrence.seriesStartDate
import com.ahmed.neocalendar.core.recurrence.seriesWithoutOccurrence
import com.ahmed.neocalendar.core.recurrence.toJson
import com.ahmed.neocalendar.core.recurrence.withFollowingRemoved
import com.ahmed.neocalendar.core.recurrence.withOccurrenceRemoved
import com.ahmed.neocalendar.core.reminders.ReminderUnit
import com.ahmed.neocalendar.core.reminders.reminderLabelParts
import com.ahmed.neocalendar.core.reminders.reminderMinutesFrom
import com.ahmed.neocalendar.core.reminders.splitReminderDelay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Les opérations de la fiche d'évènement : répétition, portée d'une modification, rappels, lieu, description. */

private fun str(input: JsonObject, key: String): String = input.getValue(key).jsonPrimitive.content
private fun optStr(input: JsonObject, key: String): String? =
    input[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content

private fun validated(raw: JsonElement): NeoEvent =
    validateEvent(raw.jsonObject) ?: error("évènement invalide dans un cas du corpus")

private fun recordOrNull(event: NeoEvent?): JsonElement = event?.toRecord() ?: JsonNull

private fun optBool(input: JsonObject, key: String): Boolean? =
    input[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.boolean

internal val FORM_OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf(
    "recurrence.dayCode" to { input -> JsonPrimitive(dayCodeOf(str(input, "date"))) },
    "recurrence.default" to { input -> defaultRecurrence(str(input, "startDate")).toJson() },
    "recurrence.toRRule" to { input ->
        JsonPrimitive(recurrenceToRRule(recurrenceStateOf(input.getValue("state").jsonObject), str(input, "startDate")))
    },
    "recurrence.fromRRule" to { input -> rruleToRecurrence(str(input, "rrule"), str(input, "startDate")).toJson() },
    "recurrence.eventState" to { input ->
        val state = eventToRecurrenceState(input.getValue("event").jsonObject, str(input, "startDate"))
        JsonObject(mapOf("isRecurring" to JsonPrimitive(state.isRecurring), "recurrence" to state.recurrence.toJson()))
    },
    "recurrence.fields" to { input ->
        recurrenceToEventFields(recurrenceStateOf(input.getValue("state").jsonObject), str(input, "startDate"))
    },
    "recurrence.preset" to { input ->
        presetToRecurrence(PresetKey.entries.first { it.key == str(input, "key") }, str(input, "startDate")).toJson()
    },
    "recurrence.matchPreset" to { input ->
        JsonPrimitive(matchPreset(recurrenceStateOf(input.getValue("state").jsonObject), str(input, "startDate")).key)
    },
    "recurrence.summary" to { input -> JsonPrimitive(recurrenceSummary(recurrenceStateOf(input.getValue("state").jsonObject))) },
    "recurringEdit.occurrenceDate" to { input ->
        occurrenceDateOf(optStr(input, "displayId"))?.let { JsonPrimitive(it) } ?: JsonNull
    },
    "recurringEdit.needsScopeChoice" to { input ->
        JsonPrimitive(
            needsScopeChoice(
                input["event"]?.takeUnless { it is JsonNull }?.jsonObject,
                optStr(input, "eventId"),
                input.getValue("isDraft").jsonPrimitive.boolean,
            )
        )
    },
    "recurringEdit.detach" to { input ->
        val now = str(input, "now")
        detachedOccurrence(input.getValue("payload").jsonObject, str(input, "dateISO"), optBool(input, "done") ?: false) { now }
    },
    "recurringEdit.withoutOccurrence" to { input -> seriesWithoutOccurrence(input.getValue("series").jsonObject, str(input, "dateISO")) },
    "recurringEdit.occurrenceIsDone" to { input ->
        JsonPrimitive(occurrenceIsDone(input["series"]?.takeUnless { it is JsonNull }?.jsonObject, str(input, "dateISO")))
    },
    "recurringEdit.removeOccurrence" to { input ->
        withOccurrenceRemoved(validated(input.getValue("event")), str(input, "dateISO")).toRecord()
    },
    "recurringEdit.removeFollowing" to { input ->
        recordOrNull(withFollowingRemoved(validated(input.getValue("event")), str(input, "dateISO")))
    },
    "recurringEdit.seriesStart" to { input ->
        seriesStartDate(validated(input.getValue("event")))?.let { JsonPrimitive(it) } ?: JsonNull
    },
    "recurringEdit.changes" to { input ->
        val context = input["context"]?.takeUnless { it is JsonNull }?.jsonObject
        JsonArray(
            recurringEditChanges(
                input.getValue("stable").jsonObject,
                input.getValue("payload").jsonObject,
                RecurringEditChangeContext(
                    context?.let { optStr(it, "previousCalendarId") },
                    context?.let { optStr(it, "nextCalendarId") },
                    context?.let { optStr(it, "previousCalendarLabel") },
                    context?.let { optStr(it, "nextCalendarLabel") },
                ),
            ).map {
                JsonObject(
                    mapOf(
                        "key" to JsonPrimitive(it.key), "label" to JsonPrimitive(it.label),
                        "before" to JsonPrimitive(it.before), "after" to JsonPrimitive(it.after),
                    )
                )
            }
        )
    },
    "notes.mergeForSave" to { input -> mergeForSave(validated(input.getValue("base")), input.getValue("payload").jsonObject) },
    "reminders.choiceLabel" to { input ->
        val parts = reminderLabelParts(input.getValue("minutes").jsonPrimitive.double, input.getValue("allDay").jsonPrimitive.boolean)
        JsonObject(mapOf("amount" to JsonPrimitive(parts.amount), "suffix" to JsonPrimitive(parts.suffix)))
    },
    "reminders.splitDelay" to { input ->
        val delay = splitReminderDelay(input.getValue("minutes").jsonPrimitive.int)
        JsonObject(mapOf("amount" to JsonPrimitive(delay.amount), "unit" to JsonPrimitive(delay.unit.key)))
    },
    "reminders.minutesFrom" to { input ->
        JsonPrimitive(
            reminderMinutesFrom(
                input.getValue("amount").jsonPrimitive.double,
                ReminderUnit.entries.first { it.key == str(input, "unit") },
            )
        )
    },
    "location.destination" to { input ->
        locationDestinationFor(str(input, "location"), optStr(input, "geo"), optStr(input, "linkAddress"))?.toJson() ?: JsonNull
    },
    "location.apps" to { input ->
        JsonArray(
            mapsAppsFor(
                locationDestinationOf(input.getValue("destination").jsonObject),
                optBool(input, "native") ?: false,
                input["installed"]?.takeUnless { it is JsonNull }?.jsonArray?.map { it.jsonPrimitive.content },
            ).map { JsonPrimitive(it) }
        )
    },
    "location.mapsUrl" to { input ->
        mapsUrlFor(
            locationDestinationOf(input.getValue("destination").jsonObject),
            str(input, "app"),
            optStr(input, "travelMode") ?: "auto",
            optBool(input, "native") ?: false,
        )?.let { JsonPrimitive(it) } ?: JsonNull
    },
    "location.geoUrl" to { input ->
        geoUrlFor(locationDestinationOf(input.getValue("destination").jsonObject))?.let { JsonPrimitive(it) } ?: JsonNull
    },
    "description.checklist" to { input ->
        JsonArray(
            readChecklist(str(input, "description")).map { line ->
                when (line) {
                    is ChecklistLine.Text -> JsonObject(mapOf("kind" to JsonPrimitive("text"), "text" to JsonPrimitive(line.text)))
                    is ChecklistLine.Bullet -> JsonObject(
                        mapOf("kind" to JsonPrimitive("bullet"), "text" to JsonPrimitive(line.text), "indent" to JsonPrimitive(line.indent))
                    )
                    is ChecklistLine.Task -> JsonObject(
                        mapOf(
                            "kind" to JsonPrimitive("task"), "done" to JsonPrimitive(line.done),
                            "title" to JsonPrimitive(line.title), "indent" to JsonPrimitive(line.indent),
                        )
                    )
                }
            }
        )
    },
    "description.toggle" to { input -> JsonPrimitive(toggleLine(str(input, "description"), input.getValue("index").jsonPrimitive.int)) },
    "description.links" to { input ->
        JsonArray(
            readInlineLinks(str(input, "text")).map {
                JsonObject(
                    mapOf(
                        "start" to JsonPrimitive(it.start), "end" to JsonPrimitive(it.end),
                        "label" to JsonPrimitive(it.label), "target" to JsonPrimitive(it.target),
                    )
                )
            }
        )
    },
    "description.attachmentPath" to { input ->
        JsonPrimitive(attachmentPathFor(str(input, "eventRelativePath"), str(input, "target")))
    },
    "form.payload" to { input -> formPayload(input) },
)

private val INSTANT = Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$""")

/** L'instant d'écriture d'une tâche faite ne se compare pas, sa présence oui. */
private fun maskInstants(value: JsonElement): JsonElement = when {
    value is JsonPrimitive && value.isString && INSTANT.matches(value.content) -> JsonPrimitive("<horodatage>")
    value is JsonArray -> JsonArray(value.map { maskInstants(it) })
    value is JsonObject -> JsonObject(value.mapValues { maskInstants(it.value) })
    else -> value
}

/** JSON ne porte pas `undefined` : un modificateur l'écrit { "$undefined": true }. */
private fun JsonElement.revived(): JsonElement? =
    if (this is JsonObject && this["\$undefined"] != null) null else this

private fun applyEdit(values: EventFormValues, name: String, raw: JsonElement?): EventFormValues {
    fun text() = (raw as? JsonPrimitive)?.takeIf { it.isString }?.content
    fun flag() = (raw as JsonPrimitive).boolean
    return when (name) {
        "setTitle" -> values.copy(title = text().orEmpty())
        "setDescription" -> values.copy(description = text().orEmpty())
        "setLocation" -> values.copy(location = text().orEmpty())
        "setDate" -> values.copy(date = text().orEmpty())
        "setEndDate" -> values.copy(endDate = text())
        "setStartTime" -> values.copy(startTime = text().orEmpty())
        "setEndTime" -> values.copy(endTime = text().orEmpty())
        "setAllDay" -> values.copy(allDay = flag())
        "setIsRecurring" -> values.copy(isRecurring = flag())
        "setRecurrence" -> values.copy(recurrence = recurrenceStateOf(raw!!.jsonObject))
        "setCalendarIndex" -> values.copy(calendarIndex = (raw as JsonPrimitive).int)
        "setTaskStatus" -> values.copy(taskStatus = text())
        "setDue" -> values.copy(due = text())
        "setReminders" -> values.copy(reminders = (raw as? JsonArray)?.map { it.jsonPrimitive.double })
        else -> error("modificateur inconnu : $name")
    }
}

private fun formPayload(input: JsonObject): JsonElement {
    val calendars = input["calendars"]?.jsonArray?.map { it.jsonObject.getValue("id").jsonPrimitive.content }
        ?: listOf("cal")
    val currentId = optStr(input, "currentCalendarId") ?: calendars[0]
    val event = input["event"]?.takeUnless { it is JsonNull }?.let { validated(it) }
    val draft = input["draft"]?.takeUnless { it is JsonNull }?.jsonObject
    var values = when {
        event != null -> formValuesOfEvent(event, calendars, currentId)
        draft != null -> formValuesOfDraft(
            LocalDateTime.parse(str(draft, "start")),
            LocalDateTime.parse(str(draft, "end")),
            draft.getValue("allDay").jsonPrimitive.boolean,
            draft.getValue("defaultAsTask").jsonPrimitive.boolean,
            calendars,
            currentId,
        )
        else -> error("ni évènement ni ébauche")
    }
    for (edit in input["edits"]?.jsonArray.orEmpty()) {
        val pair = edit.jsonArray
        values = applyEdit(values, pair[0].jsonPrimitive.content, pair[1].revived())
    }
    val shown = LinkedHashMap<String, JsonElement>()
    shown["title"] = JsonPrimitive(values.title)
    shown["description"] = JsonPrimitive(values.description)
    shown["location"] = JsonPrimitive(values.location)
    shown["date"] = JsonPrimitive(values.date)
    values.endDate?.let { shown["endDate"] = JsonPrimitive(it) }
    shown["startTime"] = JsonPrimitive(values.startTime)
    shown["endTime"] = JsonPrimitive(values.endTime)
    shown["allDay"] = JsonPrimitive(values.allDay)
    shown["isRecurring"] = JsonPrimitive(values.isRecurring)
    // Sans date, la répétition par défaut part d'aujourd'hui : elle ne se compare pas.
    shown["recurrence"] = if (event is NeoEvent.Someday) JsonPrimitive("<auj>") else values.recurrence.toJson()
    shown["calendarIndex"] = JsonPrimitive(values.calendarIndex)
    shown["taskStatus"] = values.taskStatus?.let { JsonPrimitive(it) } ?: JsonNull
    shown["due"] = values.due?.let { JsonPrimitive(it) } ?: JsonNull
    values.reminders?.let { list -> shown["reminders"] = JsonArray(list.map { numberOf(it) }) }
    return maskInstants(JsonObject(mapOf("values" to JsonObject(shown), "payload" to values.buildPayload())))
}
