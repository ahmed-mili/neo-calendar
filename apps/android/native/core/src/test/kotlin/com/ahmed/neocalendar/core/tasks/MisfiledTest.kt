package com.ahmed.neocalendar.core.tasks

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.workspace.EventWriter
import com.ahmed.neocalendar.core.workspace.MemoryTree
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private fun note(path: String, front: String, body: String = "Corps\n"): StoredEvent {
    val calendar = path.substringBeforeLast('/', "")
    return parseStoredEvent(
        EventFile(path, calendar, path.substringAfterLast('/'), "---\n$front---\n$body"),
        setOf("local::${calendar.ifEmpty { "." }}"),
    )!!
}

private const val TIMED = "title: \"Vol\"\nallDay: false\nstartTime: \"14:05\"\nendTime: \"15:30\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\n"

class MisfiledTest {
    @Test fun aTimedSpanCarryingCompletedFalseIsAnEvent() {
        assertTrue(isMisfiledEvent(note("Essai/a.md", TIMED + "completed: false\n").event))
    }

    @Test fun everythingElseIsLeftAlone() {
        // Déjà un évènement, tâche finie, tâche en cours, échéance tapée, journée entière, sans heure de fin.
        assertFalse(isMisfiledEvent(note("Essai/a.md", TIMED).event))
        assertFalse(isMisfiledEvent(note("Essai/a.md", TIMED + "completed: \"2026-08-12T15:40:00.000Z\"\n").event))
        assertFalse(isMisfiledEvent(note("Essai/a.md", TIMED + "completed: \"in-progress\"\n").event))
        assertFalse(isMisfiledEvent(note("Essai/a.md", TIMED + "completed: false\ndue: \"2026-08-20\"\n").event))
        assertFalse(isMisfiledEvent(note("Essai/a.md", "title: \"Permis\"\nallDay: true\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\ncompleted: false\n").event))
        assertFalse(isMisfiledEvent(note("Essai/a.md", "title: \"Appel\"\nallDay: false\nstartTime: \"09:00\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\ncompleted: false\n").event))
    }

    @Test fun aReadOnlyNoteIsNotOffered() {
        val ok = note("Essai/a.md", TIMED + "completed: false\n")
        assertEquals(listOf(ok), misfiledEventsOf(listOf(ok)))
        assertTrue(misfiledEventsOf(listOf(ok.copy(readOnly = true), ok.copy(icsFeedId = "x"))).isEmpty())
    }

    @Test fun convertingKeepsEverythingButTheTaskFields() {
        val path = "Essai/2026-08-12 Vol.md"
        val text = "---\n$TIMED" + "location: \"Orly\"\nmaCle: garde\ncompleted: false\n---\nCorps de la note\n"
        val tree = MemoryTree().file(path, text)
        val stored = parseStoredEvent(EventFile(path, "Essai", "2026-08-12 Vol.md", text), setOf("local::Essai"))!!
        EventWriter(tree).convertToPlainEvent(stored)
        val written = tree.files.getValue(path)
        assertFalse(written.contains("completed"))
        assertFalse(written.contains("due"))
        assertTrue(written.contains("location: \"Orly\""))
        assertTrue(written.contains("maCle: garde"))
        assertTrue(written.endsWith("---\nCorps de la note\n"))
        assertTrue(written.contains("startTime: \"14:05\""))
    }
}
