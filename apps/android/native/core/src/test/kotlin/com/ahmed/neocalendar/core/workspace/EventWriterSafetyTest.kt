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

private const val SERIES_HEAD = "---\ntitle: \"Sport\"\nallDay: false\nstartTime: \"18:00\"\nendTime: \"19:00\"\ntype: \"rrule\"\nstartDate: \"2026-08-03\"\nrrule: \"RRULE:FREQ=WEEKLY;BYDAY=MO\"\n"

private fun series(skip: String = "[]", done: String = "[]", id: String? = null) =
    SERIES_HEAD + (if (id != null) "id: \"$id\"\n" else "") + "skipDates: $skip\ncompleted: false\ncompletedDates: $done\nlocation: \"Salle 3\"\n---\nCorps\n"

private val PARIS = ZoneId.of("Europe/Paris")
private fun at(local: String): Instant = java.time.LocalDateTime.parse(local).atZone(PARIS).toInstant()

private fun stored(path: String, text: String): StoredEvent {
    val calendar = path.substringBeforeLast('/', "")
    return parseStoredEvent(EventFile(path, calendar, path.substringAfterLast('/'), text), setOf("local::$calendar"))!!
}

/** Le nom canonique de la série : l'écrire ne la renomme pas. */
private val PATH = "Essai/" + com.ahmed.neocalendar.core.notes.filenameForEvent(stored("Essai/x.md", series()).event)

private fun expectMoved(block: () -> Unit) {
    try {
        block()
        fail("NoteMovedException attendue")
    } catch (_: NoteMovedException) {
    }
}

/** Les défauts de la revue de la tâche 4 : gestes répétés, édition concurrente (Syncthing), noms de fichiers. */
class EventWriterSafetyTest {
    private val now = { "2026-10-01T10:00:00.000Z" }

    private fun move(tree: MemoryTree, note: StoredEvent, day: String, start: String, end: String, resize: Boolean = false) =
        EventWriter(tree).reschedule(note, "abc_$day", at(start), at(end), resize, PARIS, now)

    // 1 : un même geste rejoué n'écrit pas une seconde copie

    @Test fun movingTheSameDayTwiceWritesOnlyOneCopy() {
        val text = series()
        val tree = MemoryTree().file(PATH, text)
        val note = stored(PATH, text)
        move(tree, note, "2026-08-10", "2026-08-11T10:00", "2026-08-11T11:00")
        expectMoved { move(tree, note, "2026-08-10", "2026-08-11T10:00", "2026-08-11T11:00") }
        assertEquals(2, tree.files.size)
        assertEquals(1, tree.files.keys.count { it.startsWith("Essai/2026-08-11 Sport") })
    }

    @Test fun detachingADayOfAFileThatIsNoLongerTheSameSeriesWritesNothing() {
        val text = series(id = "a")
        val tree = MemoryTree().file(PATH, series(id = "autre"))
        expectMoved { move(tree, stored(PATH, text), "2026-08-10", "2026-08-11T10:00", "2026-08-11T11:00") }
        assertEquals(setOf(PATH), tree.files.keys)
        assertTrue(tree.log.isEmpty())
    }

    // 2 : les jours écartés ou cochés ailleurs survivent

    @Test fun deletingADayKeepsADayDeletedOnThePcMeanwhile() {
        val snapshot = stored(PATH, series(skip = "[\"2026-08-10\"]"))
        val tree = MemoryTree().file(PATH, series(skip = "[\"2026-08-10\",\"2026-08-17\"]"))
        EventWriter(tree).deleteOccurrence(snapshot, "2026-08-24", following = false)
        assertTrue(tree.files.getValue(PATH), tree.files.getValue(PATH).contains("skipDates: [\"2026-08-10\",\"2026-08-17\",\"2026-08-24\"]"))
    }

    @Test fun movingADayKeepsADayDeletedOnThePcMeanwhile() {
        val snapshot = stored(PATH, series())
        val tree = MemoryTree().file(PATH, series(skip = "[\"2026-08-17\"]"))
        move(tree, snapshot, "2026-08-24", "2026-08-25T10:00", "2026-08-25T11:00")
        assertTrue(tree.files.getValue(PATH), tree.files.getValue(PATH).contains("skipDates: [\"2026-08-17\",\"2026-08-24\"]"))
    }

    @Test fun tickingADayKeepsADayTickedOnThePcMeanwhile() {
        val snapshot = stored(PATH, series(done = "[\"2026-08-03\"]"))
        val tree = MemoryTree().file(PATH, series(done = "[\"2026-08-03\",\"2026-08-10\"]"))
        EventWriter(tree).setTaskDone(snapshot, "abc_2026-08-17", true, now)
        assertTrue(tree.files.getValue(PATH), tree.files.getValue(PATH).contains("completedDates: [\"2026-08-03\",\"2026-08-10\",\"2026-08-17\"]"))
    }

    @Test fun untickingADayKeepsADayTickedOnThePcMeanwhile() {
        val snapshot = stored(PATH, series(done = "[\"2026-08-03\"]"))
        val tree = MemoryTree().file(PATH, series(done = "[\"2026-08-03\",\"2026-08-10\"]"))
        EventWriter(tree).setTaskDone(snapshot, "abc_2026-08-03", false, now)
        assertTrue(tree.files.getValue(PATH), tree.files.getValue(PATH).contains("completedDates: [\"2026-08-10\"]"))
    }

    // 3 : une fin le lendemain

    @Test fun movingADayOfASeriesPastMidnightWritesTheEndDate() {
        val text = series()
        val tree = MemoryTree().file(PATH, text)
        val copy = move(tree, stored(PATH, text), "2026-08-10", "2026-08-11T23:30", "2026-08-12T00:30")
        val single = tree.files.getValue(copy.relativePath)
        assertTrue(single, single.contains("date: \"2026-08-11\"") && single.contains("endDate: \"2026-08-12\"") && single.contains("endTime: \"00:30\""))
    }

    // 4 : début de série incalculable

    @Test fun deletingFollowingDaysOfASeriesWithNoComputableStartNeverDeletesTheNote() {
        val broken = series().replace("BYDAY=MO", "BYDAY=MO;UNTIL=20200101T000000Z")
        val tree = MemoryTree().file(PATH, broken)
        try {
            EventWriter(tree).deleteOccurrence(stored(PATH, broken), "2026-08-17", following = true)
            fail()
        } catch (_: IllegalStateException) {
        }
        assertEquals(broken, tree.files[PATH])
        assertTrue(tree.log.isEmpty())
    }

    // 5 : un seul geste d'écriture à la fois

    @Test fun aSecondDeleteWhileTheFirstRunsIsIgnoredNotReportedAsAnError() {
        val gate = WriteGate()
        val text = series()
        val tree = MemoryTree().file(PATH, text)
        val note = stored(PATH, text)
        val errors = mutableListOf<String>()
        // Le second appui arrive pendant la première écriture (il rentre dans le verrou déjà pris).
        fun tap(again: Boolean) {
            if (!gate.tryEnter()) return
            try {
                EventWriter(tree).delete(note)
                if (again) tap(false)
            } catch (e: Exception) {
                errors += e.message.orEmpty()
            } finally {
                gate.leave()
            }
        }
        tap(again = true)
        assertTrue(tree.files.isEmpty())
        assertEquals(emptyList<String>(), errors)
        assertFalse(gate.isBusy)
    }

    // 6 : un nom avec « (1) » n'est pas renommé à chaque écriture

    @Test fun aNoteWithAUniquenessSuffixKeepsItsNameWhenTicked() {
        val task = "---\ntitle: \"Rapport\"\nallDay: false\nstartTime: \"09:00\"\nendTime: \"10:00\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\ncompleted: false\n---\nD\n"
        val copyPath = "Essai/2026-08-12 Rapport (1).md"
        val tree = MemoryTree().file("Essai/2026-08-12 Rapport.md", task).file(copyPath, task)
        val written = EventWriter(tree).setTaskDone(stored(copyPath, task), "id", true, now)
        assertEquals(copyPath, written.relativePath)
        assertEquals(setOf("Essai/2026-08-12 Rapport.md", copyPath), tree.files.keys)
        assertFalse(tree.log.any { it.startsWith("rename") })
    }

    // 7 : sans identifiant, il faut le même contenu pour supprimer

    @Test fun deletingANoteWithoutIdThatChangedAtTheSamePathIsRefused() {
        val text = series()
        val tree = MemoryTree().file(PATH, text + "autre contenu\n")
        expectMoved { EventWriter(tree).delete(stored(PATH, text)) }
        assertTrue(tree.files.containsKey(PATH))
    }
}
