package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PrivateStorageTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun put(root: File, path: String, text: String) {
        val f = File(root, path)
        f.parentFile.mkdirs()
        f.writeText(text)
    }

    private fun source(): File = tmp.newFolder("source").also {
        put(it, "Travail/rdv.md", "---\ntitle: Réunion\n---\n")
        put(it, ".neo-calendar/.neo-calendar.json", "{\"firstDay\":1}\n")
        put(it, ".stfolder/x", "")
    }

    private fun snapshot(root: File): Map<String, String> =
        root.walkTopDown().filter { it.isFile }.associate { it.relativeTo(root).path.replace('\\', '/') to it.readText() }

    private fun finalRoot(): File = File(tmp.root, "files/Neo Calendar")

    private fun staging(): File = File(finalRoot().parentFile, "Neo Calendar.copie-en-cours")

    @Test fun `la copie est posee dans le stockage prive, avec marqueur et stignore, et la source reste intacte`() {
        val src = source()
        val before = snapshot(src)
        val report = copyToPrivateAtomically(FileWorkspaceStorage(src), finalRoot())
        assertEquals(2, report.files)
        assertEquals("---\ntitle: Réunion\n---\n", File(finalRoot(), "Travail/rdv.md").readText())
        assertEquals(STIGNORE_TEXT, File(finalRoot(), ".stignore").readText())
        assertFalse(File(finalRoot(), ".stfolder").exists())
        assertFalse(staging().exists())
        assertEquals(before, snapshot(src))
    }

    @Test fun `un stockage prive qui contient des notes est refuse et reste intact`() {
        val src = source()
        put(finalRoot(), "Perso/ancienne.md", "a moi")
        val before = snapshot(finalRoot())
        try {
            copyToPrivateAtomically(FileWorkspaceStorage(src), finalRoot())
            fail("doit refuser")
        } catch (e: PrivateStorageInUse) {
            assertTrue(e.message!!.contains("Vider le stockage privé"))
        }
        assertEquals(before, snapshot(finalRoot()))
        assertFalse(staging().exists())
    }

    @Test fun `un fichier autre qu'une note, dans le stockage prive, le rend occupe aussi`() {
        put(finalRoot(), ".neo-calendar/.neo-calendar.json", "{\"firstDay\":3}\n")
        assertTrue(privateStorageInUse(finalRoot()))
        try {
            copyToPrivateAtomically(FileWorkspaceStorage(source()), finalRoot())
            fail("doit refuser")
        } catch (_: PrivateStorageInUse) {
        }
        assertEquals("{\"firstDay\":3}\n", File(finalRoot(), ".neo-calendar/.neo-calendar.json").readText())
    }

    @Test fun `un stockage prive neuf, marqueur et stignore seuls, n'est pas occupe et est remplace`() {
        val old = finalRoot()
        old.mkdirs()
        initNewWorkspace(FileWorkspaceStorage(old))
        assertFalse(privateStorageInUse(old))
        copyToPrivateAtomically(FileWorkspaceStorage(source()), old)
        assertTrue(File(old, "Travail/rdv.md").isFile)
    }

    @Test fun `un stockage prive absent n'est pas occupe`() {
        assertFalse(privateStorageInUse(finalRoot()))
    }

    @Test fun `le marqueur de dossier du moteur ne rend pas le stockage occupe`() {
        put(finalRoot(), ".stfolder/syncthing-folder-abc.txt", "marqueur")
        initNewWorkspace(FileWorkspaceStorage(finalRoot()))
        assertFalse(privateStorageInUse(finalRoot()))
    }

    @Test fun `le refus parle de donnees, pas seulement de notes`() {
        assertTrue(PrivateStorageInUse().message!!.contains("contient déjà des données"))
    }

    @Test fun `le marqueur du moteur est recree quand il manque`() {
        val root = finalRoot()
        root.mkdirs()
        ensureFolderMarker(root)
        assertTrue(File(root, ".stfolder").isDirectory)
    }

    @Test fun `un marqueur existant n'est pas touche`() {
        put(finalRoot(), ".stfolder/syncthing-folder-abc.txt", "marqueur")
        ensureFolderMarker(finalRoot())
        assertEquals("marqueur", File(finalRoot(), ".stfolder/syncthing-folder-abc.txt").readText())
    }

    @Test fun `sans dossier de notes, aucun marqueur n'est cree`() {
        ensureFolderMarker(finalRoot())
        assertFalse(finalRoot().exists())
    }

    /** Une source dont un fichier change entre la copie et la relecture, comme si Syncthing y écrivait. */
    private class Moving(private val inner: BinaryWorkspaceStorage, private val path: String) : BinaryWorkspaceStorage by inner {
        private var opens = 0
        override fun openInput(relativePath: String): InputStream? {
            val real = inner.openInput(relativePath)
            if (relativePath != path || ++opens < 2) return real
            return "autre contenu".byteInputStream()
        }
    }

    @Test fun `une source modifiee pendant la copie fait tout refuser, nomme le fichier et ne laisse rien`() {
        val src = source()
        val before = snapshot(src)
        try {
            copyToPrivateAtomically(Moving(FileWorkspaceStorage(src), "Travail/rdv.md"), finalRoot())
            fail("doit refuser")
        } catch (e: CopyFailure) {
            assertEquals("Travail/rdv.md", e.path)
        }
        assertFalse(finalRoot().exists())
        assertFalse(staging().exists())
        assertEquals(before, snapshot(src))
    }

    private class Unreadable(private val inner: BinaryWorkspaceStorage, private val path: String) : BinaryWorkspaceStorage by inner {
        override fun openInput(relativePath: String): InputStream? =
            if (relativePath == path) throw IOException("lecture refusée") else inner.openInput(relativePath)
    }

    @Test fun `un fichier illisible fait tout refuser et nomme le fichier`() {
        val src = source()
        try {
            copyToPrivateAtomically(Unreadable(FileWorkspaceStorage(src), "Travail/rdv.md"), finalRoot())
            fail("doit refuser")
        } catch (e: CopyFailure) {
            assertEquals("Travail/rdv.md", e.path)
        }
        assertFalse(finalRoot().exists())
        assertFalse(staging().exists())
    }

    @Test fun `une source vide est refusee`() {
        val empty = tmp.newFolder("vide")
        try {
            copyToPrivateAtomically(FileWorkspaceStorage(empty), finalRoot())
            fail("doit refuser")
        } catch (_: CopyFailure) {
        }
        assertFalse(finalRoot().exists())
        assertFalse(staging().exists())
    }

    @Test fun `un dossier temporaire laisse par une coupure est ecarte sans polluer la copie`() {
        put(staging(), "reste.md", "d'une coupure")
        copyToPrivateAtomically(FileWorkspaceStorage(source()), finalRoot())
        assertFalse(File(finalRoot(), "reste.md").exists())
        assertFalse(staging().exists())
    }
}
