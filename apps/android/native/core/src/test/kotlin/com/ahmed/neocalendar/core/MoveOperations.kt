package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.grid.dayShiftFromAnchor
import com.ahmed.neocalendar.core.grid.movedSlot
import com.ahmed.neocalendar.core.grid.positionToDateTime
import com.ahmed.neocalendar.core.grid.rescheduledRecord
import com.ahmed.neocalendar.core.grid.resizedRecord
import com.ahmed.neocalendar.core.grid.snappedMinutes
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.notes.validateEvent
import com.ahmed.neocalendar.core.tasks.setOccurrenceStatus
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Les opérations du corpus pour les gestes de la grille (`grid/`, `tasks/`). */

private val ISO_MILLIS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

private fun instant(input: JsonObject, key: String): Instant = Instant.parse(input.getValue(key).jsonPrimitive.content)

private fun iso(instant: Instant): JsonElement = JsonPrimitive(ISO_MILLIS.format(instant))

/** Le fuseau du corpus (Europe/Paris), fixé par la tâche Gradle. */
private val zone: ZoneId get() = ZoneId.systemDefault()

private fun record(input: JsonObject): JsonObject = validateEvent(input.getValue("event").jsonObject)!!.toRecord()

private fun written(input: JsonObject, updated: JsonObject): JsonElement = JsonObject(
    mapOf(
        "ok" to JsonPrimitive(true),
        "updates" to JsonArray(
            listOf(JsonObject(mapOf("id" to input.getValue("eventId"), "event" to updated)))
        ),
    )
)

private fun dayPosition(input: JsonObject, key: String): Pair<Long, Double> {
    val position = input.getValue(key).jsonObject
    val day = Instant.parse(position.getValue("date").jsonPrimitive.content).atZone(zone).toLocalDate().toEpochDay()
    return day to position.getValue("fraction").jsonPrimitive.double
}

internal val MOVE_OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf(
    "grid.positionToDate" to { input ->
        val day = instant(input, "date").atZone(zone).toLocalDate()
        val snap = input["snap"]?.jsonPrimitive?.int ?: 15
        val at = positionToDateTime(input.getValue("y").jsonPrimitive.double, input.getValue("hourHeight").jsonPrimitive.double, day, snap)
        iso(at.atZone(zone).toInstant())
    },
    "grid.dayShift" to { input ->
        val (anchorDay, anchorFraction) = dayPosition(input, "anchor")
        val (day, fraction) = dayPosition(input, "current")
        JsonPrimitive(dayShiftFromAnchor(anchorDay, anchorFraction, day, fraction))
    },
    "grid.projectMove" to { input ->
        val minutes = snappedMinutes(input.getValue("deltaY").jsonPrimitive.double, input.getValue("hourHeight").jsonPrimitive.double)
        val slot = movedSlot(instant(input, "start"), instant(input, "end"), input.getValue("dayShift").jsonPrimitive.int, minutes, zone)
        JsonObject(mapOf("start" to iso(slot.start), "end" to iso(slot.end), "allDay" to JsonPrimitive(false)))
    },
    "grid.dragSingle" to { input -> written(input, rescheduledRecord(record(input), instant(input, "start"), instant(input, "end"), zone)) },
    "grid.resizeSingle" to { input -> written(input, resizedRecord(record(input), instant(input, "start"), instant(input, "end"), zone)) },
    "tasks.setOccurrenceStatus" to { input ->
        val event = validateEvent(input.getValue("event").jsonObject)!!
        setOccurrenceStatus(event, input.getValue("day").jsonPrimitive.content, input.getValue("complete").jsonPrimitive.boolean).toRecord()
    },
)
