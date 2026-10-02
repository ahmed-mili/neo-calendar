package com.ahmed.neocalendar.core.workspace

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LocalPreferencesAsideTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun notes(withPrefs: Boolean): File {
        val root = tmp.newFolder("Neo Calendar")
        File(root, ".neo-calendar").mkdirs()
        if (withPrefs) File(root, ".neo-calendar/.neo-calendar.json").writeText("""{"colors":1}""")
        return root
    }

    @Test fun `un fichier de reglages local est detecte`() {
        assertTrue(hasLocalPreferences(notes(true)))
    }

    @Test fun `sans fichier de reglages rien n'est detecte`() {
        assertFalse(hasLocalPreferences(notes(false)))
    }

    @Test fun `le fichier est deplace hors du dossier synchronise sous un nom horodate, contenu intact`() {
        val root = notes(true)
        val aside = File(tmp.root, "reglages-mis-de-cote")
        val moved = setAsideLocalPreferences(root, aside, "20261002-071500")!!
        assertEquals("""{"colors":1}""", moved.readText())
        assertEquals("neo-calendar-20261002-071500.json", moved.name)
        assertEquals(aside, moved.parentFile)
        assertFalse("le fichier ne reste pas dans le dossier synchronisé", File(root, ".neo-calendar/.neo-calendar.json").exists())
        assertTrue("le marqueur de dossier reste", File(root, ".neo-calendar").isDirectory)
    }

    @Test fun `sans fichier de reglages il n'y a rien a deplacer`() {
        assertNull(setAsideLocalPreferences(notes(false), File(tmp.root, "x"), "20261002-071500"))
    }

    @Test fun `deux deplacements dans la meme seconde ne s'ecrasent pas`() {
        val root = notes(true)
        val aside = File(tmp.root, "x")
        val first = setAsideLocalPreferences(root, aside, "20261002-071500")!!
        File(root, ".neo-calendar/.neo-calendar.json").writeText("""{"colors":2}""")
        val second = setAsideLocalPreferences(root, aside, "20261002-071500")!!
        assertTrue(first != second)
        assertEquals("""{"colors":1}""", first.readText())
        assertEquals("""{"colors":2}""", second.readText())
    }
}
