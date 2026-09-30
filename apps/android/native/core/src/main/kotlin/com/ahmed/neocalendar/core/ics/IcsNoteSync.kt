package com.ahmed.neocalendar.core.ics

import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.calendarIdFromPath
import com.ahmed.neocalendar.core.notes.filenameForEvent
import com.ahmed.neocalendar.core.notes.jsTrim
import com.ahmed.neocalendar.core.notes.managedMetadataFromMarkdown
import com.ahmed.neocalendar.core.notes.serializeEventMarkdown
import com.ahmed.neocalendar.core.notes.serializeManagedEventMarkdown
import com.ahmed.neocalendar.core.notes.validateEvent
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/*
 * Port de apps/windows/src/platform/icalNoteSync.ts : les noms de dossier d'un
 * abonnement, l'écriture des notes d'un flux, et le planificateur de
 * synchronisation d'un lien ICS (écritures et suppressions prudentes).
 */

// --- noms de dossier ---------------------------------------------------------

private fun String.lc(): String = lowercase(Locale.ROOT)

private val FORBIDDEN_NAME_CHARS = Regex("""[<>:"/\\|?*\u0000-\u001f]""")

/** `\s` de JavaScript : plus large que celui de Java (espace insécable, U+FEFF...). */
private val JS_SPACES = Regex("""[\t\n\u000B\u000C\r    -     　﻿]+""")
private val TRAILING_DOTS_AND_SPACES = Regex("""[. ]+\z""")
private val RESERVED_NAME = Regex("""^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\z)""", RegexOption.IGNORE_CASE)

/** Nom de dossier sûr sous Windows pour le nom d'affichage d'un abonnement. */
fun preferredIcalDirectoryName(name: String): String {
    val cleaned = name
        .replace(FORBIDDEN_NAME_CHARS, "-")
        .replace(JS_SPACES, " ")
        .jsTrim()
        .replace(TRAILING_DOTS_AND_SPACES, "")
    val safe = if (cleaned.isNotEmpty() && cleaned != "." && cleaned != "..") cleaned else "iCalendar"
    return if (RESERVED_NAME.containsMatchIn(safe)) "$safe Calendar" else safe
}

/** Un dossier libre : la première collision reçoit « (ICS) », les suivantes un numéro. */
fun availableIcalDirectoryName(preferred: String, usedNames: Set<String>): String {
    val base = preferredIcalDirectoryName(preferred)
    if (base.lc() !in usedNames) return base

    val withKind = "$base (ICS)"
    if (withKind.lc() !in usedNames) return withKind

    var suffix = 2
    while (true) {
        val candidate = "$base (ICS $suffix)"
        if (candidate.lc() !in usedNames) return candidate
        suffix += 1
    }
}

data class IcalDirectoryPlan(
    val sources: List<JsonObject>,
    val directoriesToCreate: List<String>,
    val changed: Boolean,
)

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.content

/** Un dossier par abonnement iCalendar ; deux flux ne partagent jamais le même. */
fun planIcalDirectoryAssignments(sources: List<JsonObject>, existingFolderNames: List<String>): IcalDirectoryPlan {
    val physical = existingFolderNames.map { it.lc() }.toSet()
    val claimed = LinkedHashSet<String>()
    val directoriesToCreate = ArrayList<String>()
    var changed = false

    val nextSources = sources.map { source ->
        if (source.string("type") != "ical") return@map source

        val current = source.string("directory")
        val configured = current?.takeIf { it.jsTrim().isNotEmpty() }?.let { preferredIcalDirectoryName(it) }
        var directory = configured

        if (directory == null || directory.lc() in claimed) {
            directory = availableIcalDirectoryName(source.string("name") ?: "", physical + claimed)
        }

        val key = directory.lc()
        claimed.add(key)
        if (key !in physical && directory !in directoriesToCreate) directoriesToCreate.add(directory)

        if (current != directory) changed = true
        if (current == directory) source else JsonObject(LinkedHashMap(source).also { it["directory"] = JsonPrimitive(directory) })
    }

    return IcalDirectoryPlan(nextSources, directoriesToCreate, changed)
}

// --- écriture des notes d'un abonnement ---------------------------------------

data class IcalNoteWrite(
    val event: NeoEvent,
    val calendarId: String,
    val calendarPath: String,
    val previousRelativePath: String?,
    val previousEventId: String?,
    val fileName: String,
    val contents: String,
)

/** Le même évènement sous un autre identifiant. */
fun NeoEvent.withId(id: String?): NeoEvent = when (this) {
    is NeoEvent.Single -> copy(id = id)
    is NeoEvent.Recurring -> copy(id = id)
    is NeoEvent.Rrule -> copy(id = id)
    is NeoEvent.Someday -> copy(id = id)
}

private fun externalIcalId(sourceId: String) = "ical::$sourceId"

/** L'espace de noms d'un flux : deux flux peuvent réutiliser le même UID. */
fun scopedIcalEvent(sourceId: String, event: NeoEvent, index: Int): NeoEvent {
    val id = event.id
    val rawId = if (id != null && id.jsTrim().isNotEmpty()) id.jsTrim() else "event-$index"
    val prefix = "${externalIcalId(sourceId)}::"
    return event.withId(if (rawId.startsWith(prefix)) rawId else "$prefix$rawId")
}

/** Un flux -> notes Markdown, sans jamais supprimer : un flux glissant oublie ses vieux VEVENT. */
fun planIcalNoteSync(
    sourceId: String,
    directory: String,
    remoteEvents: List<NeoEvent>,
    existingRecords: List<StoredEvent>,
): List<IcalNoteWrite> {
    val calendarId = externalIcalId(sourceId)
    val existingById = LinkedHashMap<String, StoredEvent>()
    for (record in existingRecords) if (record.calendarPath == directory) existingById[record.id] = record

    return remoteEvents.withIndex().mapNotNull { (index, remote) ->
        val event = scopedIcalEvent(sourceId, remote, index)
        val previous = existingById[event.id!!]
        val contents = serializeEventMarkdown(event, previous?.contents ?: "")
        if (previous != null && contents == previous.contents) return@mapNotNull null
        IcalNoteWrite(
            event = event,
            calendarId = calendarId,
            calendarPath = directory,
            previousRelativePath = previous?.relativePath,
            previousEventId = null,
            fileName = previous?.fileName ?: filenameForEvent(event),
            contents = contents,
        )
    }
}

// --- planificateur d'un lien ICS -----------------------------------------------

data class IcsFeed(val id: String, val calendarPath: String, val directory: String?)

data class IcsSyncState(
    val lastAttemptAt: String?,
    val lastSuccessAt: String?,
    val knownEventCount: Long,
    val missingCounts: Map<String, Long>,
)

data class IcsSyncPlan(val writes: List<IcalNoteWrite>, val deletes: List<StoredEvent>, val nextState: IcsSyncState)

/** Un flux qui avait des évènements n'en rend soudain plus aucun, pas même une annulation. */
class EmptySnapshotException : IllegalStateException(
    "The ICS snapshot is unexpectedly empty: a previously populated feed returned no occurrence and no cancellation."
)

/** Un instant que JavaScript lirait comme `Invalid Date` : aucun plan, donc aucune suppression. */
class InvalidNowException : IllegalStateException("Cannot compute the current week's Monday from an invalid Date.")

private val ISO_MILLIS: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

/** Le lundi 00h00 de la semaine locale de l'appareil, en date ISO. */
fun startOfLocalWeekIso(now: Instant): String =
    now.atZone(ZoneId.systemDefault()).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString()

private fun occurrenceKeyOf(uid: String, recurrenceId: String?): String =
    if (recurrenceId == null) uid else "$uid::$recurrenceId"

/** Le prochain « <nom>.md » libre : choisi au planning, pas à l'écriture (les écritures sont concurrentes). */
private fun reserveFileName(preferred: String, taken: MutableSet<String>): String {
    fun claim(name: String): String {
        taken.add(name.lc())
        return name
    }
    if (preferred.lc() !in taken) return claim(preferred)

    val dot = preferred.lastIndexOf('.')
    val stem = if (dot > 0) preferred.substring(0, dot) else preferred
    val extension = if (dot > 0) preferred.substring(dot) else ""
    var suffix = 1
    while (true) {
        val candidate = "$stem ($suffix)$extension"
        if (candidate.lc() !in taken) return claim(candidate)
        suffix += 1
    }
}

private class SnapshotOccurrence(val key: String, val uid: String, val recurrenceId: String?, val event: NeoEvent)

/**
 * `snapshot` a la forme que rend parseIcsSnapshot (events, cancelledKeys,
 * latestOccurrenceDate). `now` null est un instant invalide : le plan est refusé.
 */
fun planIcsNoteSync(
    feed: IcsFeed,
    snapshot: JsonObject,
    existingRecords: List<StoredEvent>,
    previousState: IcsSyncState,
    now: Instant?,
): IcsSyncPlan {
    val events = snapshot.getValue("events").jsonArray.map {
        val o = it.jsonObject
        SnapshotOccurrence(
            key = o.getValue("key").jsonPrimitive.content,
            uid = o.getValue("uid").jsonPrimitive.content,
            recurrenceId = o["recurrenceId"]?.takeIf { r -> r !is JsonNull }?.jsonPrimitive?.content,
            event = validateEvent(o.getValue("event").jsonObject) ?: error("évènement invalide dans l'instantané"),
        )
    }
    val cancelledKeys = snapshot.getValue("cancelledKeys").jsonArray.map { it.jsonPrimitive.content }.toSet()
    val latestOccurrenceDate = snapshot["latestOccurrenceDate"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content

    if (events.isEmpty() && cancelledKeys.isEmpty() && previousState.knownEventCount > 0) throw EmptySnapshotException()
    if (now == null) throw InvalidNowException()

    val nowIso = ISO_MILLIS.format(now)
    val monday = startOfLocalWeekIso(now)
    val calendarId = calendarIdFromPath(feed.calendarPath)
    val writeDirectory = feed.directory ?: feed.calendarPath
    val present = events.associateBy { it.key }

    val owned = LinkedHashMap<String, StoredEvent>()
    val ownedBySignature = LinkedHashMap<String, StoredEvent>()
    for (record in existingRecords) {
        val metadata = managedMetadataFromMarkdown(record.contents) ?: continue
        if (metadata.getValue("neoIcsFeedId").jsonPrimitive.content != feed.id) continue
        val uid = metadata.getValue("neoIcsUid").jsonPrimitive.content
        val recurrenceId = metadata.getValue("neoIcsRecurrenceId").takeIf { it !is JsonNull }?.jsonPrimitive?.content
        owned[occurrenceKeyOf(uid, recurrenceId)] = record
        occurrenceSignature(record.event)?.let { ownedBySignature[it] = record }
    }

    val takenFileNames = HashSet<String>()
    for (record in existingRecords) {
        if (record.calendarPath != writeDirectory) continue
        takenFileNames.add(record.fileName.lc())
    }

    val claimedRecordIds = HashSet<String>()
    fun claim(occurrence: SnapshotOccurrence): StoredEvent? {
        val signature = occurrenceSignature(occurrence.event)
        for (candidate in listOf(owned[occurrence.key], signature?.let { ownedBySignature[it] })) {
            if (candidate == null || candidate.id in claimedRecordIds) continue
            claimedRecordIds.add(candidate.id)
            return candidate
        }
        return null
    }

    val writes = ArrayList<IcalNoteWrite>()
    for (occurrence in events) {
        val previous = claim(occurrence)
        val event = occurrence.event.withId("neo-calendar:ics::${feed.id}::${occurrence.key}")
        val contents = serializeManagedEventMarkdown(
            event, feed.id, occurrence.uid, occurrence.recurrenceId, previous?.contents ?: "",
        )
        val misplaced = previous != null && !previous.relativePath.startsWith("$writeDirectory/")
        if (previous != null && !misplaced && contents == previous.contents) continue
        writes.add(
            IcalNoteWrite(
                event = event,
                calendarId = calendarId,
                calendarPath = writeDirectory,
                previousRelativePath = previous?.relativePath,
                previousEventId = if (previous != null && previous.id != event.id) previous.id else null,
                fileName = previous?.fileName ?: reserveFileName(filenameForEvent(event), takenFileNames),
                contents = contents,
            )
        )
    }

    val deletes = ArrayList<StoredEvent>()
    val missingCounts = LinkedHashMap<String, Long>()
    for ((key, record) in owned) {
        if (key in present) continue
        if (record.id in claimedRecordIds) continue

        val recordEvent = record.event
        val occurrenceDate = if (recordEvent is NeoEvent.Single) recordEvent.date else ""
        if (occurrenceDate < monday) continue

        val cancelled = key in cancelledKeys
        val misses = if (cancelled) 0L else (previousState.missingCounts[key] ?: 0L) + 1
        if (misses > 0) missingCounts[key] = misses

        val coverageProven = latestOccurrenceDate != null && latestOccurrenceDate > occurrenceDate
        if (cancelled || (misses >= 2 && coverageProven)) {
            deletes.add(record)
            missingCounts.remove(key)
        }
    }

    return IcsSyncPlan(
        writes,
        deletes,
        IcsSyncState(nowIso, nowIso, events.size.toLong(), missingCounts),
    )
}

// --- fusion d'un abonnement distant (mergeRemoteEvents.ts) ----------------------

/** Remplace les évènements des abonnements rafraîchis, et rien d'autre. */
fun <T> mergeRemoteEvents(
    current: List<T>,
    refreshedCalendarIds: Iterable<String>,
    arrived: List<T>,
    calendarIdOf: (T) -> String,
): List<T> {
    val refreshed = refreshedCalendarIds.toSet()
    return current.filter { calendarIdOf(it) !in refreshed } + arrived
}
