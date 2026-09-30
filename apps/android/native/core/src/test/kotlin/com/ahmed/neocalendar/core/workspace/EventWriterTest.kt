package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private fun json(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

private const val DENTIST = "---\ntitle: \"Dentiste\"\nallDay: false\nstartTime: \"09:00\"\nendTime: \"10:00\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\nmaCle: garde\n---\nCorps de la note\n"

private const val SERIES = "---\ntitle: \"Sport\"\nallDay: false\nstartTime: \"18:00\"\nendTime: \"19:00\"\ntype: \"rrule\"\nstartDate: \"2026-08-03\"\nrrule: \"RRULE:FREQ=WEEKLY;BYDAY=MO\"\nskipDates: []\ncompleted: false\n---\nCorps\n"

/** Le nom que le noyau donne à une série hebdomadaire du lundi. */
private val SERIES_PATH = "Essai/" + com.ahmed.neocalendar.core.notes.filenameForEvent(
    com.ahmed.neocalendar.core.notes.validateEvent(
        Json.parseToJsonElement(
            """{"title":"Sport","allDay":false,"startTime":"18:00","endTime":"19:00","type":"rrule","startDate":"2026-08-03","rrule":"RRULE:FREQ=WEEKLY;BYDAY=MO","skipDates":[]}"""
        ).jsonObject
    )!!
)

private fun stored(path: String, text: String): StoredEvent {
    val calendar = path.substringBeforeLast('/', "")
    return parseStoredEvent(
        EventFile(path, calendar, path.substringAfterLast('/'), text),
        setOf("local::${calendar.ifEmpty { "." }}"),
    )!!
}

class EventWriterTest {
    private val now = { "2026-10-01T10:00:00.000Z" }

    // Le texte sort du sérialiseur du noyau : la clé inconnue et le corps restent, le reste est réécrit.
    @Test fun updateRewritesOnlyWhatTheFormOwns() {
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", DENTIST)
        val note = stored("Essai/2026-08-12 Dentiste.md", DENTIST)
        val payload = json("""{"title":"Dentiste","allDay":false,"startTime":"14:30","endTime":"15:30","type":"single","date":"2026-08-12","endDate":null}""")
        val written = EventWriter(tree).update(note, payload, "Essai")
        assertEquals("Essai/2026-08-12 Dentiste.md", written.relativePath)
        val expected = "---\ntitle: \"Dentiste\"\nallDay: false\nstartTime: \"14:30\"\nendTime: \"15:30\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\nmaCle: garde\n---\nCorps de la note\n"
        assertEquals(expected, tree.files["Essai/2026-08-12 Dentiste.md"])
    }

    // Un titre changé renomme le fichier (filenameForEvent), le texte suit.
    @Test fun aNewTitleRenamesTheFile() {
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", DENTIST)
        val note = stored("Essai/2026-08-12 Dentiste.md", DENTIST)
        val payload = json("""{"title":"Dentiste 2","allDay":false,"startTime":"09:00","endTime":"10:00","type":"single","date":"2026-08-12","endDate":null}""")
        val written = EventWriter(tree).update(note, payload, "Essai")
        assertEquals("Essai/2026-08-12 Dentiste 2.md", written.relativePath)
        assertFalse("Essai/2026-08-12 Dentiste.md" in tree.files)
        assertTrue(tree.files.getValue(written.relativePath).contains("title: \"Dentiste 2\""))
    }

    // Changer de calendrier : la note est déplacée telle qu'elle est, puis modifiée ; l'ancienne disparaît.
    @Test fun changingCalendarMovesTheNote() {
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", DENTIST).dir("Autre")
        val note = stored("Essai/2026-08-12 Dentiste.md", DENTIST)
        val payload = json("""{"title":"Dentiste","allDay":false,"startTime":"09:00","endTime":"10:00","type":"single","date":"2026-08-12","endDate":null}""")
        val written = EventWriter(tree).update(note, payload, "Autre")
        assertEquals("Autre/2026-08-12 Dentiste.md", written.relativePath)
        assertFalse("Essai/2026-08-12 Dentiste.md" in tree.files)
        assertTrue(tree.files.getValue("Autre/2026-08-12 Dentiste.md").endsWith("maCle: garde\n---\nCorps de la note\n"))
    }

    @Test fun aReadOnlyNoteIsNotTouched() {
        val tree = MemoryTree().file("Essai/n.md", DENTIST)
        val note = stored("Essai/n.md", DENTIST).copy(readOnly = true)
        try {
            EventWriter(tree).update(note, json("""{"title":"X","allDay":true,"type":"single","date":"2026-08-12","endDate":null}"""), "Essai")
            fail()
        } catch (_: ReadOnlyEventException) {
        }
        assertEquals(DENTIST, tree.files["Essai/n.md"])
        assertTrue(tree.log.isEmpty())
    }

    // Un évènement invalide n'écrit rien.
    @Test fun anInvalidEventWritesNothing() {
        val tree = MemoryTree().dir("Essai")
        try {
            EventWriter(tree).create("Essai", json("""{"allDay":false}"""))
            fail()
        } catch (_: com.ahmed.neocalendar.core.notes.InvalidEventException) {
        }
        assertTrue(tree.files.isEmpty())
    }

    @Test fun createWritesANewNoteWithoutPreviousContents() {
        val tree = MemoryTree().dir("Essai")
        val written = EventWriter(tree).create("Essai", json("""{"title":"Test","allDay":false,"startTime":"09:00","endTime":"10:00","type":"single","date":"2026-10-01","endDate":null}"""))
        assertEquals("Essai/2026-10-01 Test.md", written.relativePath)
        assertEquals(
            "---\ntitle: \"Test\"\nallDay: false\nstartTime: \"09:00\"\nendTime: \"10:00\"\ntype: \"single\"\ndate: \"2026-10-01\"\nendDate: null\n---\n",
            tree.files["Essai/2026-10-01 Test.md"],
        )
    }

    // Une nouvelle note qui porte le nom d'une autre ne l'écrase pas.
    @Test fun createNeverOverwritesAnotherNote() {
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", DENTIST)
        val written = EventWriter(tree).create("Essai", json("""{"title":"Dentiste","allDay":true,"type":"single","date":"2026-08-12","endDate":null}"""))
        assertEquals("Essai/2026-08-12 Dentiste (1).md", written.relativePath)
        assertEquals(DENTIST, tree.files["Essai/2026-08-12 Dentiste.md"])
    }

    // « Cet évènement seulement » : la copie est écrite, puis la série reçoit le jour dans skipDates ; le reste de la série est intact.
    @Test fun detachingADayWritesACopyThenSkipsTheDay() {
        val tree = MemoryTree().file(SERIES_PATH, SERIES)
        val note = stored(SERIES_PATH, SERIES)
        val payload = json("""{"title":"Sport (annule)","allDay":false,"startTime":"18:00","endTime":"19:00","type":"rrule","startDate":"2026-08-03","rrule":"RRULE:FREQ=WEEKLY;BYDAY=MO","skipDates":[],"completed":false}""")
        val copy = EventWriter(tree).detachOccurrence(note, payload, "2026-08-10", "2026-08-10", "Essai", now)
        assertEquals("Essai/2026-08-10 Sport (annule).md", copy.relativePath)
        val single = tree.files.getValue(copy.relativePath)
        assertTrue(single.contains("type: \"single\""))
        assertTrue(single.contains("date: \"2026-08-10\""))
        assertTrue(single.contains("completed: false"))
        assertFalse(single.contains("rrule"))
        val series = tree.files.getValue(SERIES_PATH)
        assertTrue(series.contains("skipDates: [\"2026-08-10\"]"))
        assertTrue(series.contains("rrule: \"RRULE:FREQ=WEEKLY;BYDAY=MO\""))
        assertTrue(series.contains("title: \"Sport\""))
        assertEquals(listOf("create Essai/2026-08-10 Sport (annule).md", "write Essai/2026-08-10 Sport (annule).md", "write $SERIES_PATH"), tree.log)
    }

    @Test fun deletingOneDayOfASeriesSkipsIt() {
        val tree = MemoryTree().file(SERIES_PATH, SERIES)
        EventWriter(tree).deleteOccurrence(stored(SERIES_PATH, SERIES), "2026-08-17", following = false)
        val series = tree.files.getValue(SERIES_PATH)
        assertTrue(series.contains("skipDates: [\"2026-08-17\"]"))
        assertTrue(series.endsWith("Corps\n"))
    }

    @Test fun deletingTheFollowingDaysEndsTheSeriesTheDayBefore() {
        val tree = MemoryTree().file(SERIES_PATH, SERIES)
        EventWriter(tree).deleteOccurrence(stored(SERIES_PATH, SERIES), "2026-08-17", following = true)
        // La règle entre dans le nom du fichier : la note est renommée.
        assertFalse(SERIES_PATH in tree.files)
        val series = tree.files.values.single()
        assertTrue(series, series.contains("rrule: \"RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260816T235959Z\""))
    }

    // Plus rien de la série : la note part.
    @Test fun deletingFromTheFirstDayRemovesTheNote() {
        val tree = MemoryTree().file(SERIES_PATH, SERIES)
        EventWriter(tree).deleteOccurrence(stored(SERIES_PATH, SERIES), "2026-08-03", following = true)
        assertTrue(tree.files.isEmpty())
    }

    @Test fun deleteRemovesTheFile() {
        val tree = MemoryTree().file("Essai/n.md", DENTIST)
        EventWriter(tree).delete(stored("Essai/n.md", DENTIST))
        assertTrue(tree.files.isEmpty())
    }

    // Une copie n'a pas d'identifiant et ne prend pas la place de l'original.
    @Test fun duplicateDropsTheIdAndKeepsTheOriginal() {
        val withId = DENTIST.replace("title: \"Dentiste\"\n", "title: \"Dentiste\"\nid: \"abc\"\n")
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", withId)
        val copy = EventWriter(tree).duplicate(stored("Essai/2026-08-12 Dentiste.md", withId), "Essai")
        assertEquals("Essai/2026-08-12 Dentiste (1).md", copy.relativePath)
        assertFalse(tree.files.getValue(copy.relativePath).contains("id:"))
        assertEquals(withId, tree.files["Essai/2026-08-12 Dentiste.md"])
    }

    private fun dentistPayload(title: String) =
        json("""{"title":"$title","allDay":false,"startTime":"09:00","endTime":"10:00","type":"single","date":"2026-08-12","endDate":null}""")

    // Correctif 1 : la note a disparu pendant que la fiche était ouverte : erreur claire, aucun fichier recréé.
    @Test fun updatingANoteDeletedElsewhereWritesNothing() {
        val tree = MemoryTree().dir("Essai")
        val note = stored("Essai/2026-08-12 Dentiste.md", DENTIST)
        try {
            EventWriter(tree).update(note, dentistPayload("Dentiste 2"), "Essai")
            fail()
        } catch (e: NoteMovedException) {
            assertEquals("Cette note a été déplacée ou supprimée ailleurs. Rechargez et recommencez.", e.message)
        }
        assertTrue(tree.files.isEmpty())
        assertTrue(tree.log.isEmpty())
    }

    @Test fun detachingFromASeriesDeletedElsewhereWritesNothing() {
        val tree = MemoryTree().dir("Essai")
        val note = stored(SERIES_PATH, SERIES)
        try {
            EventWriter(tree).detachOccurrence(note, dentistPayload("Sport"), "2026-08-10", "2026-08-10", "Essai", now)
            fail()
        } catch (_: NoteMovedException) {
        }
        assertTrue(tree.files.isEmpty())
    }

    // Correctif 2 : le PC a modifié le corps pendant que la fiche était ouverte ; les deux modifications survivent.
    @Test fun aBodyEditedOnThePcSurvivesTheFormSave() {
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", DENTIST)
        val note = stored("Essai/2026-08-12 Dentiste.md", DENTIST)
        tree.files["Essai/2026-08-12 Dentiste.md"] = DENTIST + "ligne du PC\n"
        val written = EventWriter(tree).update(note, dentistPayload("Dentiste 2"), "Essai")
        val text = tree.files.getValue(written.relativePath)
        assertTrue(text.contains("title: \"Dentiste 2\""))
        assertTrue(text.endsWith("Corps de la note\nligne du PC\n"))
        assertTrue(text.contains("maCle: garde"))
    }

    // Correctif 2 : un champ que la fiche n'a pas touché (l'heure) garde la valeur du PC ; le titre de la fiche passe.
    @Test fun anUntouchedFieldChangedOnThePcKeepsTheFileValue() {
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", DENTIST)
        val note = stored("Essai/2026-08-12 Dentiste.md", DENTIST)
        tree.files["Essai/2026-08-12 Dentiste.md"] = DENTIST.replace("startTime: \"09:00\"", "startTime: \"11:00\"").replace("endTime: \"10:00\"", "endTime: \"12:00\"")
        val written = EventWriter(tree).update(note, dentistPayload("Dentiste 2"), "Essai")
        val text = tree.files.getValue(written.relativePath)
        assertTrue(text.contains("title: \"Dentiste 2\""))
        assertTrue(text.contains("startTime: \"11:00\""))
        assertTrue(text.contains("endTime: \"12:00\""))
    }

    // Correctif 2 : un champ touché dans la fiche l'emporte sur celui du PC.
    @Test fun aFieldTouchedInTheFormWinsOverThePc() {
        val tree = MemoryTree().file("Essai/2026-08-12 Dentiste.md", DENTIST)
        val note = stored("Essai/2026-08-12 Dentiste.md", DENTIST)
        tree.files["Essai/2026-08-12 Dentiste.md"] = DENTIST.replace("startTime: \"09:00\"", "startTime: \"11:00\"")
        val payload = json("""{"title":"Dentiste","allDay":false,"startTime":"14:30","endTime":"15:30","type":"single","date":"2026-08-12","endDate":null}""")
        val written = EventWriter(tree).update(note, payload, "Essai")
        assertTrue(tree.files.getValue(written.relativePath).contains("startTime: \"14:30\""))
    }

    // Correctif 3 : la modification d'une note d'un sous-dossier la laisse dans ce sous-dossier.
    @Test fun updatingANoteInASubfolderKeepsItThere() {
        val tree = MemoryTree().file("Essai/Archives/2026-08-12 Dentiste.md", DENTIST)
        val note = stored("Essai/Archives/2026-08-12 Dentiste.md", DENTIST).copy(calendarPath = "Essai")
        val written = EventWriter(tree).update(note, dentistPayload("Dentiste 2"), "Essai")
        assertEquals("Essai/Archives/2026-08-12 Dentiste 2.md", written.relativePath)
        assertEquals(setOf("Essai/Archives/2026-08-12 Dentiste 2.md"), tree.files.keys)
    }
}
