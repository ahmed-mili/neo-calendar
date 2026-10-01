package com.ahmed.neocalendar.core.grid

import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.workspace.EventWriter
import com.ahmed.neocalendar.core.workspace.MemoryTree
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private val PARIS = ZoneId.of("Europe/Paris")
private fun at(local: String): Instant = LocalDateTime.parse(local).atZone(PARIS).toInstant()

/** La projection d'un glisser vers ou depuis la bande « journée entière ». */
class DropProjectionTest {
    @Test fun theBandIsTheStripAboveTheGridPlusItsSlop() {
        assertTrue(isInAllDayBand(-1f, 60f, 12f))
        assertTrue(isInAllDayBand(0f, 60f, 12f))
        assertTrue(isInAllDayBand(-72f, 60f, 12f))
        // Au-delà de la bande et de sa tolérance : les en-têtes, pas la bande.
        assertFalse(isInAllDayBand(-73f, 60f, 12f))
        assertFalse(isInAllDayBand(1f, 60f, 12f))
    }

    @Test fun theDropHourSnapsToTheQuarterAndStaysInTheDay() {
        assertEquals(9 * 60, dropMinuteOfDay(9 * 72.0 + 3, 72.0))
        assertEquals(9 * 60 + 15, dropMinuteOfDay(9 * 72.0 + 12, 72.0))
        assertEquals(0, dropMinuteOfDay(-50.0, 72.0))
        assertEquals(23 * 60 + 45, dropMinuteOfDay(24 * 72.0 + 90, 72.0))
    }

    @Test fun aTimedEventDroppedOnTheBandBecomesTheAllDayOfTheTargetDay() {
        // Une fin à 23:30 + 1 h franchirait minuit : le jour vient du décalage, pas de l'heure.
        val slot = projectDrop(at("2026-08-12T23:00"), at("2026-08-13T00:30"), false, dayShift = 1, deltaMinutes = 120, inBand = true, dropMinutes = 0, zone = PARIS)
        assertEquals(DropSlot(at("2026-08-13T00:00"), at("2026-08-14T00:00"), true), slot)
    }

    @Test fun anAllDayEventDroppedInTheGridBecomesAHalfHourBlockAtTheDropHour() {
        val slot = projectDrop(at("2026-08-12T00:00"), at("2026-08-13T00:00"), true, dayShift = 2, deltaMinutes = 0, inBand = false, dropMinutes = 14 * 60 + 15, zone = PARIS)
        assertEquals(DropSlot(at("2026-08-14T14:15"), at("2026-08-14T14:45"), false), slot)
    }

    @Test fun anAllDayEventMovedWithinTheBandKeepsItsSpan() {
        val slot = projectDrop(at("2026-08-12T00:00"), at("2026-08-15T00:00"), true, dayShift = -1, deltaMinutes = 0, inBand = true, dropMinutes = 0, zone = PARIS)
        assertEquals(DropSlot(at("2026-08-11T00:00"), at("2026-08-14T00:00"), true), slot)
    }

    @Test fun anOrdinaryMoveStaysTimedAndKeepsItsDuration() {
        val slot = projectDrop(at("2026-08-12T09:00"), at("2026-08-12T10:30"), false, dayShift = 1, deltaMinutes = 30, inBand = false, dropMinutes = 0, zone = PARIS)
        assertEquals(DropSlot(at("2026-08-13T09:30"), at("2026-08-13T11:00"), false), slot)
    }

    @Test fun allDayDaysAcrossTheSpringForwardKeepTheirMidnights() {
        // Le 29 mars 2026, Paris passe à l'heure d'été : le 28 dure 24 h, le 29 en dure 23.
        val slot = projectDrop(at("2026-03-28T00:00"), at("2026-03-29T00:00"), true, dayShift = 1, deltaMinutes = 0, inBand = true, dropMinutes = 0, zone = PARIS)
        assertEquals(DropSlot(at("2026-03-29T00:00"), at("2026-03-30T00:00"), true), slot)
    }

    private val TIMED = "---\ntitle: \"Dentiste\"\nallDay: false\nstartTime: \"09:00\"\nendTime: \"10:00\"\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: null\nmaCle: garde\n---\nCorps\n"
    private val ALLDAY = "---\ntitle: \"Permis\"\nallDay: true\ntype: \"single\"\ndate: \"2026-08-12\"\nendDate: \"2026-08-14\"\n---\nCorps\n"

    private fun stored(path: String, text: String) =
        parseStoredEvent(EventFile(path, "Essai", path.substringAfterLast('/'), text), setOf("local::Essai"))!!

    @Test fun writingATimedEventToTheBandDropsItsHours() {
        val path = "Essai/2026-08-12 Dentiste.md"
        val tree = MemoryTree().file(path, TIMED)
        val slot = DropSlot(at("2026-08-13T00:00"), at("2026-08-14T00:00"), true)
        EventWriter(tree).rescheduleToSlot(stored(path, TIMED), "id", slot, PARIS) { "2026-10-01T10:00:00.000Z" }
        val written = tree.files.values.single()
        assertTrue(written.contains("allDay: true"))
        assertTrue(written.contains("date: \"2026-08-13\""))
        assertFalse(written.contains("startTime"))
        assertFalse(written.contains("endTime"))
        assertTrue(written.contains("maCle: garde"))
        assertTrue(written.contains("endDate: null"))
    }

    @Test fun writingAnAllDayEventToTheGridGivesItHours() {
        val path = "Essai/2026-08-12 Permis.md"
        val tree = MemoryTree().file(path, ALLDAY)
        val slot = DropSlot(at("2026-08-13T14:15"), at("2026-08-13T14:45"), false)
        EventWriter(tree).rescheduleToSlot(stored(path, ALLDAY), "id", slot, PARIS) { "2026-10-01T10:00:00.000Z" }
        val written = tree.files.values.single()
        assertTrue(written.contains("allDay: false"))
        assertTrue(written.contains("startTime: \"14:15\""))
        assertTrue(written.contains("endTime: \"14:45\""))
        assertTrue(written.contains("date: \"2026-08-13\""))
        assertTrue(written.contains("endDate: null"))
    }
}
