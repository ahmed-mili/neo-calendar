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
import com.ahmed.neocalendar.core.preferences.isReminderMinutes
import com.ahmed.neocalendar.core.preferences.migrateLegacyIcalSources
import com.ahmed.neocalendar.core.preferences.normalizeIcsUrl
import com.ahmed.neocalendar.core.preferences.parseExternalCalendarSources
import com.ahmed.neocalendar.core.preferences.parseIcsFeeds
import com.ahmed.neocalendar.core.preferences.parseWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.prayerReminderMinutesFor
import com.ahmed.neocalendar.core.preferences.reminderListOf
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

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
