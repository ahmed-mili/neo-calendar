package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ReadTextsTest {
    @Test fun `size vaut -1 quand le stockage ne le dit pas`() {
        assertEquals(-1L, WorkspaceStorage.Entry("a.md", false, 5L).size)
        assertEquals(-1L, WorkspaceStorage.Entry("a.md", false).size)
    }

    @Test fun `readTexts par defaut lit dans l'ordre demande et rend null pour un absent`() {
        val s = CountingStorage().put("Cal/a.md", "A").put("Cal/b.md", "B")
        assertEquals(listOf("B", null, "A"), s.readTexts(listOf("Cal/b.md", "Cal/zz.md", "Cal/a.md")))
        assertEquals(emptyList<String?>(), s.readTexts(emptyList()))
    }

    @Test fun `loadWorkspace garde l'ordre de la serie, sous-dossiers compris`() {
        val s = CountingStorage()
            .put("Cal2/b.md", "B")
            .put("Cal1/sub/c.md", "C")
            .put("Cal1/a.md", "A")
            .put("Cal1/notes.txt", "pas une note")
        val loaded = loadWorkspace(s)
        assertEquals(listOf("Cal1/a.md", "Cal1/sub/c.md", "Cal2/b.md"), loaded.eventFiles.map { it.relativePath })
        assertEquals(listOf("A", "C", "B"), loaded.eventFiles.map { it.contents })
        assertEquals(listOf("Cal1", "Cal1", "Cal2"), loaded.eventFiles.map { it.calendarPath })
    }

    @Test fun `un dossier sans calendrier lit les notes de la racine`() {
        val s = CountingStorage().put("b.md", "B").put("a.md", "A")
        val loaded = loadWorkspace(s)
        assertEquals(listOf("a.md", "b.md"), loaded.eventFiles.map { it.relativePath })
        assertEquals(listOf("A", "B"), loaded.eventFiles.map { it.contents })
    }

    @Test fun `un fichier liste mais illisible leve une erreur qui nomme le premier dans l'ordre`() {
        val s = CountingStorage().put("Cal/a.md", "A").put("Cal/b.md", "B").put("Cal/c.md", "C")
        s.unreadable += "Cal/c.md"
        s.unreadable += "Cal/b.md"
        try {
            loadWorkspace(s)
            fail("une erreur était attendue")
        } catch (e: IOException) {
            assertTrue(e.message, e.message!!.contains("Cal/b.md"))
        }
    }
}
