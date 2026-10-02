package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class CachedWorkspaceStorageTest {
    private fun tree() = CountingStorage()
        .put("Cal/a.md", "alpha")
        .put("Cal/b.md", "bravo")
        .put("Cal/c.md", "charlie")

    /** La copie telle qu'une première passe la laisse. */
    private fun warm(s: CountingStorage): Map<String, CachedFile> {
        val c = CachedWorkspaceStorage(s)
        loadWorkspace(c)
        return c.snapshot()
    }

    @Test fun `sans copie tout est lu et la copie garde les trois notes`() {
        val s = tree()
        val c = CachedWorkspaceStorage(s)
        val loaded = loadWorkspace(c)
        assertEquals(3, s.noteReads())
        assertEquals(listOf("alpha", "bravo", "charlie"), loaded.eventFiles.map { it.contents })
        assertEquals(setOf("Cal/a.md", "Cal/b.md", "Cal/c.md"), c.snapshot().keys)
        assertEquals(CachedFile(1000L, 5L, "alpha"), c.snapshot().getValue("Cal/a.md"))
        assertTrue(c.changed)
    }

    @Test fun `date et taille identiques - aucune lecture, meme resultat, rien a ecrire`() {
        val s = tree()
        val copy = warm(s)
        val before = s.noteReads()
        val c = CachedWorkspaceStorage(s, copy)
        val loaded = loadWorkspace(c)
        assertEquals(before, s.noteReads())
        assertEquals(loadWorkspace(tree()), loaded)
        assertFalse(c.changed)
    }

    @Test fun `le listage reste toujours demande au stockage reel`() {
        val s = tree()
        val copy = warm(s)
        val calls = s.listCalls.get()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(calls * 2, s.listCalls.get())
    }

    @Test fun `la date change - ce seul fichier est relu`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/b.md").apply { text = "bravo2"; lastModified = 2000L; size = 6L }
        val before = s.noteReads()
        val c = CachedWorkspaceStorage(s, copy)
        val loaded = loadWorkspace(c)
        assertEquals(1, s.noteReads() - before)
        assertEquals("bravo2", loaded.eventFiles[1].contents)
        assertEquals("bravo2", c.snapshot().getValue("Cal/b.md").text)
        assertTrue(c.changed)
    }

    @Test fun `la taille change avec la meme date - le fichier est relu`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/a.md").apply { text = "alpha plus long"; size = 15L }
        val c = CachedWorkspaceStorage(s, copy)
        assertEquals("alpha plus long", loadWorkspace(c).eventFiles[0].contents)
    }

    @Test fun `une date plus ancienne que la copie est relue aussi - c'est une egalite, pas un plus recent`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/c.md").apply { text = "charlie2"; lastModified = 10L; size = 8L }
        val c = CachedWorkspaceStorage(s, copy)
        assertEquals("charlie2", loadWorkspace(c).eventFiles[2].contents)
    }

    @Test fun `meme date et meme taille - la copie sert (limite connue, celle de Syncthing)`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/a.md").text = "ALPHA" // 5 octets, date inchangée
        assertEquals("alpha", loadWorkspace(CachedWorkspaceStorage(s, copy)).eventFiles[0].contents)
    }

    @Test fun `une date inconnue est toujours relue et jamais gardee`() {
        val s = tree().put("Cal/u.md", "inconnu", lastModified = 0L)
        val copy = warm(s)
        assertFalse("Cal/u.md" in copy)
        val before = s.noteReads()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(1, s.noteReads() - before)
    }

    @Test fun `une taille inconnue est toujours relue et jamais gardee`() {
        val s = tree().put("Cal/u.md", "inconnu", size = -1L)
        val copy = warm(s)
        assertFalse("Cal/u.md" in copy)
        val before = s.noteReads()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(1, s.noteReads() - before)
    }

    @Test fun `un fichier disparu sort de la copie`() {
        val s = tree()
        val copy = warm(s)
        s.files.remove("Cal/c.md")
        val c = CachedWorkspaceStorage(s, copy)
        assertEquals(2, loadWorkspace(c).eventFiles.size)
        assertEquals(setOf("Cal/a.md", "Cal/b.md"), c.snapshot().keys)
        assertTrue(c.changed)
    }

    @Test fun `un fichier non liste est lu au stockage reel a chaque fois et jamais garde`() {
        val s = tree().put("Cal/.neo-calendar/x.json", "{}")
        val c = CachedWorkspaceStorage(s, emptyMap())
        assertEquals("{}", c.readText("Cal/.neo-calendar/x.json"))
        assertEquals("{}", c.readText("Cal/.neo-calendar/x.json"))
        assertEquals(2, s.reads.getValue("Cal/.neo-calendar/x.json").get())
        assertFalse("Cal/.neo-calendar/x.json" in c.snapshot())
        assertNull(c.readText("n'existe/pas.md"))
    }

    @Test fun `un fichier liste qui disparait avant sa lecture rend null et n'est pas garde`() {
        val s = tree()
        val c = CachedWorkspaceStorage(s, emptyMap())
        c.list("Cal")
        s.unreadable += "Cal/b.md"
        assertNull(c.readText("Cal/b.md"))
        assertFalse("Cal/b.md" in c.snapshot())
    }

    @Test fun `seuls les fichiers lus sont gardes`() {
        val s = tree().put("Cal/notes.txt", "pas une note")
        val c = CachedWorkspaceStorage(s, emptyMap())
        loadWorkspace(c)
        assertFalse("Cal/notes.txt" in c.snapshot())
    }

    private fun many(delay: Long) = CountingStorage(delay).apply {
        for (i in 0 until 24) put("Cal${i % 3}/n${"%02d".format(i)}.md", "texte $i")
    }

    @Test fun `la lecture parallele rend exactement le resultat de la serie, 4 fils au plus`() {
        val serial = loadWorkspace(many(0L))
        val s = many(25L)
        val c = CachedWorkspaceStorage(s)
        val loaded = loadWorkspace(c)
        assertEquals(serial, loaded)
        assertEquals(24, s.noteReads())
        assertTrue("pic = ${s.peak.get()}", s.peak.get() in 2..4)
    }

    @Test fun `parallelism 1 lit en serie`() {
        val s = many(5L)
        loadWorkspace(CachedWorkspaceStorage(s, parallelism = 1))
        assertEquals(1, s.peak.get())
    }

    @Test fun `deux fichiers illisibles en parallele - l'erreur est celle du premier dans l'ordre de la serie`() {
        val s = many(10L)
        s.unreadable += "Cal2/n20.md"
        s.unreadable += "Cal0/n03.md"
        try {
            loadWorkspace(CachedWorkspaceStorage(s))
            fail("une erreur était attendue")
        } catch (e: IOException) {
            // Ordre de la série : Cal0 avant Cal2.
            assertTrue(e.message, e.message!!.contains("Cal0/n03.md"))
        }
    }

    @Test fun `deuxieme passe sur 24 notes - plus aucune lecture`() {
        val s = many(0L)
        val copy = CachedWorkspaceStorage(s).also { loadWorkspace(it) }.snapshot()
        val before = s.noteReads()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(before, s.noteReads())
    }
}
