package com.ahmed.neocalendar.core.workspace

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class VisibleFolderTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun put(root: File, path: String, text: String, time: Long? = null) {
        val f = File(root, path)
        f.parentFile.mkdirs()
        f.writeBytes(text.toByteArray(Charsets.UTF_8))
        if (time != null) f.setLastModified(time)
    }

    private fun files(root: File): List<String> =
        root.walkTopDown().filter { it.isFile }.map { it.relativeTo(root).path.replace('\\', '/') }.sorted().toList()

    private fun snapshot(root: File): Map<String, String> = files(root).associateWith { File(root, it).readText() }

    private fun source(): File {
        val root = tmp.newFolder("prive")
        put(root, "Travail/rdv.md", "rendez-vous", 1_700_000_000_000)
        put(root, "Travail/.attachments/photo.bin", String(ByteArray(3000) { (it % 251).toByte() }, Charsets.ISO_8859_1))
        put(root, ".neo-calendar/.neo-calendar.json", "{}")
        put(root, ".stfolder/x", "")
        put(root, ".stignore", ".neo-tmp-*\n")
        put(root, "Travail/.syncthing.rdv.md.tmp", "partiel")
        File(root, "Perso/vide").mkdirs()
        return root
    }

    @Test fun `copie dans un dossier neuf, original intact, dates gardees`() {
        val src = source()
        val before = snapshot(src)
        val dest = File(tmp.root, "visible")
        val report = mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        assertEquals(3, report.copied)
        assertEquals(0, report.conflicts)
        assertEquals(listOf(".neo-calendar/.neo-calendar.json", "Travail/.attachments/photo.bin", "Travail/rdv.md"), files(dest))
        assertTrue(File(dest, "Perso/vide").isDirectory)
        assertEquals(1_700_000_000_000, File(dest, "Travail/rdv.md").lastModified())
        assertEquals(before, snapshot(src))
        assertTrue(dest.walkTopDown().none { it.name.startsWith(".neo-tmp-") })
    }

    @Test fun `une deuxieme fusion est sans effet`() {
        val src = source()
        val dest = File(tmp.root, "visible")
        mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        val report = mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        assertEquals(0, report.copied)
        assertEquals(3, report.identical)
        assertEquals(3, files(dest).size)
    }

    @Test fun `un fichier existant plus recent n'est jamais ecrase, la version de la source est gardee en conflit`() {
        val src = source()
        val dest = tmp.newFolder("visible")
        put(dest, "Travail/rdv.md", "version du dossier visible", 1_800_000_000_000)
        put(dest, "autre.md", "propre au dossier visible")
        val report = mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        assertEquals(1, report.keptNewer)
        assertEquals(0, report.replacedOlder)
        assertEquals("version du dossier visible", File(dest, "Travail/rdv.md").readText())
        val conflict = files(dest).single { it.contains(".sync-conflict-") }
        assertTrue(conflict.startsWith("Travail/rdv.sync-conflict-") && conflict.endsWith(".md"))
        assertEquals("rendez-vous", File(dest, conflict).readText())
        assertEquals("propre au dossier visible", File(dest, "autre.md").readText())
    }

    @Test fun `une nouvelle tentative ne duplique pas la copie de conflit`() {
        val src = source()
        val dest = tmp.newFolder("visible")
        put(dest, "Travail/rdv.md", "version du dossier visible", 1_800_000_000_000)
        mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        assertEquals(1, files(dest).count { it.contains(".sync-conflict-") })
    }

    @Test fun `un fichier existant plus ancien cede sa place, sa version est gardee en conflit`() {
        val src = source()
        val dest = tmp.newFolder("visible")
        put(dest, "Travail/rdv.md", "vieille version", 1_600_000_000_000)
        val report = mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        assertEquals(1, report.replacedOlder)
        assertEquals("rendez-vous", File(dest, "Travail/rdv.md").readText())
        val conflict = files(dest).single { it.contains(".sync-conflict-") }
        assertEquals("vieille version", File(dest, conflict).readText())
    }

    @Test fun `une copie de conflit de la source est copiee, pas un artefact du moteur`() {
        val src = source()
        put(src, "Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md", "double")
        val dest = File(tmp.root, "visible")
        mergeIntoDirectory(FileWorkspaceStorage(src), dest)
        assertTrue(File(dest, "Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md").isFile)
        assertFalse(File(dest, ".stfolder").exists())
        assertFalse(File(dest, "Travail/.syncthing.rdv.md.tmp").exists())
    }

    @Test fun `un fichier a la place d'un dossier fait echouer sans rien perdre`() {
        val src = source()
        val dest = tmp.newFolder("visible")
        put(dest, "Travail", "je suis un fichier")
        val before = snapshot(src)
        try {
            mergeIntoDirectory(FileWorkspaceStorage(src), dest)
            fail("devait échouer")
        } catch (e: MergeFailure) {
            assertTrue(e.message!!.contains("Travail"))
        }
        assertEquals("je suis un fichier", File(dest, "Travail").readText())
        assertEquals(before, snapshot(src))
    }

    @Test fun `une source qui change pendant la copie fait echouer la verification`() {
        val src = source()
        val inner = FileWorkspaceStorage(src)
        var reads = 0
        val changing = object : BinaryWorkspaceStorage by inner {
            override fun openInput(relativePath: String): java.io.InputStream? {
                // La deuxième lecture de rdv.md (la vérification) voit autre chose : la note a été modifiée pendant la copie.
                if (relativePath == "Travail/rdv.md" && ++reads == 2) put(src, "Travail/rdv.md", "modifiée entre-temps")
                return inner.openInput(relativePath)
            }
        }
        try {
            mergeIntoDirectory(changing, File(tmp.root, "visible"))
            fail("devait échouer")
        } catch (e: MergeFailure) {
            assertTrue(e.message!!.contains("a changé"))
        }
        assertEquals("modifiée entre-temps", File(src, "Travail/rdv.md").readText())
    }

    @Test fun `refus de migrer un dossier synchronise ailleurs`() {
        assertTrue(isSyncedElsewhere(true, "com.android.externalstorage.documents"))
        assertTrue(isSyncedElsewhere(false, "com.google.android.apps.docs.storage"))
        assertTrue(isSyncedElsewhere(false, "com.microsoft.skydrive.content.StorageAccessProvider"))
        assertTrue(isSyncedElsewhere(false, "com.dropbox.android.FileProvider"))
        assertFalse(isSyncedElsewhere(false, "com.android.externalstorage.documents"))
        assertFalse(isSyncedElsewhere(false, null))
    }

    @Test fun `le dossier visible recoit marqueur et stignore sans ecraser`() {
        val dest = tmp.newFolder("visible")
        put(dest, ".stignore", "perso\n")
        prepareVisibleFolderForEngine(dest)
        assertTrue(File(dest, ".stfolder").isDirectory)
        assertEquals("perso\n", File(dest, ".stignore").readText())
        assertTrue(File(dest, ".neo-calendar").isDirectory)
    }
}
