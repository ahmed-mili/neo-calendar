package com.ahmed.neocalendar.core.prayer

import com.ahmed.neocalendar.core.description.AddLinkResult
import com.ahmed.neocalendar.core.description.addLinkMarkdown
import com.ahmed.neocalendar.core.description.appendMarkdownToDescription
import com.ahmed.neocalendar.core.description.attachmentFolderName
import com.ahmed.neocalendar.core.description.attachmentMarkdownPath
import com.ahmed.neocalendar.core.description.uniqueAttachmentName
import java.io.File
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Les tables livrées avec l'app (`res/raw/prayer_timetables.json`, tirées des fichiers TypeScript de l'ancienne). */
class PrayerTimetablesTest {
    private val tables = parsePrayerTimetables(File("../app/src/main/res/raw/prayer_timetables.json").readText())

    @Test fun theFourMosquesOfTheOldAppAreThereInTheSameOrder() {
        assertEquals(listOf("villejuif", "kremlin-bicetre", "foi-et-unicite", "alkitab-wa-sunnah"), tables.map { it.id })
        assertTrue(tables.all { it.year == 2026 && it.days.size == 365 })
        assertEquals("Mosquée de Villejuif", tables.first().name)
    }

    @Test fun aRealDayReadsTheSameMinutesAsTheTypeScriptTable() {
        val villejuif = prayerTimetableById(tables, "villejuif")!!
        // villejuif.ts, « 01-01 » : [409, 524, 775, 887, 1028, 1127]
        assertEquals(listOf(409, 775, 887, 1028, 1127), prayersOn(villejuif, LocalDate.of(2026, 1, 1)).map { it.minutes })
    }

    @Test fun fridayHasTheMosqueSessionsInsteadOfDhuhr() {
        val villejuif = prayerTimetableById(tables, "villejuif")!!
        val friday = prayersOn(villejuif, LocalDate.of(2026, 1, 2))
        assertEquals(listOf("fajr", "jumua", "jumua", "asr", "maghrib", "isha"), friday.map { it.name.key })
        assertEquals(listOf(780, 840), friday.filter { it.name == PrayerName.Jumua }.map { it.minutes })
    }

    @Test fun jumuaChoicesListEachTimeOnceWithItsMosques() {
        val choices = jumuaChoices(tables)
        assertEquals(listOf("12:30", "13:00", "13:30", "13:45", "14:00"), choices.map { it.time })
        assertEquals(3, choices.first { it.time == "13:00" }.mosques.size)
    }

    @Test fun anUnknownIdIsNoMosque() {
        assertEquals(null, prayerTimetableById(tables, "nulle-part"))
        assertEquals(null, prayerTimetableById(tables, null))
    }

    @Test fun theAttachmentFolderIsTheDottedOneUnlessTheOtherAlreadyExists() {
        assertEquals(".attachments", attachmentFolderName(listOf("a.md")))
        assertEquals("attachments", attachmentFolderName(listOf("a.md", "attachments")))
        assertEquals(".attachments", attachmentFolderName(listOf("attachments", ".attachments")))
    }

    @Test fun aTakenAttachmentNameGetsACounterBeforeItsExtension() {
        val taken = listOf("a.png", "a (1).png", "LISEZMOI")
        assertEquals("b.png", uniqueAttachmentName(taken, "b.png"))
        assertEquals("a (2).png", uniqueAttachmentName(taken, "a.png"))
        assertEquals("LISEZMOI (1)", uniqueAttachmentName(taken, "LISEZMOI"))
    }

    @Test fun theLinkPathStartsAtTheDataFolder() {
        assertEquals("Etudes/.attachments/a.png", attachmentMarkdownPath("Etudes/note.md", ".attachments", "a.png"))
        assertEquals(".attachments/a.png", attachmentMarkdownPath("note.md", ".attachments", "a.png"))
    }

    @Test fun theLinkDialogRefusesWhatIsNotALinkAndWhatIsAlreadyThere() {
        assertEquals(AddLinkResult.Refused("Ça ne ressemble pas à un lien"), addLinkMarkdown("x", "pas un lien", emptyList()))
        assertEquals(AddLinkResult.Refused("Ce lien est déjà là"), addLinkMarkdown("", "https://a.fr/x/", listOf("https://a.fr/x")))
        assertEquals(AddLinkResult.Insert("[Mon \\] site](https://a.fr/x)"), addLinkMarkdown("Mon ] site", "https://a.fr/x", emptyList()))
        assertEquals(AddLinkResult.Insert("[a.fr/x](https://a.fr/x)"), addLinkMarkdown("  ", "a.fr/x", emptyList()))
    }

    @Test fun appendingALinkKeepsTheTextAndDoesNotRepeatIt() {
        assertEquals("texte\n[a](b)", appendMarkdownToDescription("texte\n", "[a](b)"))
        assertEquals("texte\n[a](b)", appendMarkdownToDescription("texte\n[a](b)", "[a](b)"))
    }
}
