package com.ahmed.neocalendar.core.recurrence

import com.ahmed.neocalendar.core.notes.numberOf
import java.time.Instant
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Port de `DisplayEvent` (src/ui/types.ts), sans les champs d'état d'interface
 * (`selected`, `visibilityState`) ni `isContinuation` / `labelStart`, que la
 * grille pose après coup et que `neoEventToDisplayEvents` ne produit jamais.
 */
data class DisplayEvent(
    val id: String,
    val title: String,
    val start: Instant,
    val end: Instant,
    val allDay: Boolean,
    val color: String,
    val editable: Boolean,
    val calendarId: String,
    val calendarName: String,
    val isTask: Boolean,
    /** `false` ou la date de fin (chaîne), comme `completed` dans le fichier. */
    val taskCompleted: JsonElement,
    /** « todo » ou « complete » ; null quand l'évènement n'est pas une tâche
     *  ponctuelle (le TypeScript y met `null` malgré son type). */
    val taskStatus: String?,
    val reminders: List<Double>?,
    val isRecurring: Boolean,
    val isSeriesStart: Boolean,
    val isMultiDay: Boolean,
    val isSomeday: Boolean,
    val description: String?,
    val location: String?,
) {
    /** `JSON.stringify` d'un DisplayEvent : les clés `undefined` sont omises. */
    fun toJson(): JsonObject {
        val record = LinkedHashMap<String, JsonElement>()
        record["id"] = JsonPrimitive(id)
        record["title"] = JsonPrimitive(title)
        record["start"] = JsonPrimitive(start.toIsoString())
        record["end"] = JsonPrimitive(end.toIsoString())
        record["allDay"] = JsonPrimitive(allDay)
        record["color"] = JsonPrimitive(color)
        record["editable"] = JsonPrimitive(editable)
        record["calendarId"] = JsonPrimitive(calendarId)
        record["calendarName"] = JsonPrimitive(calendarName)
        record["isTask"] = JsonPrimitive(isTask)
        record["taskCompleted"] = taskCompleted
        record["taskStatus"] = taskStatus?.let { JsonPrimitive(it) } ?: JsonNull
        reminders?.let { list -> record["reminders"] = JsonArray(list.map { numberOf(it) }) }
        record["isRecurring"] = JsonPrimitive(isRecurring)
        record["isSeriesStart"] = JsonPrimitive(isSeriesStart)
        record["isMultiDay"] = JsonPrimitive(isMultiDay)
        record["isSomeday"] = JsonPrimitive(isSomeday)
        description?.let { record["description"] = JsonPrimitive(it) }
        location?.let { record["location"] = JsonPrimitive(it) }
        return JsonObject(record)
    }
}
