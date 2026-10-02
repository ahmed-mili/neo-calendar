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

class NoteCacheFileTest {
    @get:Rule val tmp = TemporaryFolder()

    private val files = mapOf("Cal/a.md" to CachedFile(10L, 3L, "abc"))

    private fun cache() = NoteCacheFile(File(tmp.root, "note-cache.bin"))

    @Test fun `un fichier absent donne une copie vide`() {
        assertEquals(emptyMap<String, CachedFile>(), cache().load("id"))
    }

    @Test fun `enregistrer puis recharger, sans temporaire laisse`() {
        val c = cache()
        c.save("id", files)
        assertEquals(files, c.load("id"))
        assertEquals(listOf("note-cache.bin"), tmp.root.list()!!.toList())
    }

    @Test fun `un second enregistrement remplace le premier`() {
        val c = cache()
        c.save("id", files)
        val other = mapOf("Cal/b.md" to CachedFile(20L, 1L, "z"))
        c.save("id", other)
        assertEquals(other, c.load("id"))
    }

    @Test fun `un autre dossier, un fichier tronque ou des dechets donnent une copie vide`() {
        val c = cache()
        c.save("id", files)
        assertEquals(emptyMap<String, CachedFile>(), c.load("autre"))
        val target = File(tmp.root, "note-cache.bin")
        target.writeBytes(target.readBytes().copyOf(10))
        assertEquals(emptyMap<String, CachedFile>(), c.load("id"))
        target.writeBytes("n'importe quoi".toByteArray())
        assertEquals(emptyMap<String, CachedFile>(), c.load("id"))
    }

    @Test fun `un dossier cible illisible n'a pas d'exception - un repertoire a la place du fichier`() {
        File(tmp.root, "note-cache.bin").mkdir()
        assertEquals(emptyMap<String, CachedFile>(), cache().load("id"))
    }

    @Test fun `une ecriture impossible leve IOException et ne laisse aucun temporaire`() {
        val c = NoteCacheFile(File(File(tmp.root, "absent"), "note-cache.bin"))
        try {
            c.save("id", files)
            fail("une IOException était attendue")
        } catch (e: IOException) {
            assertFalse(File(tmp.root, "absent").exists())
        }
    }

    @Test fun `un echec de remplacement garde l'ancienne copie`() {
        val c = cache()
        c.save("id", files)
        // Un répertoire non vide à la place du temporaire fait échouer l'écriture avant tout renommage.
        File(tmp.root, "note-cache.bin.tmp").apply { mkdir(); File(this, "x").writeText("x") }
        try {
            c.save("id", mapOf("Cal/b.md" to CachedFile(1L, 1L, "b")))
            fail("une IOException était attendue")
        } catch (e: IOException) {
            assertEquals(files, c.load("id"))
        }
        assertTrue(File(tmp.root, "note-cache.bin").isFile)
    }
}
