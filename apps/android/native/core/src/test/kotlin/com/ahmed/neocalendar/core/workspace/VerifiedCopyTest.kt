package com.ahmed.neocalendar.core.workspace

import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class VerifiedCopyTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun put(root: File, path: String, text: String) {
        val f = File(root, path)
        f.parentFile.mkdirs()
        f.writeBytes(text.toByteArray(Charsets.UTF_8))
    }

    /** Un dossier source réaliste : notes, réglages, pièce jointe binaire, dossier vide, et des artefacts de synchro. */
    private fun sourceTree(): File {
        val root = tmp.newFolder("source")
        put(root, "Travail/rdv.md", "---\ntitle: Réunion\n---\n")
        put(root, "Travail/.attachments/photo.bin", String(ByteArray(5000) { (it % 251).toByte() }, Charsets.ISO_8859_1))
        put(root, ".neo-calendar/.neo-calendar.json", "{\"firstDay\":1}\n")
        File(root, "Perso/vide").mkdirs()
        put(root, ".stfolder/x", "")
        put(root, ".stversions/Travail/ancien.md", "vieux")
        put(root, ".stignore", "*.tmp")
        put(root, "Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md", "double")
        put(root, "Travail/.syncthing.rdv.md.tmp", "partiel")
        return root
    }

    private fun relativeFiles(root: File): List<String> =
        root.walkTopDown().filter { it.isFile }.map { it.relativeTo(root).path.replace('\\', '/') }.sorted().toList()

    @Test fun `la copie reussit, sans les artefacts, et la source reste intacte`() {
        val source = sourceTree()
        val before = relativeFiles(source)
        val dest = tmp.newFolder("dest")
        val report = copyWorkspaceVerified(FileWorkspaceStorage(source), FileWorkspaceStorage(dest))
        assertEquals(
            listOf(".neo-calendar/.neo-calendar.json", "Travail/.attachments/photo.bin", "Travail/rdv.md"),
            relativeFiles(dest),
        )
        assertTrue(File(dest, "Perso/vide").isDirectory)
        assertEquals(3, report.files)
        assertEquals(before, relativeFiles(source))
        assertEquals("---\ntitle: Réunion\n---\n", File(dest, "Travail/rdv.md").readText())
        assertTrue(File(source, "Travail/photo.bin").exists().not())
    }

    /** Enveloppe qui altère ce que `openInput` rend pour un chemin, à partir de la n-ième ouverture. */
    private class Tampered(
        private val inner: BinaryWorkspaceStorage,
        private val path: String,
        private val fromOpen: Int,
        private val alter: (ByteArray) -> ByteArray,
    ) : BinaryWorkspaceStorage by inner {
        private var opens = 0
        override fun openInput(relativePath: String): InputStream? {
            val real = inner.openInput(relativePath) ?: return null
            if (relativePath != path) return real
            opens++
            return if (opens >= fromOpen) ByteArrayInputStream(alter(real.use { it.readBytes() })) else real
        }
    }

    private fun failure(block: () -> Unit): CopyFailure {
        try { block() } catch (e: CopyFailure) { return e }
        fail("la copie aurait dû échouer"); throw IllegalStateException()
    }

    @Test fun `un fichier qui change dans la source pendant la copie fait echouer et vide la destination`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val flaky = Tampered(FileWorkspaceStorage(source), "Travail/rdv.md", fromOpen = 2) { it + 1 }
        val e = failure { copyWorkspaceVerified(flaky, FileWorkspaceStorage(dest)) }
        assertEquals("Travail/rdv.md", e.path)
        assertEquals(0, dest.listFiles()!!.size)
        assertTrue(File(source, "Travail/rdv.md").exists())
    }

    @Test fun `une copie dont le contenu differe est refusee, le fichier est nomme`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val badDestination = Tampered(FileWorkspaceStorage(dest), "Travail/.attachments/photo.bin", fromOpen = 1) { it.also { b -> b[0] = (b[0] + 1).toByte() } }
        val e = failure { copyWorkspaceVerified(FileWorkspaceStorage(source), badDestination) }
        assertEquals("Travail/.attachments/photo.bin", e.path)
        assertTrue(e.message!!.contains("contenu différent"))
        assertEquals(0, dest.listFiles()!!.size)
    }

    @Test fun `une taille differente est refusee`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val truncated = Tampered(FileWorkspaceStorage(dest), "Travail/rdv.md", fromOpen = 1) { it.copyOf(it.size - 1) }
        val e = failure { copyWorkspaceVerified(FileWorkspaceStorage(source), truncated) }
        assertEquals("Travail/rdv.md", e.path)
        assertTrue(e.message!!.contains("taille différente"))
    }

    @Test fun `un fichier illisible dans la source est refuse`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val unreadable = object : BinaryWorkspaceStorage by FileWorkspaceStorage(source) {
            override fun openInput(relativePath: String): InputStream? = if (relativePath == "Travail/rdv.md") null else FileWorkspaceStorage(source).openInput(relativePath)
        }
        val e = failure { copyWorkspaceVerified(unreadable, FileWorkspaceStorage(dest)) }
        assertEquals("Travail/rdv.md", e.path)
        assertEquals(0, dest.listFiles()!!.size)
    }

    @Test fun `un fichier qui apparait ou disparait pendant la copie est refuse`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val fs = FileWorkspaceStorage(source)
        var lists = 0
        val growing = object : BinaryWorkspaceStorage by fs {
            override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
                val real = fs.list(relativeDir)
                // Au deuxième inventaire de la racine, un nouveau fichier est « arrivé ».
                return if (relativeDir == "" && ++lists == 2) real + WorkspaceStorage.Entry("nouveau.md", false) else real
            }
        }
        val e = failure { copyWorkspaceVerified(growing, FileWorkspaceStorage(dest)) }
        assertEquals("nouveau.md", e.path)
    }

    @Test fun `l'echec ne retire de la destination que ce que la copie a cree`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val real = FileWorkspaceStorage(dest)
        val failing = object : BinaryWorkspaceStorage by real {
            override fun writeStream(relativePath: String, input: InputStream) {
                if (relativePath == "Travail/rdv.md") {
                    put(dest, "etranger.md", "arrive entre-temps")
                    throw java.io.IOException("disque plein")
                }
                real.writeStream(relativePath, input)
            }
        }
        val e = failure { copyWorkspaceVerified(FileWorkspaceStorage(source), failing) }
        assertEquals("Travail/rdv.md", e.path)
        assertEquals(listOf("etranger.md"), dest.listFiles()!!.map { it.name })
        assertEquals("arrive entre-temps", File(dest, "etranger.md").readText())
    }

    @Test fun `une destination non vide est refusee sans y toucher`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        put(dest, "deja.md", "la")
        val e = failure { copyWorkspaceVerified(FileWorkspaceStorage(source), FileWorkspaceStorage(dest)) }
        assertEquals("", e.path)
        assertEquals("la", File(dest, "deja.md").readText())
    }
}
