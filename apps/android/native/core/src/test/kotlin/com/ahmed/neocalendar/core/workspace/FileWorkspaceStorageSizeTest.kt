package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileWorkspaceStorageSizeTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun `list donne la taille en octets d'un fichier et -1 pour un dossier`() {
        val s = FileWorkspaceStorage(tmp.root)
        s.createDirectory("", "Cal")
        s.createFileWithText("Cal", "é.md", "text/markdown", "é")
        val root = s.list("").single()
        assertEquals(-1L, root.size)
        val file = s.list("Cal").single()
        assertEquals(2L, file.size) // « é » vaut 2 octets en UTF-8
        assertEquals(true, file.lastModified > 0L)
    }
}
