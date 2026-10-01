package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class WorkspaceMarkerTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun `un dossier est reconnu par le fichier ou par le sous-dossier`() {
        assertFalse(isNeoCalendarFolder(MemoryTree().file("a.md")))
        assertTrue(isNeoCalendarFolder(MemoryTree().file(".neo-calendar.json", "{}")))
        assertTrue(isNeoCalendarFolder(MemoryTree().dir(".neo-calendar")))
        // Un FICHIER nommé comme le sous-dossier ne compte pas.
        assertFalse(isNeoCalendarFolder(MemoryTree().file(".neo-calendar", "x")))
    }

    @Test fun `un dossier neuf recoit le marqueur et le stignore, sans fichier de reglages`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        assertTrue(isNeoCalendarFolder(s))
        assertEquals(STIGNORE_TEXT, s.readText(".stignore"))
        assertEquals(".neo-tmp-*\n", s.readText(".stignore"))
        assertTrue(s.list(".neo-calendar").isEmpty())
    }

    @Test fun `deux appels de suite ne changent rien`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        initNewWorkspace(s)
        assertEquals(listOf(".neo-calendar", ".stignore"), s.list("").map { it.name })
    }

    @Test fun `un dossier neuf n'a pas de notes, un calendrier ou une note les annoncent`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        assertFalse(workspaceHasNotes(s))
        s.createDirectory("", "Essai Compose")
        assertTrue(workspaceHasNotes(s))
    }

    @Test fun `une note a la racine compte`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        s.createFile("", "a.md", "text/markdown")
        assertTrue(workspaceHasNotes(s))
    }

    @Test fun `les copies de conflit et les dossiers caches ne comptent pas`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        s.createFile("", "a.sync-conflict-20260101-120000-ABCDEFG.md", "text/markdown")
        s.createDirectory("", ".stversions")
        assertFalse(workspaceHasNotes(s))
    }

    @Test fun `un stignore different est remis a la regle de l'app`() {
        val s = FileWorkspaceStorage(tmp.root)
        s.createFile("", ".stignore", "text/plain"); s.writeText(".stignore", "*.md\n")
        writeStignore(s)
        assertEquals(STIGNORE_TEXT, s.readText(".stignore"))
    }

    @Test fun `des preferences corrompues ne font pas lever la detection des notes`() {
        val tree = MemoryTree().file(".neo-calendar.json", "{pas du json").file("a.md", "x")
        assertTrue(workspaceHasNotes(tree))
        assertFalse(workspaceHasNotes(MemoryTree().file(".neo-calendar.json", "{pas du json")))
    }

    @Test fun `une note illisible ne fait pas lever la detection des notes`() {
        val unreadable = object : WorkspaceStorage {
            override fun list(relativeDir: String) =
                if (relativeDir.isEmpty()) listOf(WorkspaceStorage.Entry("a.md", false)) else emptyList()
            override fun readText(relativePath: String): String? = throw java.io.IOException("illisible")
        }
        assertTrue(workspaceHasNotes(unreadable))
    }
}
