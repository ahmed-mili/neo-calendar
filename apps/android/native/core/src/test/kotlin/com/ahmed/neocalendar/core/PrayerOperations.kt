package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.description.DescriptionFormatCommand
import com.ahmed.neocalendar.core.description.appendMarkdownToDescription
import com.ahmed.neocalendar.core.description.applyDescriptionFormat
import com.ahmed.neocalendar.core.description.labelFor
import com.ahmed.neocalendar.core.description.markdownLinkForAttachment
import com.ahmed.neocalendar.core.description.sameTarget
import com.ahmed.neocalendar.core.description.urlMarkdown
import com.ahmed.neocalendar.core.prayer.PrayerTimetable
import com.ahmed.neocalendar.core.prayer.isPrayerCalendarName
import com.ahmed.neocalendar.core.prayer.jumuaChoices
import com.ahmed.neocalendar.core.prayer.nextPrayer
import com.ahmed.neocalendar.core.prayer.parsePrayerTimetables
import com.ahmed.neocalendar.core.prayer.prayerLinesFor
import com.ahmed.neocalendar.core.prayer.prayersOn
import com.ahmed.neocalendar.core.prayer.withJumua
import java.time.LocalDate
import java.time.LocalDateTime
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Les opérations du corpus pour les horaires de prière (`prayer/`) et l'écriture de la description (`description/`). */

private fun tableOf(element: JsonElement?): PrayerTimetable? =
    if (element == null || element is JsonNull) null else parsePrayerTimetables(JsonArray(listOf(element)).toString()).single()

private fun numberOf(value: Double): JsonElement =
    if (value == Math.rint(value)) JsonPrimitive(value.toLong()) else JsonPrimitive(value)

internal val PRAYER_OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf(
    "prayer.calendarName" to { input -> JsonPrimitive(isPrayerCalendarName(input.getValue("name").jsonPrimitive.content)) },
    "prayer.on" to { input ->
        val table = withJumua(tableOf(input["timetable"])!!, input["jumua"]?.takeIf { it !is JsonNull }?.jsonArray?.map { it.jsonPrimitive.content })
        JsonArray(
            prayersOn(table, LocalDate.parse(input.getValue("date").jsonPrimitive.content)).map {
                JsonObject(mapOf("name" to JsonPrimitive(it.name.key), "minutes" to JsonPrimitive(it.minutes)))
            },
        )
    },
    "prayer.next" to { input ->
        val next = nextPrayer(tableOf(input["timetable"])!!, LocalDateTime.parse(input.getValue("now").jsonPrimitive.content))
        if (next == null) JsonNull else JsonObject(
            mapOf("name" to JsonPrimitive(next.name.key), "minutes" to JsonPrimitive(next.minutes), "date" to JsonPrimitive(next.date.toString())),
        )
    },
    "prayer.lines" to { input ->
        val lines = prayerLinesFor(
            tableOf(input["timetable"]),
            LocalDateTime.parse(input.getValue("now").jsonPrimitive.content),
            input.getValue("showAll").jsonPrimitive.boolean,
        )
        JsonArray(
            lines.map {
                JsonObject(
                    mapOf(
                        "date" to JsonPrimitive(it.date.toString()),
                        "hours" to numberOf(it.hours),
                        "minutes" to JsonPrimitive(it.minutes),
                        "next" to JsonPrimitive(it.next),
                        "name" to JsonPrimitive(it.name.key),
                    ),
                )
            },
        )
    },
    "prayer.jumuaChoices" to { input ->
        val tables = input.getValue("timetables").jsonArray.map { tableOf(it)!! }
        JsonArray(
            jumuaChoices(tables).map {
                JsonObject(mapOf("time" to JsonPrimitive(it.time), "mosques" to JsonArray(it.mosques.map { m -> JsonPrimitive(m) })))
            },
        )
    },
    "description.format" to { input ->
        val result = applyDescriptionFormat(
            input.getValue("text").jsonPrimitive.content,
            input.getValue("start").jsonPrimitive.int,
            input.getValue("end").jsonPrimitive.int,
            DescriptionFormatCommand.of(input.getValue("command").jsonPrimitive.content),
        )
        JsonObject(
            mapOf(
                "text" to JsonPrimitive(result.text),
                "selectionStart" to JsonPrimitive(result.selectionStart),
                "selectionEnd" to JsonPrimitive(result.selectionEnd),
            ),
        )
    },
    "description.urlMarkdown" to { input -> urlMarkdown(input.getValue("value").jsonPrimitive.content)?.let { JsonPrimitive(it) } ?: JsonNull },
    "description.labelFor" to { input -> JsonPrimitive(labelFor(input.getValue("target").jsonPrimitive.content)) },
    "description.sameTarget" to { input ->
        JsonPrimitive(sameTarget(input.getValue("a").jsonPrimitive.content, input.getValue("b").jsonPrimitive.content))
    },
    "description.attachmentLink" to { input ->
        JsonPrimitive(markdownLinkForAttachment(input.getValue("fileName").jsonPrimitive.content, input.getValue("markdownPath").jsonPrimitive.content))
    },
    "description.append" to { input ->
        JsonPrimitive(appendMarkdownToDescription(input.getValue("description").jsonPrimitive.content, input.getValue("markdown").jsonPrimitive.content))
    },
)
