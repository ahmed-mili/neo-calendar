package com.ahmed.neocalendar.core.workspace

import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.util.Locale

/** Stockage en mémoire : les clés sont des chemins de fichiers, les dossiers se déduisent. */
private class MemoryStorage(private val files: Map<String, String>, private val emptyDirs: Set<String> = emptySet()) : WorkspaceStorage {
    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        val prefix = if (relativeDir.isEmpty()) "" else "$relativeDir/"
        val entries = LinkedHashMap<String, Boolean>()
        for (path in files.keys + emptyDirs.map { "$it/" }) {
            if (!path.startsWith(prefix)) continue
            val rest = path.substring(prefix.length)
            if (rest.isEmpty()) continue
            val slash = rest.indexOf('/')
            if (slash < 0) entries[rest] = false else entries[rest.substring(0, slash)] = true
        }
        // Comme le Java : tri sur le nom en minuscules (Locale.ROOT).
        return entries.map { WorkspaceStorage.Entry(it.key, it.value) }.sortedBy { it.name.lowercase(Locale.ROOT) }
    }

    override fun readText(relativePath: String): String? = files[relativePath]
}

class WorkspaceTest {
    private fun load(vararg files: Pair<String, String>) = loadWorkspace(MemoryStorage(mapOf(*files)))

    // Java l.711 : calendriers = enfants-dossiers sans point initial, dans l'ordre de list (tri minuscules).
    @Test fun calendarsAreTopLevelFoldersWithoutDotSorted() {
        val ws = load("b/x.md" to "", "A/y.md" to "", ".hidden/z.md" to "", "c.md" to "racine")
        assertEquals(listOf("A", "b"), ws.calendars.map { it.relativePath })
        assertEquals(listOf("A", "b"), ws.calendars.map { it.name })
    }

    // Java l.727 : seules les notes .md (extension testée en minuscules) sont lues.
    @Test fun onlyMarkdownNotesAreRead_extensionCaseIgnored() {
        val ws = load("Cal/a.md" to "1", "Cal/b.MD" to "2", "Cal/c.Md" to "3", "Cal/d.txt" to "4", "Cal/e.md.bak" to "5")
        assertEquals(listOf("a.md", "b.MD", "c.Md"), ws.eventFiles.map { it.fileName })
    }

    // Java l.720-724 et 729-731 : sous-dossiers descendus, calendarPath = dossier de tête, relativePath complet.
    @Test fun subfoldersAreDescended_calendarIsTheHeadFolder_fullRelativePath() {
        val ws = load("Cal/ics/lien/n.md" to "corps", "Cal/top.md" to "t")
        val deep = ws.eventFiles.single { it.fileName == "n.md" }
        assertEquals("Cal/ics/lien/n.md", deep.relativePath)
        assertEquals("Cal", deep.calendarPath)
        assertEquals("corps", deep.contents)
        assertEquals(listOf(WorkspaceCalendar("Cal", "Cal")), ws.calendars)
    }

    // Java l.723 : les dossiers à point sont ignorés à tous les niveaux (.attachments, etc.).
    @Test fun dotFoldersAreIgnoredAtEveryLevel() {
        val ws = load("Cal/.attachments/p.md" to "x", "Cal/sous/.cache/q.md" to "x", "Cal/ok.md" to "ok", ".racine/r.md" to "x")
        assertEquals(listOf("Cal/ok.md"), ws.eventFiles.map { it.relativePath })
        assertEquals(listOf("Cal"), ws.calendars.map { it.relativePath })
    }

    // Java l.711 (calendars.length()==0) : racine sans dossier, calendrier "" / Default avec les .md de la racine.
    @Test fun rootWithoutFolderGivesDefaultCalendarWithRootNotes() {
        val ws = load("z.md" to "Z", "a.MD" to "A", "n.txt" to "x")
        assertEquals(listOf(WorkspaceCalendar("", "Default")), ws.calendars)
        assertEquals(listOf("a.MD", "z.md"), ws.eventFiles.map { it.relativePath })
        assertTrue(ws.eventFiles.all { it.calendarPath == "" })
        assertEquals("A", ws.eventFiles[0].contents)
    }

    // Java l.711 : seuls des dossiers à point à la racine ne font pas de calendrier, donc Default.
    @Test fun rootWithOnlyDotFoldersIsDefault() {
        val ws = load(".attachments/p.md" to "x", "n.md" to "n")
        assertEquals(listOf(WorkspaceCalendar("", "Default")), ws.calendars)
        assertEquals(listOf("n.md"), ws.eventFiles.map { it.relativePath })
    }

    // Java l.711 : dès qu'un calendrier existe, les notes de la racine ne sont plus lues.
    @Test fun rootNotesAreIgnoredOnceACalendarExists() {
        val ws = load("Cal/a.md" to "a", "racine.md" to "r")
        assertEquals(listOf("Cal/a.md"), ws.eventFiles.map { it.relativePath })
    }

    // Java l.738-741 : .neo-calendar/.neo-calendar.json, puis .neo-calendar.json, puis .neo-calendar-desktop.json.
    @Test fun preferencesSearchOrder() {
        fun prefs(vararg f: Pair<String, String>) = load(*f).preferences["from"]
        val all = arrayOf(
            ".neo-calendar/.neo-calendar.json" to """{"from":"meta"}""",
            ".neo-calendar.json" to """{"from":"root"}""",
            ".neo-calendar-desktop.json" to """{"from":"legacy"}""",
        )
        assertEquals(JsonPrimitive("meta"), prefs(*all))
        assertEquals(JsonPrimitive("root"), prefs(all[1], all[2]))
        assertEquals(JsonPrimitive("legacy"), prefs(all[2]))
    }

    // Java l.739-740 : dossier .neo-calendar présent mais sans le fichier, on retombe sur la racine.
    @Test fun metadataFolderWithoutFileFallsBackToRoot() {
        val ws = load(".neo-calendar/autre.txt" to "x", ".neo-calendar.json" to """{"from":"root"}""")
        assertEquals(JsonPrimitive("root"), ws.preferences["from"])
    }

    // Java l.742 : aucun fichier de préférences, objet vide.
    @Test fun missingPreferencesGiveEmptyObject() {
        assertTrue(load("Cal/a.md" to "a").preferences.isEmpty())
    }

    // Java l.744 : fichier vide ou blanc, objet vide.
    @Test fun blankPreferencesFileGivesEmptyObject() {
        assertTrue(load(".neo-calendar.json" to "").preferences.isEmpty())
        assertTrue(load(".neo-calendar.json" to " \n\t ").preferences.isEmpty())
    }

    // Java l.745-746 : JSON corrompu, exception au texte "Le fichier de preferences est illisible: ...".
    @Test fun corruptPreferencesThrowWithExactPrefix() {
        for (raw in listOf("{pas du json", "[1,2]", "42")) {
            try {
                load(".neo-calendar.json" to raw)
                fail("attendu : UnreadablePreferencesException pour $raw")
            } catch (e: UnreadablePreferencesException) {
                assertTrue(e.message!!, e.message!!.startsWith("Le fichier de preferences est illisible: "))
                assertTrue(e.message!!.length > "Le fichier de preferences est illisible: ".length)
            }
        }
    }
}
