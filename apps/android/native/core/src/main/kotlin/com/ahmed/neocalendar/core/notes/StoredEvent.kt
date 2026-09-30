package com.ahmed.neocalendar.core.notes

import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de calendarIdFromPath et parseStoredEvent (desktopEventFormat.ts) : une
 * note lue sur le disque, de son texte à l'évènement rangé dans son calendrier.
 */

data class EventFile(
    val relativePath: String,
    val calendarPath: String,
    val fileName: String,
    val contents: String,
)

data class StoredEvent(
    val id: String,
    val calendarId: String,
    val calendarPath: String,
    val relativePath: String,
    val fileName: String,
    val contents: String,
    val event: NeoEvent,
    val readOnly: Boolean? = null,
    val icsFeedId: String? = null,
)

fun calendarIdFromPath(relativePath: String): String =
    "local::${relativePath.ifEmpty { "." }}"

/** `fileName.replace(/\.md$/i, "")`. */
private fun markdownTitle(fileName: String): String = fileName.replace(Regex("""\.md\z""", RegexOption.IGNORE_CASE), "")

fun parseStoredEvent(file: EventFile, knownCalendarIds: Set<String>): StoredEvent? {
    val raw = parseFrontmatter(file.contents) ?: return null
    val parsed = validateEvent(raw) ?: return null

    val calendarId = calendarIdFromPath(file.calendarPath)
    if (calendarId !in knownCalendarIds) return null

    val event = parsed.withTitle(parsed.title.ifEmpty { markdownTitle(file.fileName) })
    val managed = managedMetadataFromMarkdown(file.contents)

    val eventId = event.id
    return StoredEvent(
        id = if (eventId != null && eventId.jsTrim().isNotEmpty()) eventId else "path:${file.relativePath}",
        calendarId = calendarId,
        calendarPath = file.calendarPath,
        relativePath = file.relativePath,
        fileName = file.fileName,
        contents = file.contents,
        event = event,
        readOnly = if (managed != null) true else null,
        icsFeedId = (managed?.get("neoIcsFeedId") as? JsonPrimitive)?.content,
    )
}
