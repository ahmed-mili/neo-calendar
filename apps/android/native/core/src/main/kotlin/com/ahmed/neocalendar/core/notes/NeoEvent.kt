package com.ahmed.neocalendar.core.notes

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/*
 * Port de src/types/schema.ts (zod : CommonSchema, TimeSchema, EventSchema et
 * parseEvent). Validation explicite, champ par champ, sans bibliothèque : zod
 * retire les clés inconnues, pose les défauts et rejette le reste, et
 * `toRecord` rend les clés dans l'ordre de sa sortie (commun, temps, variante).
 */

/** `completed` et `due` tiennent trois états que zod distingue : clé absente
 *  (null ici), `null` (JsonNull), et une valeur (chaîne, ou `false` pour
 *  completed). D'où JsonElement? plutôt qu'un String?. */
sealed interface NeoEvent {
    val title: String
    val id: String?
    val location: String?
    val geo: String?
    val description: String?
    val attendees: List<String>?
    val subtasks: List<String>?
    val reminders: List<Double>?
    val allDay: Boolean
    val startTime: String?
    val endTime: String?

    data class Single(
        override val title: String,
        override val id: String? = null,
        override val location: String? = null,
        override val geo: String? = null,
        override val description: String? = null,
        override val attendees: List<String>? = null,
        override val subtasks: List<String>? = null,
        override val reminders: List<Double>? = null,
        override val allDay: Boolean,
        override val startTime: String? = null,
        override val endTime: String? = null,
        val date: String,
        val endDate: String? = null,
        val completed: JsonElement? = null,
        val due: JsonElement? = null,
    ) : NeoEvent

    data class Recurring(
        override val title: String,
        override val id: String? = null,
        override val location: String? = null,
        override val geo: String? = null,
        override val description: String? = null,
        override val attendees: List<String>? = null,
        override val subtasks: List<String>? = null,
        override val reminders: List<Double>? = null,
        override val allDay: Boolean,
        override val startTime: String? = null,
        override val endTime: String? = null,
        val daysOfWeek: List<String>,
        val completed: JsonElement? = null,
        val completedDates: List<String>? = null,
        val startRecur: String? = null,
        val endRecur: String? = null,
        val skipDates: List<String> = emptyList(),
    ) : NeoEvent

    data class Rrule(
        override val title: String,
        override val id: String? = null,
        override val location: String? = null,
        override val geo: String? = null,
        override val description: String? = null,
        override val attendees: List<String>? = null,
        override val subtasks: List<String>? = null,
        override val reminders: List<Double>? = null,
        override val allDay: Boolean,
        override val startTime: String? = null,
        override val endTime: String? = null,
        val startDate: String,
        val rrule: String,
        val skipDates: List<String>,
        val completed: JsonElement? = null,
        val completedDates: List<String>? = null,
    ) : NeoEvent

    data class Someday(
        override val title: String,
        override val id: String? = null,
        override val location: String? = null,
        override val geo: String? = null,
        override val description: String? = null,
        override val attendees: List<String>? = null,
        override val subtasks: List<String>? = null,
        override val reminders: List<Double>? = null,
        val completed: JsonElement? = null,
        val due: JsonElement? = null,
    ) : NeoEvent {
        override val allDay: Boolean get() = true
        override val startTime: String? get() = null
        override val endTime: String? get() = null
    }
}

/** Le même évènement sous un autre titre (parseStoredEvent en pose un). */
fun NeoEvent.withTitle(title: String): NeoEvent = when (this) {
    is NeoEvent.Single -> copy(title = title)
    is NeoEvent.Recurring -> copy(title = title)
    is NeoEvent.Rrule -> copy(title = title)
    is NeoEvent.Someday -> copy(title = title)
}

/** Levée par les lecteurs de champ : ce que zod rejetterait. */
private class Invalid : Exception(null, null, false, false)

private val DAYS = setOf("U", "M", "T", "W", "R", "F", "S")

private fun JsonPrimitive.isText(): Boolean = this !is JsonNull && isString

private fun text(value: JsonElement): String =
    if (value is JsonPrimitive && value.isText()) value.content else throw Invalid()

private fun reqString(raw: JsonObject, key: String): String = text(raw[key] ?: throw Invalid())

private fun optString(raw: JsonObject, key: String): String? = raw[key]?.let { text(it) }

private fun stringList(value: JsonElement): List<String> {
    if (value !is JsonArray) throw Invalid()
    return value.map { text(it) }
}

private fun optStringList(raw: JsonObject, key: String): List<String>? = raw[key]?.let { stringList(it) }

private fun optNumberList(raw: JsonObject, key: String): List<Double>? {
    val value = raw[key] ?: return null
    if (value !is JsonArray) throw Invalid()
    return value.map {
        if (it !is JsonPrimitive || it is JsonNull || it.isString || it.booleanOrNull != null) throw Invalid()
        it.doubleOrNull ?: throw Invalid()
    }
}

/** `ParsedDate.nullable().default(null)` : absent ou null donne null. */
private fun nullableString(raw: JsonObject, key: String): String? {
    val value = raw[key] ?: return null
    return if (value is JsonNull) null else text(value)
}

/** `ParsedDate.or(false).or("in-progress").or(null).optional()`. */
private fun readCompleted(raw: JsonObject): JsonElement? {
    val value = raw["completed"] ?: return null
    if (value is JsonNull) return value
    if (value is JsonPrimitive && value.isString) return value
    if (value is JsonPrimitive && value.booleanOrNull == false) return value
    throw Invalid()
}

/** `ParsedDate.or(null).optional()`. */
private fun readDue(raw: JsonObject): JsonElement? {
    val value = raw["due"] ?: return null
    if (value is JsonNull) return value
    text(value)
    return value
}

private fun readDaysOfWeek(raw: JsonObject): List<String> {
    val days = stringList(raw["daysOfWeek"] ?: throw Invalid())
    if (days.any { it !in DAYS }) throw Invalid()
    return days
}

/** La variante de `raw`, celle de `parseEvent` : `single` par défaut. */
private fun readType(raw: JsonObject): String {
    val value = raw["type"] ?: return "single"
    return text(value)
}

/** `validateEvent` : l'évènement normalisé, ou null là où zod lèverait. */
fun validateEvent(raw: JsonObject): NeoEvent? = try {
    readEvent(raw)
} catch (_: Invalid) {
    null
}

private fun readEvent(raw: JsonObject): NeoEvent {
    val title = reqString(raw, "title")
    val id = optString(raw, "id")
    val location = optString(raw, "location")
    val geo = optString(raw, "geo")
    val description = optString(raw, "description")
    val attendees = optStringList(raw, "attendees")
    val subtasks = optStringList(raw, "subtasks")
    val reminders = optNumberList(raw, "reminders")

    val type = readType(raw)
    if (type == "someday") {
        // Sans date ni heure : allDay forcé, la facette temps n'est pas lue.
        return NeoEvent.Someday(
            title, id, location, geo, description, attendees, subtasks, reminders,
            completed = readCompleted(raw), due = readDue(raw),
        )
    }

    val allDayValue = raw["allDay"] ?: JsonPrimitive(false)
    val allDay = (allDayValue as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: throw Invalid()
    val startTime = if (allDay) null else reqString(raw, "startTime")
    val endTime = if (allDay) null else nullableString(raw, "endTime")

    return when (type) {
        "single" -> NeoEvent.Single(
            title, id, location, geo, description, attendees, subtasks, reminders,
            allDay, startTime, endTime,
            date = reqString(raw, "date"),
            endDate = nullableString(raw, "endDate"),
            completed = readCompleted(raw),
            due = readDue(raw),
        )
        "recurring" -> NeoEvent.Recurring(
            title, id, location, geo, description, attendees, subtasks, reminders,
            allDay, startTime, endTime,
            daysOfWeek = readDaysOfWeek(raw),
            completed = readCompleted(raw),
            completedDates = optStringList(raw, "completedDates"),
            startRecur = optString(raw, "startRecur"),
            endRecur = optString(raw, "endRecur"),
            skipDates = optStringList(raw, "skipDates") ?: emptyList(),
        )
        "rrule" -> NeoEvent.Rrule(
            title, id, location, geo, description, attendees, subtasks, reminders,
            allDay, startTime, endTime,
            startDate = reqString(raw, "startDate"),
            rrule = reqString(raw, "rrule"),
            skipDates = stringList(raw["skipDates"] ?: throw Invalid()),
            completed = readCompleted(raw),
            completedDates = optStringList(raw, "completedDates"),
        )
        else -> throw Invalid()
    }
}

/** L'évènement en objet JSON, clés dans l'ORDRE de la sortie zod : champs
 *  communs, temps, puis variante. Les clés absentes sont omises. */
fun NeoEvent.toRecord(): JsonObject {
    val record = LinkedHashMap<String, JsonElement>()
    fun put(key: String, value: String?) { if (value != null) record[key] = JsonPrimitive(value) }
    fun put(key: String, value: List<String>?) {
        if (value != null) record[key] = JsonArray(value.map { JsonPrimitive(it) })
    }
    fun put(key: String, value: JsonElement?) { if (value != null) record[key] = value }

    record["title"] = JsonPrimitive(title)
    put("id", id)
    put("location", location)
    put("geo", geo)
    put("description", description)
    put("attendees", attendees)
    put("subtasks", subtasks)
    reminders?.let { list -> record["reminders"] = JsonArray(list.map { numberOf(it) }) }

    record["allDay"] = JsonPrimitive(allDay)
    if (!allDay) {
        record["startTime"] = JsonPrimitive(startTime)
        record["endTime"] = endTime?.let { JsonPrimitive(it) } ?: JsonNull
    }

    when (this) {
        is NeoEvent.Single -> {
            record["type"] = JsonPrimitive("single")
            record["date"] = JsonPrimitive(date)
            record["endDate"] = endDate?.let { JsonPrimitive(it) } ?: JsonNull
            put("completed", completed)
            put("due", due)
        }
        is NeoEvent.Recurring -> {
            record["type"] = JsonPrimitive("recurring")
            put("daysOfWeek", daysOfWeek)
            put("completed", completed)
            put("completedDates", completedDates)
            put("startRecur", startRecur)
            put("endRecur", endRecur)
            put("skipDates", skipDates)
        }
        is NeoEvent.Rrule -> {
            record["type"] = JsonPrimitive("rrule")
            put("startDate", startDate)
            put("rrule", rrule)
            put("skipDates", skipDates)
            put("completed", completed)
            put("completedDates", completedDates)
        }
        is NeoEvent.Someday -> {
            record["type"] = JsonPrimitive("someday")
            put("completed", completed)
            put("due", due)
        }
    }
    return JsonObject(record)
}
