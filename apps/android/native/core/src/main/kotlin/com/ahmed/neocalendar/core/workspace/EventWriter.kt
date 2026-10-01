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
import com.ahmed.neocalendar.core.grid.resizedRecord
import com.ahmed.neocalendar.core.grid.rescheduledRecord
import com.ahmed.neocalendar.core.grid.seriesOccurrenceRecord
import com.ahmed.neocalendar.core.tasks.isTask
import com.ahmed.neocalendar.core.tasks.setOccurrenceStatus
import com.ahmed.neocalendar.core.recurrence.detachedOccurrence
import com.ahmed.neocalendar.core.recurrence.isSeries
import com.ahmed.neocalendar.core.recurrence.occurrenceIsDone
import com.ahmed.neocalendar.core.recurrence.seriesStartDate
import com.ahmed.neocalendar.core.recurrence.withFollowingRemoved
import com.ahmed.neocalendar.core.recurrence.withOccurrenceRemoved
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

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

    /**
     * [dayChange] : un jour ajouté ou retiré de `skipDates` / `completedDates`. Il s'applique à la
     * liste du fichier tel qu'il est MAINTENANT, jamais à celle de l'instantané : un jour écarté ou
     * coché ailleurs entre-temps (PC, Syncthing) ne disparaît pas.
     */
    private fun persist(
        event: NeoEvent,
        calendarPath: String,
        previous: StoredEvent?,
        neverOverwrite: Boolean,
        dayChange: DayChange? = null,
    ): WrittenEvent {
        // Le fichier tel qu'il est MAINTENANT (le PC l'a peut-être modifié depuis l'ouverture de la fiche) :
        // corps et clés inconnues en viennent, et les champs que la fiche n'a pas touchés gardent sa valeur.
        var current = ""
        var effective = event
        if (previous != null) {
            val path = findPath(storage, previous.relativePath) ?: throw NoteMovedException()
            current = storage.readText(path) ?: throw NoteMovedException()
            if (current != previous.contents) effective = keepUntouchedFromFile(event, previous, current)
            if (dayChange != null) {
                val file = parseStoredEvent(
                    EventFile(previous.relativePath, previous.calendarPath, previous.fileName, current),
                    setOf(calendarIdFromPath(previous.calendarPath)),
                )?.event ?: throw NoteMovedException()
                if (!isSeries(file)) throw NoteMovedException()
                effective = dayChange.applyOnTopOf(file, effective)
            }
        }
        val contents = serializeEventMarkdown(effective, current)
        var fileName = filenameForEvent(effective)
        // Une note n'est renommée que si son nom voulu (titre, date) a changé : « Titre (1).md » dont le titre
        // ne bouge pas garde son nom, au lieu de recevoir « Titre (2).md » à chaque écriture.
        if (previous != null && filenameForEvent(previous.event) == fileName) {
            fileName = previous.relativePath.substringAfterLast('/')
        }
        // Une nouvelle note n'en écrase pas une autre qui porte le même nom : elle prend « nom (1).md ».
        // (Le Java et le TypeScript écrivent par-dessus ; ici une note d'Ahmed ne se perd pas en silence.)
        if (neverOverwrite && previous == null) {
            val dir = if (calendarPath.isEmpty()) "" else findPath(storage, calendarPath)
                ?: throw IllegalStateException("Calendrier introuvable: $calendarPath")
            fileName = uniqueName(storage, dir, validName(fileName, true))
        }
        val path = writeEvent(storage, calendarPath, fileName, previous?.relativePath.orEmpty(), contents)
        return WrittenEvent(path, calendarPath, contents, effective)
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
        endDate: String? = null,
    ): WrittenEvent {
        requireWritable(stored)
        requireDayStillInSeries(stored, occurrenceDate)
        val done = occurrenceIsDone(stored.event.toRecord(), occurrenceDate)
        val base = detachedOccurrence(payload, date, done, now)
        // Une fin le lendemain est une fin de date, comme pour un évènement ponctuel déplacé.
        val single = if (endDate != null && endDate > date) JsonObject(base + ("endDate" to JsonPrimitive(endDate))) else base
        val copy = create(targetCalendarPath, single)
        persist(
            withOccurrenceRemoved(stored.event, occurrenceDate), stored.calendarPath, stored, neverOverwrite = false,
            dayChange = DayChange.skip(occurrenceDate, add = true),
        )
        return copy
    }

    /**
     * La série doit encore être là, être la même, et ce jour doit encore en faire partie : sinon un
     * second geste (double appui, relance après une erreur) écrirait une seconde copie du même jour.
     */
    private fun requireDayStillInSeries(stored: StoredEvent, occurrenceDate: String) {
        val path = findPath(storage, stored.relativePath) ?: throw NoteMovedException()
        val current = storage.readText(path) ?: throw NoteMovedException()
        val file = parseStoredEvent(
            EventFile(stored.relativePath, stored.calendarPath, stored.fileName, current),
            setOf(calendarIdFromPath(stored.calendarPath)),
        )?.event ?: throw NoteMovedException()
        if (!isSeries(file)) throw NoteMovedException()
        val wanted = stored.event.id
        val same = if (!wanted.isNullOrBlank()) file.id == wanted else file.title == stored.event.title
        if (!same || occurrenceDate in DayChange.skipDatesOf(file)) throw NoteMovedException()
    }

    /**
     * Supprimer toute la note. Elle doit encore être là, et être la même : si
     * Syncthing l'a déplacée ou si un autre fichier a pris sa place, rien n'est
     * supprimé (NoteMovedException). Une note seulement modifiée ailleurs part.
     */
    fun delete(stored: StoredEvent) {
        requireWritable(stored)
        val path = findPath(storage, stored.relativePath) ?: throw NoteMovedException()
        val current = storage.readText(path) ?: throw NoteMovedException()
        if (current != stored.contents && !sameNote(stored, current)) throw NoteMovedException()
        deleteEvent(storage, stored.relativePath)
    }

    /** Le fichier modifié est-il encore la note de l'instantané ? Même identifiant ; sans identifiant, jamais. */
    private fun sameNote(snapshot: StoredEvent, current: String): Boolean {
        val file = parseStoredEvent(
            EventFile(snapshot.relativePath, snapshot.calendarPath, snapshot.fileName, current),
            setOf(calendarIdFromPath(snapshot.calendarPath)),
        ) ?: return false
        val wanted = snapshot.event.id
        // Sans identifiant, seul un contenu identique prouve que c'est la même note : ici il diffère.
        return !wanted.isNullOrBlank() && file.event.id == wanted
    }

    /** Supprimer un jour d'une série (`following` : ce jour et les suivants) ; rien ne reste = la note part. */
    fun deleteOccurrence(stored: StoredEvent, date: String, following: Boolean) {
        requireWritable(stored)
        if (!isSeries(stored.event)) {
            delete(stored)
            return
        }
        if (following) {
            // Un début de série incalculable n'est PAS « rien ne reste » : jamais la note entière pour une erreur de calcul.
            val start = seriesStartDate(stored.event)
                ?: throw IllegalStateException("Le début de la série est introuvable : rien n'a été supprimé.")
            if (start >= date) {
                delete(stored)
                return
            }
            val next = withFollowingRemoved(stored.event, date)
                ?: throw IllegalStateException("Ce jour est illisible : rien n'a été supprimé.")
            persist(next, stored.calendarPath, stored, neverOverwrite = false)
            return
        }
        persist(
            withOccurrenceRemoved(stored.event, date), stored.calendarPath, stored, neverOverwrite = false,
            dayChange = DayChange.skip(date, add = true),
        )
    }

    /** `duplicateEvent` : une copie sans identifiant, dans le même calendrier. La note copiée doit encore exister. */
    fun duplicate(stored: StoredEvent, calendarPath: String): WrittenEvent {
        if (findPath(storage, stored.relativePath) == null) throw NoteMovedException()
        val record = stored.event.toRecord()
        return create(calendarPath, JsonObject(record.filterKeys { it != "id" }))
    }

    /**
     * Déplacer ou redimensionner un évènement horodaté (`applyEventDrag`,
     * `applyEventResize`). Un évènement ponctuel est réécrit à ses nouvelles
     * heures ; un jour de série sort de la série (copie ponctuelle écrite
     * d'abord, puis le jour rejoint `skipDates`) : le reste de la série ne change pas.
     * [displayId] : l'identifiant affiché, celui d'un jour pour une série.
     */
    fun reschedule(
        stored: StoredEvent,
        displayId: String,
        start: java.time.Instant,
        end: java.time.Instant,
        resize: Boolean,
        zone: java.time.ZoneId,
        now: () -> String,
    ): WrittenEvent {
        requireWritable(stored)
        if (isSeries(stored.event)) {
            val day = com.ahmed.neocalendar.core.recurrence.occurrenceDateOf(displayId)
                ?: throw IllegalArgumentException("Ce jour de la série est introuvable.")
            val newDate = if (resize) day else start.atZone(zone).toLocalDate().toString()
            val endDate = end.atZone(zone).toLocalDate().toString()
            return detachOccurrence(stored, seriesOccurrenceRecord(stored.event, start, end, zone), day, newDate, stored.calendarPath, now, endDate)
        }
        val record = stored.event.toRecord()
        val next = if (resize) resizedRecord(record, start, end, zone) else rescheduledRecord(record, start, end, zone)
        val written = persist(next, stored.calendarPath, stored, neverOverwrite = false)
        return written
    }

    /**
     * Un évènement glissé vers ou depuis la bande « journée entière » : il change de drapeau, de date et d'heures
     * (`applyEventDrag`, `allDayOverride`). Un jour de série sort de la série comme dans [reschedule].
     */
    fun rescheduleToSlot(
        stored: StoredEvent,
        displayId: String,
        slot: com.ahmed.neocalendar.core.grid.DropSlot,
        zone: java.time.ZoneId,
        now: () -> String,
    ): WrittenEvent {
        requireWritable(stored)
        if (isSeries(stored.event)) {
            val day = com.ahmed.neocalendar.core.recurrence.occurrenceDateOf(displayId)
                ?: throw IllegalArgumentException("Ce jour de la série est introuvable.")
            val newDate = slot.start.atZone(zone).toLocalDate().toString()
            val record = com.ahmed.neocalendar.core.grid.seriesConvertedRecord(stored.event, slot, zone)
            return detachOccurrence(stored, record, day, newDate, stored.calendarPath, now, record["endDate"]?.let { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content })
        }
        if (stored.event !is NeoEvent.Single) throw IllegalArgumentException("Cet évènement ne se déplace pas ainsi.")
        return persist(com.ahmed.neocalendar.core.grid.convertedRecord(stored.event.toRecord(), slot, zone), stored.calendarPath, stored, neverOverwrite = false)
    }

    /** « Reconvertir les tâches horaires en évènements » : la note sans `completed` ni `due`, le reste inchangé. */
    fun convertToPlainEvent(stored: StoredEvent): WrittenEvent {
        requireWritable(stored)
        return persist(com.ahmed.neocalendar.core.tasks.plainEventRecord(stored.event), stored.calendarPath, stored, neverOverwrite = false)
    }

    /**
     * La case d'une tâche (`toggleTask`) : une tâche ponctuelle reçoit l'instant de
     * fin ou `false` ; une série coche ou décoche le jour affiché. Ce qui n'est pas
     * une tâche n'en devient pas une.
     */
    fun setTaskDone(stored: StoredEvent, displayId: String, done: Boolean, now: () -> String): WrittenEvent {
        requireWritable(stored)
        if (!isTask(stored.event)) throw IllegalArgumentException("Ce n'est pas une tâche.")
        if (isSeries(stored.event)) {
            val day = com.ahmed.neocalendar.core.recurrence.occurrenceDateOf(displayId)
                ?: throw IllegalArgumentException("Ce jour de la série est introuvable.")
            return persist(
                setOccurrenceStatus(stored.event, day, done), stored.calendarPath, stored, neverOverwrite = false,
                dayChange = DayChange.done(day, add = done),
            )
        }
        val next: JsonObject = run {
            val record = LinkedHashMap<String, JsonElement>(stored.event.toRecord())
            record["completed"] = if (done) kotlinx.serialization.json.JsonPrimitive(now()) else kotlinx.serialization.json.JsonPrimitive(false)
            JsonObject(record)
        }
        return persist(next, stored.calendarPath, stored, neverOverwrite = false)
    }
}

/** Un jour ajouté ou retiré d'une des deux listes de jours d'une série. */
private class DayChange private constructor(private val field: Field, private val day: String, private val add: Boolean) {
    private enum class Field { Skip, Done }

    /** La liste du fichier actuel [file], plus ou moins ce jour, remplace celle de [target] (l'évènement à écrire). */
    fun applyOnTopOf(file: NeoEvent, target: NeoEvent): NeoEvent {
        val base = (if (field == Field.Skip) skipDatesOf(file) else doneDatesOf(file)).toMutableList()
        if (add) { if (day !in base) base += day } else base -= day
        val list = if (field == Field.Skip) base else base.toSet().sorted()
        return when (target) {
            is NeoEvent.Recurring -> if (field == Field.Skip) target.copy(skipDates = list) else target.copy(completedDates = list)
            is NeoEvent.Rrule -> if (field == Field.Skip) target.copy(skipDates = list) else target.copy(completedDates = list)
            else -> target
        }
    }

    companion object {
        fun skip(day: String, add: Boolean) = DayChange(Field.Skip, day, add)
        fun done(day: String, add: Boolean) = DayChange(Field.Done, day, add)

        fun skipDatesOf(event: NeoEvent): List<String> = when (event) {
            is NeoEvent.Recurring -> event.skipDates
            is NeoEvent.Rrule -> event.skipDates
            else -> emptyList()
        }

        fun doneDatesOf(event: NeoEvent): List<String> = when (event) {
            is NeoEvent.Recurring -> event.completedDates.orEmpty()
            is NeoEvent.Rrule -> event.completedDates.orEmpty()
            else -> emptyList()
        }
    }
}
