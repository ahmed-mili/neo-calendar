package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.ics.EmptySnapshotException
import com.ahmed.neocalendar.core.ics.IcalNoteWrite
import com.ahmed.neocalendar.core.ics.IcsFeed
import com.ahmed.neocalendar.core.ics.IcsSyncState
import com.ahmed.neocalendar.core.ics.InvalidNowException
import com.ahmed.neocalendar.core.ics.availableIcalDirectoryName
import com.ahmed.neocalendar.core.ics.getEventsFromICS
import com.ahmed.neocalendar.core.ics.mergeRemoteEvents
import com.ahmed.neocalendar.core.ics.planIcalDirectoryAssignments
import com.ahmed.neocalendar.core.ics.planIcalNoteSync
import com.ahmed.neocalendar.core.ics.planIcsNoteSync
import com.ahmed.neocalendar.core.ics.preferredIcalDirectoryName
import com.ahmed.neocalendar.core.ics.scopedIcalEvent
import com.ahmed.neocalendar.core.ics.startOfLocalWeekIso
import com.ahmed.neocalendar.core.ics.occurrenceSignature
import com.ahmed.neocalendar.core.ics.parseIcsSnapshot
import com.ahmed.neocalendar.core.ics.dueIcsLinks
import com.ahmed.neocalendar.core.ics.icsLinkOf
import com.ahmed.neocalendar.core.ics.icsStatesFromJson
import com.ahmed.neocalendar.core.ics.icsSyncWindow
import com.ahmed.neocalendar.core.layout.ALLDAY_MAX_ROWS
import com.ahmed.neocalendar.core.layout.ALLDAY_ROW_HEIGHT
import com.ahmed.neocalendar.core.layout.ANDROID_HOUR_HEIGHT
import com.ahmed.neocalendar.core.layout.EVENT_VGAP
import com.ahmed.neocalendar.core.layout.LONG_MONTH_NAME
import com.ahmed.neocalendar.core.layout.MAX_HOUR_HEIGHT
import com.ahmed.neocalendar.core.layout.MIN_HOUR_HEIGHT
import com.ahmed.neocalendar.core.layout.OVERLAP_COL_GAP
import com.ahmed.neocalendar.core.layout.AllDayLaneBar
import com.ahmed.neocalendar.core.layout.GridEvent
import com.ahmed.neocalendar.core.layout.addDays
import com.ahmed.neocalendar.core.layout.allDayBandRows
import com.ahmed.neocalendar.core.layout.computeOverlapGroups
import com.ahmed.neocalendar.core.layout.hiddenBarCountByDay
import com.ahmed.neocalendar.core.layout.packAllDayLanes
import com.ahmed.neocalendar.core.layout.visibleLaneCount
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
import com.ahmed.neocalendar.core.notes.StoredEvent
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
import com.ahmed.neocalendar.core.preferences.preferencesFileText
import com.ahmed.neocalendar.core.preferences.reconcileWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.sharedPreferencesToWrite
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
import com.ahmed.neocalendar.core.widget.WidgetTheme
import com.ahmed.neocalendar.core.widget.buildWidgetPayload
import com.ahmed.neocalendar.core.reminders.prayerRemindersFor
import com.ahmed.neocalendar.core.reminders.relativeDelayLabel
import java.time.OffsetDateTime
import java.time.Instant
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
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/** Le pendant Kotlin de conformance/operations.ts : mêmes noms d'opération. */
val OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf<String, (JsonObject) -> JsonElement>(
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
    "preferences.write" to { input ->
        JsonObject(
            mapOf(
                "text" to JsonPrimitive(
                    preferencesFileText(sharedPreferencesToWrite(parseWorkspacePreferences(input["preferences"])))
                )
            )
        )
    },
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
    "widget.build" to { input -> widget(input) },
    "reminders.prayer" to { input -> prayer(input) },
    "reminders.delayLabel" to { input -> JsonPrimitive(relativeDelayLabel(input.getValue("minutes").jsonPrimitive.double)) },
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
    "layout.overlapGroups" to { input ->
        JsonArray(
            computeOverlapGroups(gridEvents(input.getValue("events").jsonArray)).map { group ->
                JsonObject(
                    mapOf(
                        "events" to JsonArray(
                            group.events.map {
                                JsonObject(
                                    mapOf(
                                        "id" to JsonPrimitive(it.event.id),
                                        "column" to JsonPrimitive(it.column.toLong()),
                                        "totalColumns" to JsonPrimitive(it.totalColumns.toLong()),
                                    )
                                )
                            }
                        )
                    )
                )
            }
        )
    },
    "layout.packAllDayLanes" to { input ->
        val arrival = input.getValue("arrival").jsonObject
        val result = packAllDayLanes(
            input["events"]?.takeUnless { it is JsonNull }?.let { gridEvents(it.jsonArray) },
            input.getValue("extendedDates").jsonArray.map { parseInstant(it.jsonPrimitive.content) },
            { event -> arrival[event.id]?.jsonPrimitive?.long ?: 0L },
        )
        JsonObject(
            mapOf(
                "bars" to JsonArray(
                    result.bars.map {
                        JsonObject(
                            mapOf(
                                "id" to JsonPrimitive(it.event.id),
                                "startIdx" to JsonPrimitive(it.startIdx.toLong()),
                                "span" to JsonPrimitive(it.span.toLong()),
                                "lane" to JsonPrimitive(it.lane.toLong()),
                            )
                        )
                    }
                ),
                "laneCount" to JsonPrimitive(result.laneCount.toLong()),
            )
        )
    },
    "layout.visibleLaneCount" to { input ->
        JsonPrimitive(
            visibleLaneCount(laneBars(input), input.getValue("firstVisibleIdx").jsonPrimitive.int, input.getValue("lastVisibleIdx").jsonPrimitive.int).toLong()
        )
    },
    "layout.hiddenBarCountByDay" to { input ->
        val counts = hiddenBarCountByDay(
            laneBars(input),
            input.getValue("firstVisibleIdx").jsonPrimitive.int,
            input.getValue("lastVisibleIdx").jsonPrimitive.int,
            input.getValue("visibleRows").jsonPrimitive.int,
        )
        JsonObject(counts.entries.associate { (idx, count) -> idx.toString() to JsonPrimitive(count.toLong()) })
    },
    "layout.allDayBandRows" to { input ->
        val rows = allDayBandRows(
            laneCount = input.getValue("laneCount").jsonPrimitive.int,
            draftLane = input["draftLane"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.int,
            collapsed = input["collapsed"]?.jsonPrimitive?.boolean ?: false,
            maxRows = input.getValue("maxRows").jsonPrimitive.int,
        )
        JsonObject(
            mapOf(
                "contentRows" to JsonPrimitive(rows.contentRows.toLong()),
                "visibleRows" to JsonPrimitive(rows.visibleRows.toLong()),
            )
        )
    },
    "ics.snapshot" to { input ->
        val window = input.getValue("window").jsonObject
        parseIcsSnapshot(
            input.getValue("text").jsonPrimitive.content,
            window.getValue("from").jsonPrimitive.content,
            window.getValue("to").jsonPrimitive.content,
        )
    },
    "ics.signature" to { input ->
        val event = validateEvent(input.getValue("event").jsonObject) ?: error("évènement invalide dans un cas ics.signature")
        occurrenceSignature(event)?.let { JsonPrimitive(it) } ?: JsonNull
    },
    "ics.events" to { input ->
        JsonArray(getEventsFromICS(input.getValue("text").jsonPrimitive.content).map { it.toRecord() })
    },
    "ics.directoryName" to { input -> JsonPrimitive(preferredIcalDirectoryName(input.getValue("name").jsonPrimitive.content)) },
    "ics.availableDirectoryName" to { input ->
        JsonPrimitive(
            availableIcalDirectoryName(
                input.getValue("preferred").jsonPrimitive.content,
                input.getValue("usedNames").jsonArray.map { it.jsonPrimitive.content }.toSet(),
            )
        )
    },
    "ics.directoryAssignments" to { input ->
        val plan = planIcalDirectoryAssignments(
            input.getValue("sources").jsonArray.map { it.jsonObject },
            input.getValue("existingFolderNames").jsonArray.map { it.jsonPrimitive.content },
        )
        JsonObject(
            mapOf(
                "sources" to JsonArray(plan.sources),
                "directoriesToCreate" to JsonArray(plan.directoriesToCreate.map { JsonPrimitive(it) }),
                "changed" to JsonPrimitive(plan.changed),
            )
        )
    },
    "ics.scopedEvent" to { input ->
        val source = input.getValue("source").jsonObject
        val event = validateEvent(input.getValue("event").jsonObject) ?: error("évènement invalide dans un cas ics.scopedEvent")
        scopedIcalEvent(source.getValue("id").jsonPrimitive.content, event, input.getValue("index").jsonPrimitive.int).toRecord()
    },
    "ics.planNoteSync" to { input ->
        val source = input.getValue("source").jsonObject
        val writes = planIcalNoteSync(
            source.getValue("id").jsonPrimitive.content,
            source.getValue("directory").jsonPrimitive.content,
            input.getValue("remoteEvents").jsonArray.map {
                validateEvent(it.jsonObject) ?: error("évènement invalide dans un cas ics.planNoteSync")
            },
            input.getValue("existingRecords").jsonArray.map { storedOf(it.jsonObject) },
        )
        JsonArray(writes.map { writeJson(it) })
    },
    "ics.startOfLocalWeek" to { input ->
        val now = parseInstantOrNull(input.getValue("now").jsonPrimitive.content)
        if (now == null) JsonObject(mapOf("error" to JsonPrimitive("invalid-now"))) else JsonPrimitive(startOfLocalWeekIso(now))
    },
    "ics.planSync" to { input -> planSync(input) },
    "ics.syncWindow" to { input ->
        val (from, to) = icsSyncWindow(parseInstant(input.getValue("now").jsonPrimitive.content))
        JsonObject(mapOf("from" to JsonPrimitive(from), "to" to JsonPrimitive(to)))
    },
    "ics.dueFeeds" to { input ->
        val links = input.getValue("feeds").jsonArray.map { icsLinkOf(it.jsonObject)!! }
        val states = icsStatesFromJson(input.getValue("states").toString())
        val forced = input["forcedIds"]?.takeUnless { it is JsonNull }?.jsonArray?.map { it.jsonPrimitive.content }?.toSet()
        val due = dueIcsLinks(
            links, states, parseInstant(input.getValue("now").jsonPrimitive.content),
            input.getValue("defaultMinutes").jsonPrimitive.int, forced,
        )
        JsonArray(due.map { JsonPrimitive(it.id) })
    },
    "ics.mergeRemote" to { input ->
        JsonArray(
            mergeRemoteEvents(
                input.getValue("current").jsonArray.map { it.jsonObject },
                input.getValue("refreshedCalendarIds").jsonArray.map { it.jsonPrimitive.content },
                input.getValue("arrived").jsonArray.map { it.jsonObject },
            ) { it.getValue("calendarId").jsonPrimitive.content }
        )
    },
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
) + FORM_OPERATIONS + MOVE_OPERATIONS + PRAYER_OPERATIONS

/** Une date d'entrée : chaîne ISO avec `Z` ou un décalage, comme `new Date(s)`. */
private fun parseInstant(text: String): Instant = OffsetDateTime.parse(text).toInstant()

/** `new Date(s)` qui échoue donne `Invalid Date` côté JS : ici, null. */
private fun parseInstantOrNull(text: String): Instant? = try {
    parseInstant(text)
} catch (_: java.time.DateTimeException) {
    null
}

private fun instant(input: JsonObject, key: String): Instant = parseInstant(input.getValue(key).jsonPrimitive.content)

/** Un évènement d'entrée ne porte que id, début et fin : les champs que lit la grille. */
private fun gridEvents(events: JsonArray): List<GridEvent> = events.map {
    val e = it.jsonObject
    GridEvent(
        e.getValue("id").jsonPrimitive.content,
        parseInstant(e.getValue("start").jsonPrimitive.content),
        parseInstant(e.getValue("end").jsonPrimitive.content),
    )
}

/** Les barres d'entrée ne portent que startIdx, span et lane ; leur évènement est neutre. */
private fun laneBars(input: JsonObject): List<AllDayLaneBar> = input.getValue("bars").jsonArray.map {
    val b = it.jsonObject
    AllDayLaneBar(
        GridEvent("", Instant.EPOCH, Instant.EPOCH),
        b.getValue("startIdx").jsonPrimitive.int,
        b.getValue("span").jsonPrimitive.int,
        b.getValue("lane").jsonPrimitive.int,
    )
}

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

/** Le corpus compare la forme du TypeScript : le lieu, ajout du natif, n'y figure pas (voir WidgetPayloadTest). */
private fun widget(input: JsonObject): JsonElement {
    fun theme(name: String) = input.getValue("theme").jsonObject.getValue(name).jsonPrimitive.content
    val built = buildWidgetPayload(
        events = input.getValue("events").jsonArray.flatMap { expandEntry(it.jsonObject) },
        now = OffsetDateTime.parse(input.getValue("now").jsonPrimitive.content).toInstant(),
        timeFormat24h = input.getValue("timeFormat24h").jsonPrimitive.boolean,
        theme = WidgetTheme(theme("surface"), theme("text"), theme("muted"), theme("accent")),
    )
    return built.toJson(withNativeFields = false)
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

/** Une note lue sur le disque : ses champs, plus son évènement brut à valider. */
private fun storedOf(record: JsonObject): StoredEvent {
    fun field(name: String) = record.getValue(name).jsonPrimitive.content
    return StoredEvent(
        id = field("id"),
        calendarId = field("calendarId"),
        calendarPath = field("calendarPath"),
        relativePath = field("relativePath"),
        fileName = field("fileName"),
        contents = field("contents"),
        event = validateEvent(record.getValue("event").jsonObject) ?: error("évènement invalide dans une note du corpus"),
    )
}

private fun writeJson(write: IcalNoteWrite): JsonObject {
    val record = LinkedHashMap<String, JsonElement>()
    record["event"] = write.event.toRecord()
    record["calendarId"] = JsonPrimitive(write.calendarId)
    record["calendarPath"] = JsonPrimitive(write.calendarPath)
    write.previousRelativePath?.let { record["previousRelativePath"] = JsonPrimitive(it) }
    write.previousEventId?.let { record["previousEventId"] = JsonPrimitive(it) }
    record["fileName"] = JsonPrimitive(write.fileName)
    record["contents"] = JsonPrimitive(write.contents)
    return JsonObject(record)
}

/** Une exception du planificateur devient { error } : le message n'est pas comparé. */
private fun planSync(input: JsonObject): JsonElement {
    val feed = input.getValue("feed").jsonObject
    val state = input.getValue("previousState").jsonObject
    return try {
        val plan = planIcsNoteSync(
            IcsFeed(
                id = feed.getValue("id").jsonPrimitive.content,
                calendarPath = feed.getValue("calendarPath").jsonPrimitive.content,
                directory = feed["directory"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
            ),
            input.getValue("snapshot").jsonObject,
            input.getValue("existingRecords").jsonArray.map { storedOf(it.jsonObject) },
            IcsSyncState(
                lastAttemptAt = null,
                lastSuccessAt = null,
                knownEventCount = state.getValue("knownEventCount").jsonPrimitive.long,
                missingCounts = state.getValue("missingCounts").jsonObject.mapValues { it.value.jsonPrimitive.long },
            ),
            parseInstantOrNull(input.getValue("now").jsonPrimitive.content),
        )
        JsonObject(
            mapOf(
                "writes" to JsonArray(plan.writes.map { writeJson(it) }),
                "deletes" to JsonArray(
                    plan.deletes.map {
                        JsonObject(mapOf("id" to JsonPrimitive(it.id), "relativePath" to JsonPrimitive(it.relativePath)))
                    }
                ),
                "nextState" to JsonObject(
                    mapOf(
                        "lastAttemptAt" to JsonPrimitive(plan.nextState.lastAttemptAt),
                        "lastSuccessAt" to JsonPrimitive(plan.nextState.lastSuccessAt),
                        "knownEventCount" to JsonPrimitive(plan.nextState.knownEventCount),
                        "missingCounts" to JsonObject(plan.nextState.missingCounts.mapValues { JsonPrimitive(it.value) }),
                    )
                ),
            )
        )
    } catch (_: EmptySnapshotException) {
        JsonObject(mapOf("error" to JsonPrimitive("empty-snapshot")))
    } catch (_: InvalidNowException) {
        JsonObject(mapOf("error" to JsonPrimitive("invalid-now")))
    }
}
