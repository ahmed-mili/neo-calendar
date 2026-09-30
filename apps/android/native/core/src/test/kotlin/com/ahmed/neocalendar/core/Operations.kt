package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.InvalidEventException
import com.ahmed.neocalendar.core.notes.serializeEventMarkdown
import com.ahmed.neocalendar.core.notes.filenameForEvent
import com.ahmed.neocalendar.core.notes.parseFrontmatter
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.notes.validateEvent
import com.ahmed.neocalendar.core.preferences.cloneFranceHolidaySource
import com.ahmed.neocalendar.core.preferences.defaultWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.deviceWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.isReminderMinutes
import com.ahmed.neocalendar.core.preferences.parseDeviceWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.reconcileWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.sharedWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.withDeviceWorkspacePreferences
import kotlinx.serialization.json.boolean
import com.ahmed.neocalendar.core.preferences.migrateLegacyIcalSources
import com.ahmed.neocalendar.core.preferences.normalizeIcsUrl
import com.ahmed.neocalendar.core.preferences.parseExternalCalendarSources
import com.ahmed.neocalendar.core.preferences.parseIcsFeeds
import com.ahmed.neocalendar.core.preferences.parseWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.prayerReminderMinutesFor
import com.ahmed.neocalendar.core.preferences.reminderListOf
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.recurrence.neoEventToDisplayEvents
import com.ahmed.neocalendar.core.reminders.buildReminders
import com.ahmed.neocalendar.core.reminders.prayerRemindersFor
import com.ahmed.neocalendar.core.reminders.relativeDelayLabel
import java.time.OffsetDateTime
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/** Le pendant Kotlin de conformance/operations.ts : mêmes noms d'opération. */
val OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf(
    "notes.frontmatter" to { input -> parseFrontmatter(input.getValue("text").jsonPrimitive.content) ?: JsonNull },
    "notes.filename" to { input -> filename(input) },
    "notes.validate" to { input -> validateEvent(input.getValue("raw").jsonObject)?.toRecord() ?: JsonNull },
    "notes.parse" to { input -> parseStored(input) },
    "notes.serialize" to { input -> serialize(input) },
    "preferences.icsUrl" to { input -> JsonPrimitive(normalizeIcsUrl(input.getValue("value").jsonPrimitive.content)) },
    "preferences.icsFeeds" to { input -> parseIcsFeeds(input["value"]) },
    "preferences.icsMigrate" to { input -> migrateLegacyIcalSources(input["value"]) },
    "preferences.externalSources" to { input -> parseExternalCalendarSources(input["value"]) },
    "preferences.franceHolidaySource" to { _ -> cloneFranceHolidaySource() },
    "preferences.defaults" to { _ -> defaultWorkspacePreferences() },
    "preferences.parse" to { input -> parseWorkspacePreferences(input["value"]) },
    "preferences.reminderList" to { input ->
        reminderListOf(input["value"])?.let { list -> JsonArray(list.map { JsonPrimitive(it) }) } ?: JsonNull
    },
    "preferences.isReminderMinutes" to { input -> JsonPrimitive(isReminderMinutes(input["value"])) },
    "preferences.shared" to { input -> sharedWorkspacePreferences(parseWorkspacePreferences(input["preferences"])) },
    "preferences.device" to { input -> deviceWorkspacePreferences(parseWorkspacePreferences(input["preferences"])) },
    "preferences.deviceParse" to { input -> parseDeviceWorkspacePreferences(input["value"]) },
    "preferences.withDevice" to { input ->
        withDeviceWorkspacePreferences(parseWorkspacePreferences(input["preferences"]), input.getValue("device").jsonObject)
    },
    "preferences.reconcile" to { input ->
        reconcileWorkspacePreferences(
            previous = input["previous"]?.takeUnless { it is JsonNull }?.let { parseWorkspacePreferences(it) },
            loaded = parseWorkspacePreferences(input["loaded"]),
            fileExisted = input.getValue("fileExisted").jsonPrimitive.boolean,
        )
    },
    "recurrence.expand" to { input -> expand(input) },
    "reminders.build" to { input -> reminders(input) },
    "reminders.prayer" to { input -> prayer(input) },
    "reminders.delayLabel" to { input -> JsonPrimitive(relativeDelayLabel(input.getValue("minutes").jsonPrimitive.double)) },
    "preferences.prayerReminder" to { input ->
        JsonArray(
            prayerReminderMinutesFor(input.getValue("settings").jsonObject, input.getValue("relativePath").jsonPrimitive.content)
                .map { JsonPrimitive(it) }
        )
    },
)

/** StoredEvent sans `contents` (écho inutile), `readOnly` et `icsFeedId` omis
 *  quand ils sont null : la forme que produit l'adaptateur TypeScript. */
private fun parseStored(input: JsonObject): JsonElement {
    val file = input.getValue("file").jsonObject
    fun field(name: String) = file.getValue(name).jsonPrimitive.content
    val known = input.getValue("knownCalendarIds").jsonArray.map { it.jsonPrimitive.content }.toSet()
    val stored = parseStoredEvent(
        EventFile(field("relativePath"), field("calendarPath"), field("fileName"), field("contents")),
        known,
    ) ?: return JsonNull

    val record = LinkedHashMap<String, JsonElement>()
    record["id"] = JsonPrimitive(stored.id)
    record["calendarId"] = JsonPrimitive(stored.calendarId)
    record["calendarPath"] = JsonPrimitive(stored.calendarPath)
    record["relativePath"] = JsonPrimitive(stored.relativePath)
    record["fileName"] = JsonPrimitive(stored.fileName)
    record["event"] = stored.event.toRecord()
    stored.readOnly?.let { record["readOnly"] = JsonPrimitive(it) }
    stored.icsFeedId?.let { record["icsFeedId"] = JsonPrimitive(it) }
    return JsonObject(record)
}

/** Le corpus ne donne que des évènements valides : on les passe par validateEvent
 *  comme le fait l'application avant de nommer un fichier. */
private fun filename(input: JsonObject): JsonElement {
    val event = validateEvent(input.getValue("event").jsonObject) ?: error("évènement invalide dans un cas notes.filename")
    return JsonPrimitive(filenameForEvent(event))
}

private fun serialize(input: JsonObject): JsonElement = try {
    val previous = input["previousContents"]?.jsonPrimitive?.content ?: ""
    JsonObject(mapOf("text" to JsonPrimitive(serializeEventMarkdown(input.getValue("event").jsonObject, previous))))
} catch (_: InvalidEventException) {
    JsonObject(mapOf("error" to JsonPrimitive("invalid")))
}

/** Les bornes du corpus sont des chaînes ISO avec décalage, lues comme `new Date(s)`. */
private fun expandEntry(input: JsonObject): List<DisplayEvent> {
    fun text(key: String) = input.getValue(key).jsonPrimitive.content
    val event = validateEvent(input.getValue("event").jsonObject) ?: error("évènement invalide dans un cas recurrence.expand")
    return neoEventToDisplayEvents(
        event,
        text("id"),
        text("calendarId"),
        text("calendarName"),
        text("color"),
        input.getValue("editable").jsonPrimitive.boolean,
        OffsetDateTime.parse(text("rangeStart")).toInstant(),
        OffsetDateTime.parse(text("rangeEnd")).toInstant(),
    )
}

private fun expand(input: JsonObject): JsonElement = JsonArray(expandEntry(input).map { it.toJson() })

/** Les entrées de `events` sont des entrées `recurrence.expand` : développées puis concaténées. */
private fun reminders(input: JsonObject): JsonElement {
    fun minutes(list: JsonElement) = list.jsonArray.map { it.jsonPrimitive.long }
    val events = input.getValue("events").jsonArray.flatMap { expandEntry(it.jsonObject) }
    val built = buildReminders(
        events = events,
        now = OffsetDateTime.parse(input.getValue("now").jsonPrimitive.content).toInstant(),
        minutesBefore = minutes(input.getValue("minutesBefore")),
        minutesByCalendar = input.getValue("minutesByCalendar").jsonObject.mapValues { minutes(it.value) },
        timeFormat24h = input.getValue("timeFormat24h").jsonPrimitive.boolean,
    )
    return JsonArray(built.map { it.toJson() })
}

private fun prayer(input: JsonObject): JsonElement {
    val built = prayerRemindersFor(
        timetable = input.getValue("timetable"),
        minutes = input.getValue("minutes").jsonArray.map { it.jsonPrimitive.long },
        now = OffsetDateTime.parse(input.getValue("now").jsonPrimitive.content).toInstant(),
        timeFormat24h = input.getValue("timeFormat24h").jsonPrimitive.boolean,
    )
    return JsonArray(built.map { it.toJson() })
}
