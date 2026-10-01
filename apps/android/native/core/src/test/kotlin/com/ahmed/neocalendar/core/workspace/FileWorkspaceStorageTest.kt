package com.ahmed.neocalendar.core.workspace

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileWorkspaceStorageTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun storage() = FileWorkspaceStorage(tmp.root)

    private fun leftovers(): List<String> =
        tmp.root.walkTopDown().filter { it.name.startsWith(".neo-tmp-") }.map { it.name }.toList()

    @Test fun `lecture d'un fichier absent rend null et la liste d'un dossier absent est vide`() {
        assertNull(storage().readText("rien.md"))
        assertTrue(storage().list("nulle part").isEmpty())
    }

    @Test fun `creer puis ecrire puis lire, accents compris`() {
        val s = storage()
        val dir = s.createDirectory("", "Travail")
        val path = s.createFile(dir, "rdv.md", "text/markdown")
        s.writeText(path, "Réunion à 14 h\n")
        assertEquals("Travail/rdv.md", path)
        assertEquals("Réunion à 14 h\n", s.readText(path))
        assertEquals(listOf("rdv.md"), s.list("Travail").map { it.name })
    }

    @Test fun `la liste est triee comme le SAF, en minuscules`() {
        val s = storage()
        for (n in listOf("b", "A", "c")) s.createDirectory("", n)
        assertEquals(listOf("A", "b", "c"), s.list("").map { it.name })
    }

    @Test fun `ecrire remplace tout le contenu et ne laisse aucun temporaire`() {
        val s = storage()
        s.createFile("", "n.md", "text/markdown")
        s.writeText("n.md", "un texte assez long")
        s.writeText("n.md", "court")
        assertEquals("court", s.readText("n.md"))
        assertEquals(emptyList<String>(), leftovers())
    }

    @Test fun `une ecriture interrompue laisse l'ancien contenu et aucun temporaire`() {
        val s = storage()
        s.createFile("", "n.md", "text/markdown")
        s.writeText("n.md", "ancien")
        val broken = object : InputStream() {
            var served = 0
            override fun read(): Int = throw IOException("coupure")
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (served++ == 0) { b[off] = 'x'.code.toByte(); return 1 }
                throw IOException("coupure")
            }
        }
        try { s.writeStream("n.md", broken); fail("aurait dû échouer") } catch (_: IOException) {}
        assertEquals("ancien", s.readText("n.md"))
        assertEquals(emptyList<String>(), leftovers())
    }

    @Test fun `ecrire dans un fichier absent echoue sans rien creer`() {
        try { storage().writeText("absent.md", "x"); fail() } catch (_: IOException) {}
        assertEquals(0, tmp.root.listFiles()!!.size)
    }

    @Test fun `un nom deja pris est refuse`() {
        val s = storage()
        s.createFile("", "a.md", "text/markdown")
        try { s.createFile("", "a.md", "text/markdown"); fail() } catch (_: IOException) {}
        try { s.createDirectory("", "a.md"); fail() } catch (_: IOException) {}
    }

    @Test fun `renommer garde le contenu et refuse un nom pris`() {
        val s = storage()
        s.createFile("", "a.md", "text/markdown"); s.writeText("a.md", "A")
        s.createFile("", "b.md", "text/markdown")
        assertEquals("c.md", s.rename("a.md", "c.md"))
        assertEquals("A", s.readText("c.md"))
        assertNull(s.readText("a.md"))
        try { s.rename("c.md", "b.md"); fail() } catch (_: IOException) {}
    }

    @Test fun `supprimer un fichier ou un dossier`() {
        val s = storage()
        s.createDirectory("", "d"); s.createFile("d", "x.md", "text/markdown")
        s.delete("d/x.md"); assertTrue(s.list("d").isEmpty())
        s.delete("d"); assertFalse(File(tmp.root, "d").exists())
        s.delete("deja-absent")
    }

    @Test fun `un chemin qui remonte est refuse`() {
        try { storage().readText("../secret"); fail() } catch (_: IllegalArgumentException) {}
        try { storage().list("a/../.."); fail() } catch (_: IllegalArgumentException) {}
    }

    @Test fun `les octets font l'aller-retour`() {
        val s = storage()
        s.createFile("", "p.bin", "application/octet-stream")
        val bytes = ByteArray(300_000) { (it * 31).toByte() }
        s.writeStream("p.bin", ByteArrayInputStream(bytes))
        assertTrue(bytes.contentEquals(s.openInput("p.bin")!!.use { it.readBytes() }))
        assertNull(s.openInput("absent"))
    }

    @Test fun `un nom qui est un chemin est refuse et rien n'est cree hors de la racine`() {
        val s = FileWorkspaceStorage(File(tmp.root, "notes").also { it.mkdir() })
        s.createFile("", "a.md", "text/markdown")
        for (bad in listOf("", ".", "..", "../x", "a/b", "a\\b", "../../x.md")) {
            try { s.createFile("", bad, "text/markdown"); fail("createFile $bad") } catch (_: IllegalArgumentException) {}
            try { s.createDirectory("", bad); fail("createDirectory $bad") } catch (_: IllegalArgumentException) {}
            try { s.rename("a.md", bad); fail("rename $bad") } catch (_: IllegalArgumentException) {}
        }
        assertEquals(listOf("notes"), tmp.root.list()!!.toList())
        assertEquals(listOf("a.md"), File(tmp.root, "notes").list()!!.toList())
    }

    @Test fun `supprimer la racine est refuse`() {
        val s = storage()
        s.createFile("", "a.md", "text/markdown")
        for (bad in listOf("", ".", "x/..")) {
            try { s.delete(bad); fail("delete $bad") } catch (_: IllegalArgumentException) {}
        }
        assertTrue(File(tmp.root, "a.md").exists())
    }

    @Test fun `renommer la racine est refuse`() {
        val s = storage()
        for (bad in listOf("", ".")) {
            try { s.rename(bad, "autre"); fail("rename $bad") } catch (_: IllegalArgumentException) {}
        }
        assertTrue(tmp.root.exists())
    }
}
