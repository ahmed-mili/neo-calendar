package com.ahmed.neocalendar.core.workspace

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class WorkspaceWriterTest {
    // Java validName : espaces rognés, pas de séparateur, pas de . ni .., et .md pour une note.
    @Test fun validNameRules() {
        assertEquals("a.md", validName("  a.md ", true))
        assertEquals("Essai", validName("Essai", false))
        for (bad in listOf("", "  ", ".", "..", "a/b.md", "a\\b.md")) {
            try {
                validName(bad, true)
                fail("accepté : '$bad'")
            } catch (e: IllegalArgumentException) {
                assertTrue(e.message!!.startsWith("Nom invalide: "))
            }
        }
        try {
            validName("note.txt", true)
            fail()
        } catch (e: IllegalArgumentException) {
            assertEquals("Le fichier doit finir par .md", e.message)
        }
        assertEquals("NOTE.MD", validName("NOTE.MD", true))
    }

    // Java uniqueName : « nom (1).ext », le point initial n'est pas une extension.
    @Test fun uniqueNameNumbersBeforeTheExtension() {
        val tree = MemoryTree().file("Cal/a.md").file("Cal/a (1).md").file("Cal/.cache").file("Cal/n")
        assertEquals("b.md", uniqueName(tree, "Cal", "b.md"))
        assertEquals("a (2).md", uniqueName(tree, "Cal", "a.md"))
        assertEquals(".cache (1)", uniqueName(tree, "Cal", ".cache"))
        assertEquals("n (1)", uniqueName(tree, "Cal", "n"))
    }

    // Java findPath : « .. » refusé, « . » et parties vides ignorés, « \ » vaut « / », absent = null.
    @Test fun findPathRefusesParentAndNormalises() {
        val tree = MemoryTree().file("Cal/sous/a.md")
        assertEquals("Cal/sous/a.md", findPath(tree, "Cal/sous/a.md"))
        assertEquals("Cal/sous/a.md", findPath(tree, "Cal\\sous\\a.md"))
        assertEquals("Cal/sous/a.md", findPath(tree, "./Cal//sous/./a.md"))
        assertEquals("", findPath(tree, ""))
        assertNull(findPath(tree, "Cal/absent.md"))
        assertNull(findPath(tree, "Autre/a.md"))
        try {
            findPath(tree, "Cal/../a.md")
            fail()
        } catch (e: IllegalArgumentException) {
            assertEquals("Chemin invalide", e.message)
        }
        try {
            findPath(tree, "..")
            fail()
        } catch (e: IllegalArgumentException) {
            assertEquals("Chemin invalide", e.message)
        }
    }

    @Test fun creatingANewNoteWritesANewFile() {
        val tree = MemoryTree().dir("Essai Compose")
        val path = writeEvent(tree, "Essai Compose", "2026-10-01 Test.md", "", "contenu")
        assertEquals("Essai Compose/2026-10-01 Test.md", path)
        assertEquals("contenu", tree.files[path])
    }

    @Test fun aNoteAtTheRootHasNoCalendarPrefix() {
        val tree = MemoryTree()
        assertEquals("Note.md", writeEvent(tree, "", "Note.md", "", "x"))
        assertEquals("x", tree.files["Note.md"])
    }

    // Java l.786 : un nom déjà pris et aucun ancien fichier = on écrit par-dessus.
    @Test fun aNewNoteWithATakenNameAndNoPreviousOverwritesIt() {
        val tree = MemoryTree().file("Cal/a.md", "ancien")
        assertEquals("Cal/a.md", writeEvent(tree, "Cal", "a.md", "", "neuf"))
        assertEquals("neuf", tree.files["Cal/a.md"])
        assertEquals(1, tree.files.size)
    }

    // Java l.778 : même dossier, même nom = écriture en place, sans renommage.
    @Test fun sameFolderSameNameWritesInPlace() {
        val tree = MemoryTree().file("Cal/a.md", "ancien")
        assertEquals("Cal/a.md", writeEvent(tree, "Cal", "a.md", "Cal/a.md", "neuf"))
        assertEquals("neuf", tree.files["Cal/a.md"])
        assertTrue(tree.log.none { it.startsWith("rename") || it.startsWith("create") || it.startsWith("delete") })
    }

    // Java l.779-782 : même dossier, nouveau nom libre = renommage puis écriture.
    @Test fun sameFolderNewNameRenamesThenWrites() {
        val tree = MemoryTree().file("Cal/a.md", "ancien")
        assertEquals("Cal/b.md", writeEvent(tree, "Cal", "b.md", "Cal/a.md", "neuf"))
        assertFalse("Cal/a.md" in tree.files)
        assertEquals("neuf", tree.files["Cal/b.md"])
        assertEquals(listOf("rename Cal/a.md -> b.md", "write Cal/b.md"), tree.log)
    }

    // Java l.779 : le nouveau nom est celui d'une autre note = « nom (1).md », l'autre note reste.
    @Test fun sameFolderRenameOntoAnotherNoteGetsANumber() {
        val tree = MemoryTree().file("Cal/a.md", "A").file("Cal/b.md", "B")
        assertEquals("Cal/b (1).md", writeEvent(tree, "Cal", "b.md", "Cal/a.md", "neuf"))
        assertEquals("B", tree.files["Cal/b.md"])
        assertEquals("neuf", tree.files["Cal/b (1).md"])
        assertFalse("Cal/a.md" in tree.files)
    }

    // Java l.787-791 : changement de calendrier = nouveau fichier écrit, puis ancien supprimé.
    @Test fun movingToAnotherCalendarCreatesWritesThenDeletes() {
        val tree = MemoryTree().file("A/n.md", "ancien").dir("B")
        assertEquals("B/n.md", writeEvent(tree, "B", "n.md", "A/n.md", "neuf"))
        assertEquals("neuf", tree.files["B/n.md"])
        assertFalse("A/n.md" in tree.files)
        assertEquals(listOf("create B/n.md", "write B/n.md", "delete A/n.md"), tree.log)
    }

    @Test fun movingOntoATakenNameGetsANumber() {
        val tree = MemoryTree().file("A/n.md", "ancien").file("B/n.md", "autre")
        assertEquals("B/n (1).md", writeEvent(tree, "B", "n.md", "A/n.md", "neuf"))
        assertEquals("autre", tree.files["B/n.md"])
        assertEquals("neuf", tree.files["B/n (1).md"])
        assertFalse("A/n.md" in tree.files)
    }

    // « Une interruption laisse un doublon, jamais une perte » : si l'écriture échoue, l'ancien fichier est encore là.
    @Test fun aFailedWriteWhileMovingKeepsTheOldNote() {
        val tree = MemoryTree().file("A/n.md", "ancien").dir("B")
        tree.failWritesTo = "B/n.md"
        try {
            writeEvent(tree, "B", "n.md", "A/n.md", "neuf")
            fail()
        } catch (_: java.io.IOException) {
        }
        assertEquals("ancien", tree.files["A/n.md"])
    }

    // Une note déplacée vers ou depuis la racine.
    @Test fun movingFromAndToTheRoot() {
        val tree = MemoryTree().file("n.md", "ancien").dir("B")
        assertEquals("B/n.md", writeEvent(tree, "B", "n.md", "n.md", "neuf"))
        assertFalse("n.md" in tree.files)
        assertEquals("n.md", writeEvent(tree, "", "n.md", "B/n.md", "neuf2"))
        assertEquals("neuf2", tree.files["n.md"])
        assertFalse("B/n.md" in tree.files)
    }

    @Test fun unknownCalendarIsAnError() {
        val tree = MemoryTree().dir("Cal")
        try {
            writeEvent(tree, "Absent", "n.md", "", "x")
            fail()
        } catch (e: IllegalStateException) {
            assertEquals("Calendrier introuvable: Absent", e.message)
        }
    }

    @Test fun invalidFileNamesAndPathsAreRefused() {
        val tree = MemoryTree().dir("Cal")
        for (bad in listOf("a/b.md", "..", "n.txt", "")) {
            try {
                writeEvent(tree, "Cal", bad, "", "x")
                fail("accepté : '$bad'")
            } catch (_: IllegalArgumentException) {
            }
        }
        try {
            writeEvent(tree, "Cal/..", "n.md", "", "x")
            fail()
        } catch (e: IllegalArgumentException) {
            assertEquals("Chemin invalide", e.message)
        }
        assertTrue(tree.files.isEmpty())
    }

    @Test fun deleteEventRemovesTheNoteAndIgnoresAMissingOne() {
        val tree = MemoryTree().file("Cal/n.md", "x")
        deleteEvent(tree, "Cal/absent.md")
        assertTrue("Cal/n.md" in tree.files)
        deleteEvent(tree, "Cal/n.md")
        assertFalse("Cal/n.md" in tree.files)
    }

    @Test fun foldersAreCreatedRenamedAndDeletedWhenEmpty() {
        val tree = MemoryTree()
        assertEquals("Essai Compose", createFolder(tree, " Essai Compose "))
        try {
            createFolder(tree, "Essai Compose")
            fail()
        } catch (e: IllegalStateException) {
            assertEquals("Un dossier portant ce nom existe deja.", e.message)
        }
        assertEquals("Essai", renameFolder(tree, "Essai Compose", "Essai"))
        assertTrue("Essai" in tree.dirs)
        tree.file("Essai/n.md")
        try {
            deleteFolder(tree, "Essai")
            fail()
        } catch (e: IllegalStateException) {
            assertEquals("Ce calendrier nest pas vide.", e.message)
        }
        deleteEvent(tree, "Essai/n.md")
        deleteFolder(tree, "Essai")
        assertFalse("Essai" in tree.dirs)
        deleteFolder(tree, "Essai")
    }

    // Java savePreferences : le fichier dans .neo-calendar/, les anciens emplacements de la racine retirés.
    @Test fun preferencesGoInTheMetadataFolderAndLegacyFilesAreRemoved() {
        val tree = MemoryTree().file(".neo-calendar.json", "ancien").file(".neo-calendar-desktop.json", "plus ancien")
        savePreferences(tree, "{}\n")
        assertEquals("{}\n", tree.files[".neo-calendar/.neo-calendar.json"])
        assertFalse(".neo-calendar.json" in tree.files)
        assertFalse(".neo-calendar-desktop.json" in tree.files)
        savePreferences(tree, "{\"a\": 1}\n")
        assertEquals("{\"a\": 1}\n", tree.files[".neo-calendar/.neo-calendar.json"])
    }

    // Correctif 1 : la note précédente a disparu (Syncthing) : rien n'est écrit, rien n'est recréé.
    @Test fun aMissingPreviousNoteIsNeverRecreated() {
        val tree = MemoryTree().dir("Cal")
        try {
            writeEvent(tree, "Cal", "b.md", "Cal/a.md", "neuf")
            fail()
        } catch (e: NoteMovedException) {
            assertEquals("Cette note a été déplacée ou supprimée ailleurs. Rechargez et recommencez.", e.message)
        }
        assertTrue(tree.files.isEmpty())
        assertTrue(tree.log.isEmpty())
    }

    // Correctif 1 : le nouveau nom est celui d'une autre note (la note renommée sur le PC) : elle n'est pas écrasée.
    @Test fun aMissingPreviousNoteDoesNotOverwriteAnotherNote() {
        val tree = MemoryTree().file("Cal/b.md", "celle du PC")
        try {
            writeEvent(tree, "Cal", "b.md", "Cal/a.md", "neuf")
            fail()
        } catch (_: NoteMovedException) {
        }
        assertEquals("celle du PC", tree.files["Cal/b.md"])
        assertEquals(1, tree.files.size)
    }

    // Correctif 3 : une note rangée dans un sous-dossier du calendrier y reste, même renommée.
    @Test fun aNoteInASubfolderStaysThere() {
        val tree = MemoryTree().file("Perso/Archives/x.md", "ancien")
        assertEquals("Perso/Archives/x.md", writeEvent(tree, "Perso", "x.md", "Perso/Archives/x.md", "neuf"))
        assertEquals("neuf", tree.files["Perso/Archives/x.md"])
        assertEquals("Perso/Archives/y.md", writeEvent(tree, "Perso", "y.md", "Perso/Archives/x.md", "neuf2"))
        assertEquals(setOf("Perso/Archives/y.md"), tree.files.keys)
    }

    // Correctif 3 : seul un changement de calendrier la déplace, à la racine du nouveau.
    @Test fun aNoteInASubfolderMovesToTheRootOfAnotherCalendar() {
        val tree = MemoryTree().file("Perso/Archives/x.md", "ancien").dir("Travail")
        assertEquals("Travail/x.md", writeEvent(tree, "Travail", "x.md", "Perso/Archives/x.md", "neuf"))
        assertEquals(setOf("Travail/x.md"), tree.files.keys)
    }

    // Correctif 4 : l'écriture échoue après la création : pas de fichier vide laissé, l'ancienne note reste.
    @Test fun aFailedWriteRemovesTheEmptyFileItCreated() {
        val tree = MemoryTree().file("A/n.md", "ancien").dir("B")
        tree.failWritesTo = "B/n.md"
        try {
            writeEvent(tree, "B", "n.md", "A/n.md", "neuf")
            fail()
        } catch (_: java.io.IOException) {
        }
        assertEquals(setOf("A/n.md"), tree.files.keys)
        assertEquals("ancien", tree.files["A/n.md"])
    }
}
