package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.filenameForEvent
import com.ahmed.neocalendar.core.notes.parseFrontmatter
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.notes.validateEvent
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
    "notes.filename" to { input -> JsonPrimitive(filenameForEvent(input.getValue("event").jsonObject)) },
    "notes.validate" to { input -> validateEvent(input.getValue("raw").jsonObject)?.toRecord() ?: JsonNull },
    "notes.parse" to { input -> parseStored(input) },
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
