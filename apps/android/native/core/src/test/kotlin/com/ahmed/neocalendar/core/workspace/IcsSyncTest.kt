package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.ics.EmptySnapshotException
import com.ahmed.neocalendar.core.ics.IcsFeed
import com.ahmed.neocalendar.core.ics.IcsLink
import com.ahmed.neocalendar.core.ics.IcsSyncState
import com.ahmed.neocalendar.core.ics.parseIcsSnapshot
import com.ahmed.neocalendar.core.ics.planIcsNoteSync
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private val NOW = Instant.parse("2026-10-01T10:00:00Z")
private val NEVER = IcsSyncState(null, null, 0, emptyMap())
private val LINK = IcsLink("feed-1", "Etudes", "Planning Test", "https://example.com/p.ics", null, true, null, null)

private fun vevent(uid: String, start: String, end: String, summary: String, extra: String = "") =
    "BEGIN:VEVENT\r\nUID:$uid\r\nDTSTAMP:20260901T000000Z\r\nDTSTART:$start\r\nDTEND:$end\r\nSUMMARY:$summary\r\n${extra}END:VEVENT\r\n"

private fun ics(vararg events: String) = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${events.joinToString("")}END:VCALENDAR\r\n"

private val COURSES = ics(
    vevent("u1", "20261005T060000Z", "20261005T073000Z", "Cours A"),
    vevent("u2", "20261006T060000Z", "20261006T073000Z", "Cours B"),
)

private fun linkNotes(tree: MemoryTree, dir: String = "Etudes/Planning Test") =
    tree.files.keys.filter { it.startsWith("$dir/") }.sorted()

private const val PERSONAL = "---\ntitle: \"Perso\"\nallDay: false\nstartTime: \"09:00\"\nendTime: \"10:00\"\ntype: \"single\"\ndate: \"2026-10-05\"\nendDate: null\n---\nA moi\n"

class IcsSyncTest {
    /** Ce que le planificateur du noyau écrirait pour ce flux sur ce dossier vide. */
    private fun planned(text: String, directory: String) =
        planIcsNoteSync(IcsFeed("feed-1", "Etudes", directory), parseIcsSnapshot(text, "2025-10-01", "2028-10-01"), emptyList(), NEVER, NOW)

    @Test fun firstSyncCreatesTheLinkFolderAndWritesTheCoreText() {
        val tree = MemoryTree().dir("Etudes")
        val applied = applyIcsDownload(tree, LINK, COURSES, NEVER, NOW)
        assertEquals("Etudes/Planning Test", applied.provisionedDirectory)
        assertEquals(2, applied.written)
        val expected = planned(COURSES, "Etudes/Planning Test").writes
        assertEquals(expected.map { "Etudes/Planning Test/${it.fileName}" }.sorted(), linkNotes(tree))
        for (write in expected) assertEquals(write.contents, tree.files["Etudes/Planning Test/${write.fileName}"])
        assertEquals(2L, applied.state.knownEventCount)
        assertEquals(null, applied.state.lastError)
    }

    @Test fun secondSyncWritesNothing() {
        val tree = MemoryTree().dir("Etudes")
        val first = applyIcsDownload(tree, LINK, COURSES, NEVER, NOW)
        tree.log.clear()
        val second = applyIcsDownload(tree, LINK.copy(directory = first.provisionedDirectory), COURSES, first.state, NOW)
        assertEquals(0, second.written)
        assertEquals(null, second.provisionedDirectory)
        assertTrue(tree.log.toString(), tree.log.isEmpty())
    }

    @Test fun aChangedOccurrenceRewritesItsOwnNote() {
        val tree = MemoryTree().dir("Etudes")
        val first = applyIcsDownload(tree, LINK, COURSES, NEVER, NOW)
        val moved = ics(
            vevent("u1", "20261005T060000Z", "20261005T073000Z", "Cours A"),
            vevent("u2", "20261006T060000Z", "20261006T090000Z", "Cours B"),
        )
        val second = applyIcsDownload(tree, LINK.copy(directory = first.provisionedDirectory), moved, first.state, NOW)
        assertEquals(1, second.written)
        assertEquals(2, linkNotes(tree).size)
    }

    // Un nom pris par une note personnelle du dossier du lien : elle n'est pas écrasée, la séance prend « (1) ».
    @Test fun aPersonalNoteWithTheSameNameInTheLinkFolderIsNeverOverwritten() {
        val name = planned(COURSES, "Etudes/Planning Test").writes.first().fileName
        val tree = MemoryTree().file("Etudes/Planning Test/$name", PERSONAL)
        val applied = applyIcsDownload(tree, LINK.copy(directory = "Etudes/Planning Test"), COURSES, NEVER, NOW)
        assertEquals(PERSONAL, tree.files["Etudes/Planning Test/$name"])
        assertEquals(2, applied.written)
        assertEquals(3, linkNotes(tree).size)
        assertTrue(linkNotes(tree).any { it.endsWith("${name.removeSuffix(".md")} (1).md") })
    }

    // Un flux qui se vide d'un coup : rien n'est écrit ni supprimé, l'erreur est notée sur le lien.
    @Test fun anEmptiedFeedKeepsEveryNoteAndRecordsTheError() {
        val tree = MemoryTree().dir("Etudes")
        val first = applyIcsDownload(tree, LINK, COURSES, NEVER, NOW)
        val before = HashMap(tree.files)
        tree.log.clear()
        val linked = LINK.copy(directory = first.provisionedDirectory)
        try {
            applyIcsDownload(tree, linked, ics(), first.state, NOW)
            fail("l'instantané vide d'un lien peuplé doit être refusé")
        } catch (e: EmptySnapshotException) {
            val failed = failedIcsState(first.state, NOW, describeIcsFailure(e))
            assertEquals(first.state.lastSuccessAt, failed.lastSuccessAt)
            assertEquals(2L, failed.knownEventCount)
            assertTrue(failed.lastError!!.contains("notes sont conservées"))
        }
        assertEquals(before, HashMap(tree.files))
        assertTrue(tree.log.isEmpty())
    }

    @Test fun aCancelledOccurrenceDeletesOnlyTheNoteThisLinkOwns() {
        val tree = MemoryTree().dir("Etudes").file("Etudes/Planning Test/2026-10-07 Perso.md", PERSONAL)
        val first = applyIcsDownload(tree, LINK.copy(directory = "Etudes/Planning Test"), COURSES, NEVER, NOW)
        val other = tree.files.entries.first { it.key.contains("Cours A") }.value.replace("feed-1", "feed-other")
        tree.file("Etudes/Planning Test/autre-lien.md", other)
        val cancelled = ics(
            vevent("u1", "20261005T060000Z", "20261005T073000Z", "Cours A", "STATUS:CANCELLED\r\n"),
            vevent("u2", "20261006T060000Z", "20261006T073000Z", "Cours B"),
        )
        val second = applyIcsDownload(tree, LINK.copy(directory = "Etudes/Planning Test"), cancelled, first.state, NOW)
        assertEquals(1, second.deleted)
        assertFalse(linkNotes(tree).any { it.contains("Cours A") })
        assertTrue(tree.files.containsKey("Etudes/Planning Test/2026-10-07 Perso.md"))
        assertTrue(tree.files.containsKey("Etudes/Planning Test/autre-lien.md"))
        assertTrue(linkNotes(tree).any { it.contains("Cours B") })
    }

    @Test fun deleteGuardRefusesNotesThatAreNotThisLinks() {
        val owned = planned(COURSES, "Etudes/Planning Test").writes.first().contents
        val tree = MemoryTree()
            .file("Etudes/perso.md", PERSONAL)
            .file("Etudes/ours.md", owned)
            .file("Etudes/theirs.md", owned.replace("feed-1", "feed-other"))
        assertFalse(deleteIcsNoteIfOwned(tree, "Etudes/perso.md", "feed-1"))
        assertFalse(deleteIcsNoteIfOwned(tree, "Etudes/theirs.md", "feed-1"))
        assertFalse(deleteIcsNoteIfOwned(tree, "Etudes/absent.md", "feed-1"))
        assertTrue(deleteIcsNoteIfOwned(tree, "Etudes/ours.md", "feed-1"))
        assertEquals(setOf("Etudes/perso.md", "Etudes/theirs.md"), tree.files.keys)
    }

    // Le dossier du lien a été supprimé à la main : l'erreur est franche, rien n'est créé ailleurs.
    @Test fun aMissingLinkFolderIsAnErrorNotARecreation() {
        val tree = MemoryTree().dir("Etudes")
        try {
            applyIcsDownload(tree, LINK.copy(directory = "Etudes/Planning Test"), COURSES, NEVER, NOW)
            fail("le dossier du lien est absent")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("Calendrier introuvable"))
        }
        assertEquals(setOf("Etudes"), tree.dirs)
        assertTrue(tree.files.isEmpty())
    }

    @Test fun anUnreadableFeedWritesNoNote() {
        val tree = MemoryTree().dir("Etudes")
        runCatching { applyIcsDownload(tree, LINK, "<html>connexion requise</html>", NEVER, NOW) }
        assertTrue(tree.files.isEmpty())
    }

    @Test fun ensureFolderReusesAnExistingFolderAndRefusesAFile() {
        val tree = MemoryTree().dir("Etudes").dir("Etudes/Lien").file("Etudes/Fichier", "x")
        assertEquals("Etudes/Lien", ensureIcsFolder(tree, "Etudes", "Lien"))
        assertEquals(setOf("Etudes", "Etudes/Lien"), tree.dirs)
        assertEquals("Etudes/Neuf", ensureIcsFolder(tree, "Etudes", "Neuf"))
        try {
            ensureIcsFolder(tree, "Etudes", "Fichier")
            fail("un fichier porte ce nom")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("n'est pas un dossier"))
        }
        try {
            ensureIcsFolder(tree, "Absent", "Lien")
            fail("le calendrier n'existe pas")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("Calendrier introuvable"))
        }
    }

    @Test fun aFailedAttemptKeepsTheLastSuccessAndTheCounts() {
        val previous = IcsSyncState("2026-10-01T08:00:00.000Z", "2026-10-01T08:00:00.000Z", 12, mapOf("u1" to 1L))
        val failed = failedIcsState(previous, NOW, "Le serveur a répondu HTTP 404.")
        assertEquals("2026-10-01T10:00:00.000Z", failed.lastAttemptAt)
        assertEquals("2026-10-01T08:00:00.000Z", failed.lastSuccessAt)
        assertEquals(12L, failed.knownEventCount)
        assertEquals(mapOf("u1" to 1L), failed.missingCounts)
        assertEquals("Le serveur a répondu HTTP 404.", failed.lastError)
    }
}
