package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.InvalidEventException
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.calendarIdFromPath
import com.ahmed.neocalendar.core.notes.filenameForEvent
import com.ahmed.neocalendar.core.notes.mergeForSave
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.notes.serializeEventMarkdown
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.notes.validateEvent
import com.ahmed.neocalendar.core.recurrence.detachedOccurrence
import com.ahmed.neocalendar.core.recurrence.isSeries
import com.ahmed.neocalendar.core.recurrence.occurrenceIsDone
import com.ahmed.neocalendar.core.recurrence.seriesWithoutOccurrence
import com.ahmed.neocalendar.core.recurrence.withFollowingRemoved
import com.ahmed.neocalendar.core.recurrence.withOccurrenceRemoved
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Une note écrite : où elle est, ce qu'elle contient, et l'évènement tel que la validation l'a normalisé. */
data class WrittenEvent(val relativePath: String, val calendarPath: String, val contents: String, val event: NeoEvent)

/** Le calendrier refuse l'écriture (lien ICS, calendrier externe) : rien n'est touché. */
class ReadOnlyEventException : IllegalStateException("Ce calendrier est en lecture seule.")

/**
 * Les écritures de la fiche : ce que `persistEvent`, `addEvent`, `updateEvent`,
 * `duplicateEvent` et `applyRecurringDelete` de DesktopCalendar.tsx font des
 * notes. Le texte d'une note sort toujours de `serializeEventMarkdown`, avec le
 * contenu précédent du fichier ; le nom de `filenameForEvent`.
 */
class EventWriter(private val storage: WritableWorkspaceStorage) {

    /** `persistEvent` : valide, sérialise par-dessus le contenu précédent, écrit (et déplace au besoin). */
    private fun persist(
        record: JsonObject,
        calendarPath: String,
        previous: StoredEvent?,
        neverOverwrite: Boolean,
    ): WrittenEvent {
        val event = validateEvent(record) ?: throw InvalidEventException()
        return persist(event, calendarPath, previous, neverOverwrite)
    }

    private fun persist(event: NeoEvent, calendarPath: String, previous: StoredEvent?, neverOverwrite: Boolean): WrittenEvent {
        // Le fichier tel qu'il est MAINTENANT (le PC l'a peut-être modifié depuis l'ouverture de la fiche) :
        // corps et clés inconnues en viennent, et les champs que la fiche n'a pas touchés gardent sa valeur.
        var current = ""
        var effective = event
        if (previous != null) {
            val path = findPath(storage, previous.relativePath) ?: throw NoteMovedException()
            current = storage.readText(path) ?: throw NoteMovedException()
            if (current != previous.contents) effective = keepUntouchedFromFile(event, previous, current)
        }
        val contents = serializeEventMarkdown(effective, current)
        var fileName = filenameForEvent(event)
        // Une nouvelle note n'en écrase pas une autre qui porte le même nom : elle prend « nom (1).md ».
        // (Le Java et le TypeScript écrivent par-dessus ; ici une note d'Ahmed ne se perd pas en silence.)
        if (neverOverwrite && previous == null) {
            val dir = if (calendarPath.isEmpty()) "" else findPath(storage, calendarPath)
                ?: throw IllegalStateException("Calendrier introuvable: $calendarPath")
            fileName = uniqueName(storage, dir, validName(fileName, true))
        }
        val path = writeEvent(storage, calendarPath, fileName, previous?.relativePath.orEmpty(), contents)
        return WrittenEvent(path, calendarPath, contents, event)
    }

    /** Les champs identiques à l'instantané (non touchés par la fiche) prennent la valeur du fichier actuel. */
    private fun keepUntouchedFromFile(event: NeoEvent, snapshot: StoredEvent, current: String): NeoEvent {
        val file = parseStoredEvent(
            EventFile(snapshot.relativePath, snapshot.calendarPath, snapshot.fileName, current),
            setOf(calendarIdFromPath(snapshot.calendarPath)),
        ) ?: return event
        val form = event.toRecord()
        val old = snapshot.event.toRecord()
        val now = file.event.toRecord()
        val merged = LinkedHashMap<String, JsonElement>()
        for (key in (now.keys + form.keys)) {
            val value = if (form[key] == old[key]) now[key] else form[key]
            if (value != null) merged[key] = value
        }
        return validateEvent(JsonObject(merged)) ?: throw InvalidEventException()
    }

    private fun requireWritable(stored: StoredEvent) {
        if (stored.readOnly == true) throw ReadOnlyEventException()
    }

    private fun after(stored: StoredEvent, written: WrittenEvent) = stored.copy(
        relativePath = written.relativePath,
        calendarPath = written.calendarPath,
        fileName = written.relativePath.substringAfterLast('/'),
        contents = written.contents,
        event = written.event,
    )

    /** `addEvent` : une nouvelle note dans ce calendrier. */
    fun create(calendarPath: String, record: JsonObject): WrittenEvent = persist(record, calendarPath, null, neverOverwrite = true)

    /**
     * La série ou l'évènement modifié : le formulaire fusionné par-dessus la note
     * (`mergeForSave`). Un changement de calendrier déplace d'abord la note telle
     * qu'elle est, puis écrit la modification, comme le fait la fiche.
     */
    fun update(stored: StoredEvent, payload: JsonObject, targetCalendarPath: String): WrittenEvent {
        requireWritable(stored)
        var base = stored
        if (targetCalendarPath != stored.calendarPath) {
            base = after(stored, persist(stored.event, targetCalendarPath, stored, neverOverwrite = false))
        }
        return persist(mergeForSave(base.event, payload), base.calendarPath, base, neverOverwrite = false)
    }

    /**
     * « Cet évènement seulement » : le jour sort de la série et s'écrit comme un
     * évènement à part. La copie est écrite d'abord (un jour affiché deux fois vaut
     * mieux qu'un jour perdu), puis la série reçoit le jour dans `skipDates`.
     */
    fun detachOccurrence(
        stored: StoredEvent,
        payload: JsonObject,
        occurrenceDate: String,
        date: String,
        targetCalendarPath: String,
        now: () -> String,
    ): WrittenEvent {
        requireWritable(stored)
        // La série doit encore exister avant d'écrire la copie (sinon une copie sans série à mettre à jour).
        if (findPath(storage, stored.relativePath) == null) throw NoteMovedException()
        val done = occurrenceIsDone(stored.event.toRecord(), occurrenceDate)
        val single = detachedOccurrence(payload, date, done, now)
        val copy = create(targetCalendarPath, single)
        persist(seriesWithoutOccurrence(stored.event.toRecord(), occurrenceDate), stored.calendarPath, stored, neverOverwrite = false)
        return copy
    }

    /** Supprimer toute la note. */
    fun delete(stored: StoredEvent) {
        requireWritable(stored)
        deleteEvent(storage, stored.relativePath)
    }

    /** Supprimer un jour d'une série (`following` : ce jour et les suivants) ; rien ne reste = la note part. */
    fun deleteOccurrence(stored: StoredEvent, date: String, following: Boolean) {
        requireWritable(stored)
        if (!isSeries(stored.event)) {
            delete(stored)
            return
        }
        val next = if (following) withFollowingRemoved(stored.event, date) else withOccurrenceRemoved(stored.event, date)
        if (next == null) {
            delete(stored)
            return
        }
        persist(next, stored.calendarPath, stored, neverOverwrite = false)
    }

    /** `duplicateEvent` : une copie sans identifiant, dans le même calendrier. */
    fun duplicate(stored: StoredEvent, calendarPath: String): WrittenEvent {
        val record = stored.event.toRecord()
        return create(calendarPath, JsonObject(record.filterKeys { it != "id" }))
    }
}
