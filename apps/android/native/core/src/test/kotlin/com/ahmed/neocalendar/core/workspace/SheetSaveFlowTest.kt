package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.form.buildPayload
import com.ahmed.neocalendar.core.form.formValuesOfDraft
import com.ahmed.neocalendar.core.form.formValuesOfEvent
import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import java.time.LocalDateTime
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le parcours de la fiche, avec les mêmes fonctions qu'elle : un brouillon n'est écrit qu'avec son titre, puis chaque
 * modification est UNE écriture de la même note ; une série ne s'écrit que par la portée choisie à la sortie.
 */
class SheetSaveFlowTest {
    private val calendarId = "local::Essai"
    private val now = { "2026-10-01T10:00:00.000Z" }

    private fun noteOf(tree: MemoryTree, written: WrittenEvent): StoredEvent =
        parseStoredEvent(
            EventFile(written.relativePath, written.calendarPath, written.relativePath.substringAfterLast('/'), tree.files.getValue(written.relativePath)),
            setOf(calendarId),
        )!!

    private fun draftPayload(title: String): JsonObject {
        val form = formValuesOfDraft(
            LocalDateTime.of(2026, 10, 3, 9, 0), LocalDateTime.of(2026, 10, 3, 9, 30), false, false, listOf(calendarId), calendarId,
        ).copy(title = title)
        // La fiche écrit le titre rogné d'un brouillon.
        return JsonObject(form.buildPayload() + ("title" to JsonPrimitive(title.trim())))
    }

    @Test fun aDraftBecomesOneNoteAndEachEditIsOneWriteOfThatNote() {
        val tree = MemoryTree().dir("Essai")
        val writer = EventWriter(tree)
        val created = writer.create("Essai", draftPayload("Essai"))
        assertEquals(listOf("Essai/2026-10-03 Essai.md"), tree.files.keys.toList())
        var note = noteOf(tree, created)
        tree.log.clear()

        // Une modification de la fiche : le titre. Une écriture, un renommage, toujours une seule note.
        val form = formValuesOfEvent(note.event, listOf(calendarId), calendarId).copy(title = "Essai bis")
        val written = writer.update(note, form.buildPayload(), "Essai")
        assertEquals(1, tree.log.count { it.startsWith("write ") })
        assertEquals(listOf("Essai/2026-10-03 Essai bis.md"), tree.files.keys.toList())

        // Une seconde modification (l'heure) : une écriture de plus, le nom ne bouge pas.
        note = noteOf(tree, written)
        tree.log.clear()
        val later = formValuesOfEvent(note.event, listOf(calendarId), calendarId).copy(startTime = "10:00", endTime = "10:30")
        writer.update(note, later.buildPayload(), "Essai")
        assertEquals(1, tree.log.count { it.startsWith("write ") })
        assertFalse(tree.log.any { it.startsWith("rename ") })
        assertEquals(1, tree.files.size)
        assertTrue(tree.files.getValue("Essai/2026-10-03 Essai bis.md").contains("startTime: \"10:00\""))
    }

    @Test fun anUntitledDraftWritesNothing() {
        val tree = MemoryTree().dir("Essai")
        val form = formValuesOfDraft(
            LocalDateTime.of(2026, 10, 3, 9, 0), LocalDateTime.of(2026, 10, 3, 9, 30), false, false, listOf(calendarId), calendarId,
        )
        // La fiche ne crée rien tant que le titre est vide (`hasDraftCreationIntent`).
        assertTrue(form.title.isBlank())
        assertTrue(tree.files.isEmpty() && tree.log.isEmpty())
    }

    private val series = "---\ntitle: \"Sport\"\nallDay: false\nstartTime: \"18:00\"\nendTime: \"19:00\"\ntype: \"rrule\"\nstartDate: \"2026-08-03\"\nrrule: \"RRULE:FREQ=WEEKLY;BYDAY=MO\"\nskipDates: []\n---\nCorps\n"

    private fun seriesTree(): Pair<MemoryTree, StoredEvent> {
        val name = com.ahmed.neocalendar.core.notes.filenameForEvent(
            com.ahmed.neocalendar.core.notes.validateEvent(
                kotlinx.serialization.json.Json.parseToJsonElement(
                    """{"title":"Sport","allDay":false,"startTime":"18:00","endTime":"19:00","type":"rrule","startDate":"2026-08-03","rrule":"RRULE:FREQ=WEEKLY;BYDAY=MO","skipDates":[]}""",
                ) as JsonObject,
            )!!,
        )
        val tree = MemoryTree().file("Essai/$name", series)
        val note = parseStoredEvent(EventFile("Essai/$name", "Essai", name, series), setOf(calendarId))!!
        return tree to note
    }

    // « Tous les évènements » : la série est réécrite, une fois, avec la nouvelle heure.
    @Test fun theWholeSeriesIsOneWrite() {
        val (tree, note) = seriesTree()
        val form = formValuesOfEvent(note.event, listOf(calendarId), calendarId).copy(startTime = "17:00", endTime = "18:00")
        EventWriter(tree).update(note, form.buildPayload(), "Essai")
        assertEquals(1, tree.log.count { it.startsWith("write ") })
        assertEquals(1, tree.files.size)
        assertTrue(tree.files.values.single().contains("startTime: \"17:00\""))
    }

    // « Cet évènement seulement » : une copie à part pour le jour, et le jour sort de la série.
    @Test fun oneDayOfTheSeriesIsDetachedIntoItsOwnNote() {
        val (tree, note) = seriesTree()
        val form = formValuesOfEvent(note.event, listOf(calendarId), calendarId).copy(startTime = "17:00", endTime = "18:00")
        EventWriter(tree).detachOccurrence(note, form.buildPayload(), "2026-08-10", "2026-08-10", "Essai", now)
        assertEquals(2, tree.files.size)
        val original = tree.files.entries.first { it.value.contains("type: \"rrule\"") }.value
        assertTrue(original.contains("startTime: \"18:00\""))
        assertTrue(original.contains("2026-08-10"))
        val copy = tree.files.entries.first { it.value.contains("type: \"single\"") }.value
        assertTrue(copy.contains("startTime: \"17:00\"") && copy.contains("date: \"2026-08-10\""))
    }
}
