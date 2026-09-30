package com.ahmed.neocalendar.core.grid

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

private val PARIS = ZoneId.of("Europe/Paris")

private fun at(local: String): Instant = LocalDateTime.parse(local).atZone(PARIS).toInstant()

/** Les calculs des gestes : pas de 15 minutes, jours, bords, créneau d'un appui. */
class EventMoveTest {
    @Test fun aDragSnapsToTheNearestQuarterHour() {
        assertEquals(0, snappedMinutes(4.0, 72.0))
        assertEquals(15, snappedMinutes(9.0, 72.0))
        assertEquals(60, snappedMinutes(72.0, 72.0))
        assertEquals(-30, snappedMinutes(-36.0, 72.0))
        // Une moitié de pas monte, comme Math.round.
        assertEquals(15, snappedMinutes(9.0, 72.0))
        assertEquals(0, snappedMinutes(-9.0, 72.0))
    }

    @Test fun theDayShiftFollowsTheColumnAndThePartOfItAlreadyCrossed() {
        assertEquals(0, dayShiftFromAnchor(100, 0.5, 100, 0.9))
        assertEquals(1, dayShiftFromAnchor(100, 0.5, 101, 0.5))
        // Attraper contre le bord droit ne change pas de jour au premier pixel.
        assertEquals(0, dayShiftFromAnchor(100, 0.95, 101, 0.1))
        assertEquals(-1, dayShiftFromAnchor(100, 0.5, 99, 0.6))
    }

    @Test fun movingKeepsTheWallClockAcrossDaysAndTheDuration() {
        val slot = movedSlot(at("2026-03-28T10:00"), at("2026-03-28T11:30"), dayShift = 2, deltaMinutes = 15, zone = PARIS)
        // Le 29 mars 2026, l'heure d'été commence : 10:15 reste 10:15 sur l'horloge.
        assertEquals(at("2026-03-30T10:15"), slot.start)
        assertEquals(at("2026-03-30T11:45"), slot.end)
    }

    @Test fun resizingNeverGoesBelowAQuarterHour() {
        val start = at("2026-08-12T09:00")
        val end = at("2026-08-12T10:00")
        assertEquals(at("2026-08-12T09:15"), resizedSlot(start, end, ResizeEdge.Bottom, -120).end)
        assertEquals(at("2026-08-12T09:45"), resizedSlot(start, end, ResizeEdge.Top, 120).start)
        assertEquals(at("2026-08-12T10:30"), resizedSlot(start, end, ResizeEdge.Bottom, 30).end)
        assertEquals(start, resizedSlot(start, end, ResizeEdge.Bottom, 30).start)
    }

    @Test fun aTapSnapsTheStartToTheQuarterAndLastsHalfAnHour() {
        val day = LocalDate.parse("2026-08-12")
        // 09:07 sur un axe de 72 px par heure
        assertEquals(LocalDateTime.parse("2026-08-12T09:00") to LocalDateTime.parse("2026-08-12T09:30"), draftSlotAt(9.0 * 72 + 8.4, 72.0, day))
        // 09:08 -> 09:15
        assertEquals(LocalDateTime.parse("2026-08-12T09:15"), draftSlotAt(9.0 * 72 + 9.6, 72.0, day).first)
        // 08:53 -> 09:00
        assertEquals(LocalDateTime.parse("2026-08-12T09:00"), draftSlotAt(8.0 * 72 + 63.6, 72.0, day).first)
    }

    @Test fun aTapBelowTheLastQuarterRollsToMidnight() {
        val day = LocalDate.parse("2026-08-12")
        assertEquals(LocalDateTime.parse("2026-08-13T00:00"), draftSlotAt(24 * 72.0 + 50, 72.0, day).first)
        assertEquals(LocalDateTime.parse("2026-08-12T00:00"), draftSlotAt(-20.0, 72.0, day).first)
    }
}
