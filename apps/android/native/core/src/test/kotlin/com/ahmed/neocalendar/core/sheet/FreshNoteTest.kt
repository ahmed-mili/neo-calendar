package com.ahmed.neocalendar.core.sheet

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private fun note(path: String, id: String? = null): StoredEvent {
    val calendar = path.substringBeforeLast('/')
    val idLine = if (id == null) "" else "id: \"$id\"\n"
    val text = "---\n${idLine}title: \"Essai\"\nallDay: true\ndate: \"2026-10-03\"\ntype: \"single\"\n---\n"
    return parseStoredEvent(EventFile(path, calendar, path.substringAfterLast('/'), text), setOf("local::$calendar"))!!
}

class FreshNoteTest {
    @Test fun theSamePathWins() {
        val opened = note("Perso/Essai.md", "a")
        val now = note("Perso/Essai.md", "a")
        assertEquals(now, freshNote(listOf(note("Perso/Autre.md", "a"), now), opened, "Perso"))
    }

    @Test fun aRenamedNoteIsFoundByItsId() {
        val opened = note("Perso/Essai.md", "a")
        val renamed = note("Perso/Essai bis.md", "a")
        assertEquals(renamed, freshNote(listOf(note("Perso/Autre.md", "b"), renamed), opened, "Perso"))
    }

    @Test fun twoNotesSharingTheIdAreNotGuessedBetween() {
        val opened = note("Perso/Essai.md", "a")
        assertNull(freshNote(listOf(note("Perso/Essai bis.md", "a"), note("Perso/Essai (1).md", "a")), opened, "Perso"))
    }

    @Test fun aNoteMovedToAnotherCalendarIsFoundByItsFileNameThere() {
        val opened = note("Perso/Essai.md")
        val moved = note("Travail/Essai.md")
        assertEquals(moved, freshNote(listOf(note("Perso/Autre.md"), moved), opened, "Travail"))
        assertNull(freshNote(listOf(moved), opened, "Perso"))
    }
}
