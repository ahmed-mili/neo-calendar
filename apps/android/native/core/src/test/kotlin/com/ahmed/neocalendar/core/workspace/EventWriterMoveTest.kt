package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private const val DENTIST = "---\ntitle: \"Dentiste\"\nallDay: false\nstartTime: \"09:00\"\nendTime: \"10:00\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\nmaCle: garde\n---\nCorps de la note\n"

private const val SERIES = "---\ntitle: \"Sport\"\nallDay: false\nstartTime: \"18:00\"\nendTime: \"19:00\"\ntype: \"rrule\"\nstartDate: \"2026-08-03\"\nrrule: \"RRULE:FREQ=WEEKLY;BYDAY=MO\"\nskipDates: []\ncompleted: false\nlocation: \"Salle 3\"\nreminders: [15]\n---\nCorps\n"

private const val TASK = "---\ntitle: \"Rapport\"\nallDay: false\nstartTime: \"09:00\"\nendTime: \"10:00\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\ncompleted: false\n---\nDetails\n"

/** Le nom que le noyau donne à une série hebdomadaire du lundi. */
private val SERIES_PATH = "Essai/" + com.ahmed.neocalendar.core.notes.filenameForEvent(
    com.ahmed.neocalendar.core.notes.validateEvent(
        kotlinx.serialization.json.Json.parseToJsonElement(
            """{"title":"Sport","allDay":false,"startTime":"18:00","endTime":"19:00","type":"rrule","startDate":"2026-08-03","rrule":"RRULE:FREQ=WEEKLY;BYDAY=MO","skipDates":[]}"""
        ) as kotlinx.serialization.json.JsonObject
    )!!
)

private val PARIS = ZoneId.of("Europe/Paris")

private fun at(local: String): Instant = java.time.LocalDateTime.parse(local).atZone(PARIS).toInstant()

private fun stored(path: String, text: String): StoredEvent {
    val calendar = path.substringBeforeLast('/', "")
    return parseStoredEvent(
        EventFile(path, calendar, path.substringAfterLast('/'), text),
        setOf("local::${calendar.ifEmpty { "." }}"),
    )!!
}

/** Déplacer, redimensionner, cocher, supprimer, dupliquer : les mêmes garde-fous que la fiche. */
class EventWriterMoveTest {
    private val now = { "2026-10-01T10:00:00.000Z" }
    private val dentistPath = "Essai/2026-08-12 Dentiste.md"

    private fun move(tree: MemoryTree, note: StoredEvent, id: String, start: String, end: String, resize: Boolean = false) =
        EventWriter(tree).reschedule(note, id, at(start), at(end), resize, PARIS, now)

    // ── Déplacer ────────────────────────────────────────────────────────────

    @Test fun movingANoteRewritesItsDateAndHoursAndRenamesTheFile() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        val written = move(tree, stored(dentistPath, DENTIST), "id", "2026-08-13T14:15", "2026-08-13T15:15")
        assertEquals("Essai/2026-08-13 Dentiste.md", written.relativePath)
        assertEquals(setOf("Essai/2026-08-13 Dentiste.md"), tree.files.keys)
        assertEquals(
            "---\ntitle: \"Dentiste\"\nallDay: false\nstartTime: \"14:15\"\nendTime: \"15:15\"\ntype: \"single\"\ndate: \"2026-08-13\"\nendDate: null\nmaCle: garde\n---\nCorps de la note\n",
            tree.files.getValue(written.relativePath),
        )
    }

    @Test fun movingPastMidnightWritesTheEndDate() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        val written = move(tree, stored(dentistPath, DENTIST), "id", "2026-08-12T23:30", "2026-08-13T00:30")
        val text = tree.files.getValue(written.relativePath)
        assertTrue(text, text.contains("startTime: \"23:30\"") && text.contains("endTime: \"00:30\"") && text.contains("endDate: \"2026-08-13\""))
    }

    @Test fun aBodyEditedOnThePcSurvivesAMove() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        val note = stored(dentistPath, DENTIST)
        tree.files[dentistPath] = DENTIST + "ligne du PC\n"
        val written = move(tree, note, "id", "2026-08-12T11:00", "2026-08-12T12:00")
        assertTrue(tree.files.getValue(written.relativePath).endsWith("Corps de la note\nligne du PC\n"))
    }

    @Test fun movingANoteDeletedElsewhereWritesNothing() {
        val tree = MemoryTree().dir("Essai")
        try {
            move(tree, stored(dentistPath, DENTIST), "id", "2026-08-13T14:15", "2026-08-13T15:15")
            fail()
        } catch (_: NoteMovedException) {
        }
        assertTrue(tree.files.isEmpty())
        assertTrue(tree.log.isEmpty())
    }

    @Test fun aReadOnlyNoteIsNeverMoved() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        try {
            move(tree, stored(dentistPath, DENTIST).copy(readOnly = true), "id", "2026-08-13T14:15", "2026-08-13T15:15")
            fail()
        } catch (_: ReadOnlyEventException) {
        }
        assertEquals(DENTIST, tree.files[dentistPath])
        assertTrue(tree.log.isEmpty())
    }

    // « Celui-ci seulement » : le jour sort de la série avec toute sa fiche, la série ne change que par skipDates.
    @Test fun movingOneDayOfASeriesLeavesTheSeriesAlone() {
        val tree = MemoryTree().file(SERIES_PATH, SERIES)
        val copy = move(tree, stored(SERIES_PATH, SERIES), "abc_2026-08-10", "2026-08-11T10:00", "2026-08-11T11:00")
        val single = tree.files.getValue(copy.relativePath)
        assertEquals("Essai/2026-08-11 Sport.md", copy.relativePath)
        assertTrue(single, single.contains("type: \"single\"") && single.contains("date: \"2026-08-11\""))
        assertTrue(single, single.contains("startTime: \"10:00\"") && single.contains("endTime: \"11:00\""))
        // La fiche de la série suit la copie : lieu et rappels ne se perdent pas.
        assertTrue(single, single.contains("location: \"Salle 3\"") && single.contains("reminders: [15]"))
        assertFalse(single, single.contains("rrule") || single.contains("skipDates") || single.contains("id:"))
        assertEquals(SERIES.replace("skipDates: []", "skipDates: [\"2026-08-10\"]"), tree.files.getValue(SERIES_PATH))
        assertEquals(listOf("create Essai/2026-08-11 Sport.md", "write Essai/2026-08-11 Sport.md", "write $SERIES_PATH"), tree.log)
    }

    @Test fun movingADayOfASeriesWhoseNoteIsGoneWritesNothing() {
        val tree = MemoryTree().dir("Essai")
        try {
            move(tree, stored(SERIES_PATH, SERIES), "abc_2026-08-10", "2026-08-11T10:00", "2026-08-11T11:00")
            fail()
        } catch (_: NoteMovedException) {
        }
        assertTrue(tree.files.isEmpty())
    }

    // ── Redimensionner ──────────────────────────────────────────────────────

    @Test fun resizingOnlyChangesTheHours() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        val written = move(tree, stored(dentistPath, DENTIST), "id", "2026-08-12T09:00", "2026-08-12T11:30", resize = true)
        assertEquals(dentistPath, written.relativePath)
        assertEquals(DENTIST.replace("endTime: \"10:00\"", "endTime: \"11:30\""), tree.files.getValue(dentistPath))
    }

    @Test fun resizingTheTopEdgeMovesTheStart() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        move(tree, stored(dentistPath, DENTIST), "id", "2026-08-12T08:15", "2026-08-12T10:00", resize = true)
        assertEquals(DENTIST.replace("startTime: \"09:00\"", "startTime: \"08:15\""), tree.files.getValue(dentistPath))
    }

    @Test fun resizingToMidnightWritesTheEndDate() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        move(tree, stored(dentistPath, DENTIST), "id", "2026-08-12T09:00", "2026-08-13T00:00", resize = true)
        val text = tree.files.getValue(dentistPath)
        assertTrue(text, text.contains("endTime: \"00:00\"") && text.contains("endDate: \"2026-08-13\""))
    }

    @Test fun resizingADayOfASeriesDetachesItOnItsOwnDate() {
        val tree = MemoryTree().file(SERIES_PATH, SERIES)
        val copy = move(tree, stored(SERIES_PATH, SERIES), "abc_2026-08-10", "2026-08-10T18:00", "2026-08-10T20:00", resize = true)
        val single = tree.files.getValue(copy.relativePath)
        assertTrue(single, single.contains("date: \"2026-08-10\"") && single.contains("endTime: \"20:00\""))
        assertTrue(tree.files.getValue(SERIES_PATH).contains("skipDates: [\"2026-08-10\"]"))
    }

    // ── Cocher ──────────────────────────────────────────────────────────────

    @Test fun tickingATaskStampsItsCompletion() {
        val path = "Essai/2026-08-12 Rapport.md"
        val tree = MemoryTree().file(path, TASK)
        EventWriter(tree).setTaskDone(stored(path, TASK), "id", true, now)
        assertEquals(TASK.replace("completed: false", "completed: \"2026-10-01T10:00:00.000Z\""), tree.files.getValue(path))
        val done = tree.files.getValue(path)
        EventWriter(tree).setTaskDone(stored(path, done), "id", false, now)
        assertEquals(TASK, tree.files.getValue(path))
    }

    @Test fun tickingADayOfATaskSeriesOnlyTouchesThatDay() {
        val tree = MemoryTree().file(SERIES_PATH, SERIES)
        EventWriter(tree).setTaskDone(stored(SERIES_PATH, SERIES), "abc_2026-08-17", true, now)
        val text = tree.files.getValue(SERIES_PATH)
        assertTrue(text, text.contains("completedDates: [\"2026-08-17\"]"))
        assertTrue(text, text.contains("skipDates: []") && text.contains("Salle 3"))
        EventWriter(tree).setTaskDone(stored(SERIES_PATH, text), "abc_2026-08-24", true, now)
        val both = tree.files.getValue(SERIES_PATH)
        assertTrue(both, both.contains("completedDates: [\"2026-08-17\",\"2026-08-24\"]"))
    }

    @Test fun anOrdinaryEventDoesNotBecomeATask() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        try {
            EventWriter(tree).setTaskDone(stored(dentistPath, DENTIST), "id", true, now)
            fail()
        } catch (_: IllegalArgumentException) {
        }
        assertEquals(DENTIST, tree.files[dentistPath])
    }

    // ── Supprimer ───────────────────────────────────────────────────────────

    @Test fun deletingANoteThatIsGoneIsAClearErrorAndTouchesNothingElse() {
        val other = DENTIST.replace("Dentiste", "Autre")
        val tree = MemoryTree().file("Essai/2026-08-12 Autre.md", other)
        try {
            EventWriter(tree).delete(stored(dentistPath, DENTIST))
            fail()
        } catch (e: NoteMovedException) {
            assertEquals("Cette note a été déplacée ou supprimée ailleurs. Rechargez et recommencez.", e.message)
        }
        assertEquals(setOf("Essai/2026-08-12 Autre.md"), tree.files.keys)
        assertTrue(tree.log.isEmpty())
    }

    // Un autre fichier a pris le nom de la note (Syncthing l'a renommée puis un autre a pris sa place) : il reste.
    @Test fun deletingNeverRemovesADifferentNoteAtTheSamePath() {
        val note = stored(dentistPath, DENTIST)
        val other = DENTIST.replace("Dentiste", "Autre")
        val tree = MemoryTree().file(dentistPath, other)
        try {
            EventWriter(tree).delete(note)
            fail()
        } catch (_: NoteMovedException) {
        }
        assertEquals(other, tree.files[dentistPath])
    }

    @Test fun deletingANoteEditedElsewhereStillRemovesIt() {
        val note = stored(dentistPath, DENTIST)
        val tree = MemoryTree().file(dentistPath, DENTIST + "ligne du PC\n")
        EventWriter(tree).delete(note)
        assertTrue(tree.files.isEmpty())
    }

    @Test fun deletingFromASubfolderRemovesThatFile() {
        val path = "Essai/Archives/2026-08-12 Dentiste.md"
        val tree = MemoryTree().file(path, DENTIST).file(dentistPath, DENTIST)
        EventWriter(tree).delete(stored(path, DENTIST).copy(calendarPath = "Essai"))
        assertEquals(setOf(dentistPath), tree.files.keys)
    }

    @Test fun deletingADayOfASeriesWhoseNoteIsGoneWritesNothing() {
        val tree = MemoryTree().dir("Essai")
        try {
            EventWriter(tree).deleteOccurrence(stored(SERIES_PATH, SERIES), "2026-08-17", following = false)
            fail()
        } catch (_: NoteMovedException) {
        }
        assertTrue(tree.files.isEmpty())
    }

    // ── Dupliquer ───────────────────────────────────────────────────────────

    @Test fun duplicatingANoteThatIsGoneIsAClearError() {
        val tree = MemoryTree().dir("Essai")
        try {
            EventWriter(tree).duplicate(stored(dentistPath, DENTIST), "Essai")
            fail()
        } catch (_: NoteMovedException) {
        }
        assertTrue(tree.files.isEmpty())
    }

    @Test fun duplicatingTwiceNeverOverwritesACopy() {
        val tree = MemoryTree().file(dentistPath, DENTIST)
        val first = EventWriter(tree).duplicate(stored(dentistPath, DENTIST), "Essai")
        val second = EventWriter(tree).duplicate(stored(dentistPath, DENTIST), "Essai")
        assertEquals("Essai/2026-08-12 Dentiste (1).md", first.relativePath)
        assertEquals("Essai/2026-08-12 Dentiste (2).md", second.relativePath)
        assertEquals(DENTIST, tree.files.getValue(dentistPath))
        assertEquals(3, tree.files.size)
    }
}
