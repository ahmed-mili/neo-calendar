package com.ahmed.neocalendar.core.workspace

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PrivateComparisonTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun put(root: File, path: String, text: String) {
        val f = File(root, path)
        f.parentFile.mkdirs()
        f.writeText(text)
    }

    private fun compare(priv: File, ext: File) = comparePrivateWithExternal(FileWorkspaceStorage(priv), FileWorkspaceStorage(ext))

    @Test fun `tout existe aussi dans le dossier externe`() {
        val p = tmp.newFolder("p"); val e = tmp.newFolder("e")
        for (root in listOf(p, e)) { put(root, "Travail/a.md", "a"); put(root, ".neo-calendar/x.json", "{}") }
        put(e, "Travail/seulement-externe.md", "e")
        val c = compare(p, e)
        assertEquals(2, c.totalFiles)
        assertTrue(c.onlyInPrivate.isEmpty())
    }

    @Test fun `une note presente seulement dans le prive est signalee`() {
        val p = tmp.newFolder("p"); val e = tmp.newFolder("e")
        put(p, "Travail/a.md", "a"); put(e, "Travail/a.md", "a")
        put(p, "Perso/nouvelle.md", "n")
        val c = compare(p, e)
        assertEquals(listOf("Perso/nouvelle.md"), c.onlyInPrivate)
        assertEquals(2, c.totalFiles)
        assertEquals(1, c.onlyInPrivateNotes)
    }

    @Test fun `un fichier de meme nom mais de contenu different est signale`() {
        val p = tmp.newFolder("p"); val e = tmp.newFolder("e")
        put(p, "Travail/a.md", "version du téléphone"); put(e, "Travail/a.md", "version du PC")
        assertEquals(listOf("Travail/a.md"), compare(p, e).onlyInPrivate)
    }

    @Test fun `la corbeille et les copies de conflit sont comptees a part, pas comparees`() {
        val p = tmp.newFolder("p"); val e = tmp.newFolder("e")
        put(p, "a.md", "a"); put(e, "a.md", "a")
        put(p, ".stversions/vieux.md", "v"); put(p, ".stversions/Travail/autre.md", "w")
        put(p, "a.sync-conflict-20260101-120000-ABCDEFG.md", "c")
        put(p, ".stfolder/x", ""); put(p, ".stignore", ".neo-tmp-*")
        val c = compare(p, e)
        assertEquals(1, c.totalFiles)
        assertEquals(2, c.trashFiles)
        assertEquals(1, c.conflictCopies)
        assertTrue(c.onlyInPrivate.isEmpty())
    }

    @Test fun `le message dit en clair ce qui n'existe que dans le prive`() {
        val c = PrivateComparison(totalFiles = 12, onlyInPrivate = listOf("a.md", "b.md", "c.md", "d.md", "e.md", "f.md", "g.md"), onlyInPrivateNotes = 7, trashFiles = 3, conflictCopies = 1)
        val text = clearPrivateMessage(c)
        assertTrue(text, text.contains("7 notes n'existent que dans le stockage privé et seront définitivement supprimées"))
        assertTrue(text.contains("a.md") && text.contains("e.md") && !text.contains("f.md"))
        assertTrue(text.contains("12 fichiers"))
        assertTrue(text.contains(".stversions") && text.contains("3"))
        assertTrue(text.contains("copie de conflit") || text.contains("copies de conflit"))
    }

    @Test fun `le message dit que tout existe ailleurs quand c'est le cas`() {
        val text = clearPrivateMessage(PrivateComparison(totalFiles = 4, onlyInPrivate = emptyList(), onlyInPrivateNotes = 0, trashFiles = 0, conflictCopies = 0))
        assertTrue(text, text.contains("existent aussi") && text.contains("4 fichiers") && text.contains("sans perte"))
    }

    @Test fun `le message avertit quand la comparaison est impossible`() {
        val text = clearPrivateMessage(null)
        assertTrue(text, text.contains("n'a pas pu être lu") && text.contains("définitivement"))
    }
}
