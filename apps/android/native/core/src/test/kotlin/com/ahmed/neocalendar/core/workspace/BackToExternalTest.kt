package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class BackToExternalTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun put(root: File, path: String, text: String) {
        val f = File(root, path)
        f.parentFile.mkdirs()
        f.writeText(text)
    }

    private fun privateTree(): File = tmp.newFolder("prive").also {
        put(it, "Travail/rdv.md", "---\ntitle: R\n---\n")
        put(it, ".neo-calendar/.neo-calendar.json", "{\"firstDay\":1}\n")
        put(it, ".neo-calendar/wallpapers/a.jpg", "jpg")
        put(it, ".stignore", ".neo-tmp-*\n")
        put(it, ".stfolder/x", "")
    }

    private fun files(root: File) = root.walkTopDown().filter { it.isFile }.map { it.relativeTo(root).path.replace('\\', '/') }.sorted().toList()

    @Test fun `la copie est complete, marqueur compris, et la source reste intacte`() {
        val src = privateTree(); val dest = tmp.newFolder("dest")
        val before = files(src)
        copyBackToExternal(FileWorkspaceStorage(src), FileWorkspaceStorage(dest))
        assertEquals(listOf(".neo-calendar/.neo-calendar.json", ".neo-calendar/wallpapers/a.jpg", "Travail/rdv.md"), files(dest))
        assertTrue(isNeoCalendarFolder(FileWorkspaceStorage(dest)))
        assertFalse(File(dest, ".neo-calendar.copie-en-cours").exists())
        assertEquals(before, files(src))
    }

    /** Un stockage de destination qui enregistre l'ordre des créations et peut tomber en panne sur un nom. */
    private class Recording(private val inner: BinaryWorkspaceStorage, private val failOn: String? = null) : BinaryWorkspaceStorage by inner {
        val events = ArrayList<String>()
        override fun createFile(relativeDir: String, name: String, mimeType: String): String {
            if (name == failOn) throw IOException("panne simulée")
            events += "createFile $relativeDir/$name"
            return inner.createFile(relativeDir, name, mimeType)
        }
        override fun createDirectory(relativeDir: String, name: String): String {
            events += "createDirectory $relativeDir/$name"
            return inner.createDirectory(relativeDir, name)
        }
        override fun rename(relativePath: String, newName: String): String {
            events += "rename $relativePath -> $newName"
            return inner.rename(relativePath, newName)
        }
    }

    @Test fun `le marqueur n'apparait qu'en dernier, par un renommage`() {
        val src = privateTree(); val dest = tmp.newFolder("dest")
        val rec = Recording(FileWorkspaceStorage(dest))
        copyBackToExternal(FileWorkspaceStorage(src), rec)
        assertEquals("rename .neo-calendar.copie-en-cours -> .neo-calendar", rec.events.last())
        assertTrue(rec.events.none { it == "createDirectory /.neo-calendar" || it == "createFile /.neo-calendar.json" })
        assertTrue(rec.events.indexOf("createFile Travail/rdv.md") in 0 until rec.events.size - 1)
    }

    @Test fun `une panne pendant la copie des reglages ne laisse aucun marqueur ni copie partielle`() {
        val src = privateTree(); val dest = tmp.newFolder("dest")
        try {
            copyBackToExternal(FileWorkspaceStorage(src), Recording(FileWorkspaceStorage(dest), failOn = "a.jpg"))
            fail("doit échouer")
        } catch (e: CopyFailure) {
            assertTrue(e.message!!, e.message!!.contains("a.jpg"))
        }
        assertEquals(emptyList<String>(), dest.list()!!.toList())
    }

    @Test fun `un dossier sans marqueur et non vide est dit copie partielle probable`() {
        val src = privateTree(); val dest = tmp.newFolder("dest")
        put(dest, "Travail/rdv.md", "reste d'une copie interrompue")
        try {
            copyBackToExternal(FileWorkspaceStorage(src), FileWorkspaceStorage(dest))
            fail("doit refuser")
        } catch (e: CopyFailure) {
            assertTrue(e.message!!, e.message!!.contains("pas vide") && e.message!!.contains("copie partielle") && e.message!!.contains("supprimez"))
        }
        assertEquals("reste d'une copie interrompue", File(dest, "Travail/rdv.md").readText())
    }

    @Test fun `un dossier non vide avec marqueur est dit dossier Neo Calendar existant`() {
        val src = privateTree(); val dest = tmp.newFolder("dest")
        put(dest, ".neo-calendar/.neo-calendar.json", "{}")
        try {
            copyBackToExternal(FileWorkspaceStorage(src), FileWorkspaceStorage(dest))
            fail("doit refuser")
        } catch (e: CopyFailure) {
            assertTrue(e.message!!, e.message!!.contains("pas vide") && e.message!!.contains("Ouvrir un dossier existant"))
        }
    }

    @Test fun `un marqueur json a la racine est aussi copie en dernier`() {
        val src = privateTree(); put(src, ".neo-calendar.json", "{\"a\":1}")
        val dest = tmp.newFolder("dest")
        val rec = Recording(FileWorkspaceStorage(dest))
        copyBackToExternal(FileWorkspaceStorage(src), rec)
        assertEquals("{\"a\":1}", File(dest, ".neo-calendar.json").readText())
        assertTrue(rec.events.last().startsWith("rename "))
        assertFalse(File(dest, ".neo-calendar.json.copie-en-cours").exists())
    }

    @Test fun `un marqueur vide sans fichier est cree directement`() {
        val src = tmp.newFolder("prive2"); put(src, "Travail/rdv.md", "x"); File(src, ".neo-calendar").mkdirs()
        val dest = tmp.newFolder("dest")
        copyBackToExternal(FileWorkspaceStorage(src), FileWorkspaceStorage(dest))
        assertTrue(File(dest, ".neo-calendar").isDirectory)
    }
}
