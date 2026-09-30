package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.layout.ALLDAY_MAX_ROWS
import com.ahmed.neocalendar.core.layout.ALLDAY_ROW_HEIGHT
import com.ahmed.neocalendar.core.layout.ANDROID_HOUR_HEIGHT
import com.ahmed.neocalendar.core.layout.EVENT_VGAP
import com.ahmed.neocalendar.core.layout.LONG_MONTH_NAME
import com.ahmed.neocalendar.core.layout.MAX_HOUR_HEIGHT
import com.ahmed.neocalendar.core.layout.MIN_HOUR_HEIGHT
import com.ahmed.neocalendar.core.layout.OVERLAP_COL_GAP
import com.ahmed.neocalendar.core.layout.addDays
import com.ahmed.neocalendar.core.layout.clampHourHeight
import com.ahmed.neocalendar.core.layout.endOfDay
import com.ahmed.neocalendar.core.layout.eventDurationHours
import com.ahmed.neocalendar.core.layout.eventTopHours
import com.ahmed.neocalendar.core.layout.getISOWeek
import com.ahmed.neocalendar.core.layout.getWeekDays
import com.ahmed.neocalendar.core.layout.getWeekStart
import com.ahmed.neocalendar.core.layout.isMultiDayTimed
import com.ahmed.neocalendar.core.layout.isSameDay
import com.ahmed.neocalendar.core.layout.needsCompactMonthType
import com.ahmed.neocalendar.core.layout.startOfDay
import com.ahmed.neocalendar.core.layout.todayBadgeState
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
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
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
    "preferences.prayerReminder" to { input ->
        JsonArray(
            prayerReminderMinutesFor(input.getValue("settings").jsonObject, input.getValue("relativePath").jsonPrimitive.content)
                .map { JsonPrimitive(it) }
        )
    },
    "layout.startOfDay" to { input -> iso(startOfDay(instant(input, "date"))) },
    "layout.endOfDay" to { input -> iso(endOfDay(instant(input, "date"))) },
    "layout.addDays" to { input -> iso(addDays(instant(input, "date"), input.getValue("days").jsonPrimitive.long)) },
    "layout.isSameDay" to { input -> JsonPrimitive(isSameDay(instant(input, "a"), instant(input, "b"))) },
    "layout.getWeekStart" to { input ->
        // firstDay absent : la valeur par défaut du TypeScript (dimanche).
        val firstDay = input["firstDay"]?.jsonPrimitive?.int ?: 0
        iso(getWeekStart(instant(input, "date"), firstDay))
    },
    "layout.getWeekDays" to { input -> JsonArray(getWeekDays(instant(input, "weekStart")).map { iso(it) }) },
    "layout.getISOWeek" to { input -> JsonPrimitive(getISOWeek(instant(input, "date"))) },
    "layout.todayBadgeState" to { input ->
        val visible = input.getValue("visibleDates").jsonArray.map { parseInstant(it.jsonPrimitive.content) }
        JsonPrimitive(todayBadgeState(visible, instant(input, "now")).value)
    },
    "layout.eventTopHours" to { input -> number(eventTopHours(instant(input, "start"), instant(input, "dayStart"))) },
    "layout.eventDurationHours" to { input -> number(eventDurationHours(instant(input, "start"), instant(input, "end"))) },
    "layout.isMultiDayTimed" to { input ->
        JsonPrimitive(
            isMultiDayTimed(instant(input, "start"), instant(input, "end"), input.getValue("allDay").jsonPrimitive.boolean)
        )
    },
    "layout.needsCompactMonthType" to { input ->
        JsonPrimitive(needsCompactMonthType(input.getValue("monthName").jsonPrimitive.content))
    },
    "layout.clampHourHeight" to { input -> number(clampHourHeight(input.getValue("px").jsonPrimitive.double)) },
    "layout.constants" to { _ ->
        JsonObject(
            mapOf(
                "MIN_HOUR_HEIGHT" to JsonPrimitive(MIN_HOUR_HEIGHT.toLong()),
                "MAX_HOUR_HEIGHT" to JsonPrimitive(MAX_HOUR_HEIGHT.toLong()),
                "ANDROID_HOUR_HEIGHT" to JsonPrimitive(ANDROID_HOUR_HEIGHT.toLong()),
                "ALLDAY_ROW_HEIGHT" to JsonPrimitive(ALLDAY_ROW_HEIGHT.toLong()),
                "ALLDAY_MAX_ROWS" to JsonPrimitive(ALLDAY_MAX_ROWS.toLong()),
                "OVERLAP_COL_GAP" to JsonPrimitive(OVERLAP_COL_GAP.toLong()),
                "EVENT_VGAP" to JsonPrimitive(EVENT_VGAP.toLong()),
                "LONG_MONTH_NAME" to JsonPrimitive(LONG_MONTH_NAME.toLong()),
            )
        )
    },
)

/** Une date d'entrée : chaîne ISO avec `Z` ou un décalage, comme `new Date(s)`. */
private fun parseInstant(text: String): Instant = OffsetDateTime.parse(text).toInstant()

private fun instant(input: JsonObject, key: String): Instant = parseInstant(input.getValue(key).jsonPrimitive.content)

private val ISO_MILLIS: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

/** Le format de `Date.prototype.toISOString()` : UTC, millisecondes, `Z`. */
private fun iso(instant: Instant): JsonElement = JsonPrimitive(ISO_MILLIS.format(instant))

/** Une valeur entière s'écrit `9`, jamais `9.0` : c'est la forme que JSON.stringify donne. */
private fun number(value: Double): JsonElement =
    if (value == Math.floor(value) && Math.abs(value) < 9.007199254740992E15) JsonPrimitive(value.toLong()) else JsonPrimitive(value)

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
