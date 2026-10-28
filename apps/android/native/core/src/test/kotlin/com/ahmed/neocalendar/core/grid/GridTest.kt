package com.ahmed.neocalendar.core.grid

import com.ahmed.neocalendar.core.workspace.WorkspaceCalendar
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GridTest {
    private val paris = ZoneId.of("Europe/Paris")
    private fun at(y: Int, m: Int, d: Int, h: Int, min: Int = 0) =
        ZonedDateTime.of(y, m, d, h, min, 0, 0, paris).toInstant()

    @Test fun dayCountIsClamped() {
        assertEquals(1, clampDayCount(0))
        assertEquals(60, clampDayCount(99))
        assertEquals(7, clampDayCount(7))
    }

    @Test fun snapMovesExactlyOneDay() {
        assertEquals(10L, snapTargetDay(10, 0.1, 0.0))
        assertEquals(11L, snapTargetDay(10, 0.3, 0.0))
        assertEquals(9L, snapTargetDay(10, -0.3, 0.0))
        // Un long glissé ne saute jamais plus d'un jour.
        assertEquals(11L, snapTargetDay(10, 3.4, 0.0))
        // Un coup de pouce rapide suffit, et sa vitesse l'emporte sur le trajet.
        assertEquals(9L, snapTargetDay(10, 0.05, -2.0))
        assertEquals(9L, snapTargetDay(10, 0.4, -2.0))
    }

    @Test fun stableColorIsTheSignedHashModuloPalette() {
        var h = 0
        for (c in "Islam") h = h * 31 + c.code
        assertEquals(CALENDAR_COLOR_PALETTE[(Math.abs(h.toLong()) % 10).toInt()], stableCalendarColor("Islam", 0))
        assertEquals(CALENDAR_COLOR_PALETTE[0], stableCalendarColor("", 0))
        assertEquals(CALENDAR_COLOR_PALETTE[3], stableCalendarColor("", 3))
        // Un hachage qui déborde de 32 bits reste dans la palette.
        val long = "a".repeat(40)
        assertNotNull(CALENDAR_COLOR_PALETTE.indexOf(stableCalendarColor(long, 7)).takeIf { it >= 0 })
    }

    @Test fun calendarsFollowOrderThenName() {
        val prefs = Json.parseToJsonElement("""{"order":["Islam"],"colors":{"Etudes":"#112233"}}""").jsonObject
        val models = buildCalendarModels(
            listOf(WorkspaceCalendar("Etudes", "Etudes"), WorkspaceCalendar("Islam", "Islam"), WorkspaceCalendar("Zen", "Zen")),
            prefs,
            Locale.FRANCE,
        )
        assertEquals(listOf("Islam", "Etudes", "Zen"), models.map { it.name })
        assertEquals("#112233", models[1].color)
        assertEquals("local::Islam", models[0].id)
    }

    @Test fun eventWithinOneDay() {
        val s = segmentForDay(at(2026, 10, 1, 9, 30), at(2026, 10, 1, 10, 45), LocalDate.of(2026, 10, 1), paris)
        assertNotNull(s)
        assertEquals(9.5, s!!.topHours, 1e-9)
        assertEquals(1.25, s.durationHours, 1e-9)
        assertEquals(true, s.startsThisDay && s.endsThisDay)
        assertNull(segmentForDay(at(2026, 10, 1, 9), at(2026, 10, 1, 10), LocalDate.of(2026, 10, 2), paris))
    }

    @Test fun eventCrossingMidnightIsSplit() {
        val start = at(2026, 10, 1, 22)
        val end = at(2026, 10, 2, 1, 30)
        val first = segmentForDay(start, end, LocalDate.of(2026, 10, 1), paris)!!
        assertEquals(22.0, first.topHours, 1e-9)
        assertEquals(2.0, first.durationHours, 1e-9)
        assertEquals(false, first.endsThisDay)
        val second = segmentForDay(start, end, LocalDate.of(2026, 10, 2), paris)!!
        assertEquals(0.0, second.topHours, 1e-9)
        assertEquals(1.5, second.durationHours, 1e-9)
        assertEquals(false, second.startsThisDay)
    }

    @Test fun eventEndingAtMidnightDoesNotTouchNextDay() {
        val start = at(2026, 10, 1, 22)
        val end = at(2026, 10, 2, 0)
        assertEquals(2.0, segmentForDay(start, end, LocalDate.of(2026, 10, 1), paris)!!.durationHours, 1e-9)
        assertNull(segmentForDay(start, end, LocalDate.of(2026, 10, 2), paris))
    }

    @Test fun daylightSavingDayIsReadOnTheWallClock() {
        // 2026-03-29 : 02:00 n'existe pas à Paris ; l'évènement finit en face de « 03:30 ».
        val s = segmentForDay(at(2026, 3, 29, 1, 30), at(2026, 3, 29, 3, 30), LocalDate.of(2026, 3, 29), paris)!!
        assertEquals(1.5, s.topHours, 1e-9)
        assertEquals(3.5, s.topHours + s.durationHours, 1e-9)
        val night = segmentForDay(at(2026, 3, 28, 23), at(2026, 3, 29, 4), LocalDate.of(2026, 3, 29), paris)!!
        assertEquals(0.0, night.topHours, 1e-9)
        assertEquals(4.0, night.durationHours, 1e-9)
    }

    @Test fun flingWithoutMomentumKeepsOneDayRule() {
        assertEquals(11L, flingTargetDay(10, 10.3, 10.3, 0.5))
        assertEquals(10L, flingTargetDay(10, 10.1, 10.1, 0.0))
        // Un long glisser lent se cale sur le jour le plus proche : pas de recul de 0,6 jour.
        assertEquals(12L, flingTargetDay(10, 11.6, 11.6, 0.0))
    }
    @Test fun flingFollowsProjectionAndNeverRecoils() {
        assertEquals(13L, flingTargetDay(10, 11.6, 13.2, 8.0))
        assertEquals(12L, flingTargetDay(10, 11.6, 11.7, 3.0))
        assertEquals(8L, flingTargetDay(10, 9.6, 8.4, -6.0))
        assertEquals(9L, flingTargetDay(10, 9.6, 9.5, -2.0))
        assertEquals(11L, flingTargetDay(10, 10.05, 10.1, 2.0))
    }
    @Test fun flingIsCappedAtSevenDaysFromRelease() {
        assertEquals(18L, flingTargetDay(10, 11.6, 40.0, 30.0))
        assertEquals(3L, flingTargetDay(10, 9.4, -30.0, -30.0))
    }
    @Test fun glideCurveStartsAtFingerSpeedAndStopsFlat() {
        assertEquals(0.0, glideProgress(0.0, 2.0), 1e-9)
        assertEquals(1.0, glideProgress(1.0, 2.0), 1e-9)
        assertEquals(2.0, glideSlope(0.0, 2.0), 1e-9)
        assertEquals(0.0, glideSlope(1.0, 2.0), 1e-9)
        // Monotone pour m0 entre 0 et 3 : jamais de dépassement.
        for (m0 in listOf(0.0, 1.0, 2.0, 3.0)) for (i in 0..100) assertTrue(glideSlope(i / 100.0, m0) >= -1e-9)
    }
    @Test fun glideDurationStaysBounded() {
        assertEquals(500, glideDurationMs(3.0, 12.0))
        assertEquals(900, glideDurationMs(1.0, 1.3))
        assertTrue(glideDurationMs(0.2, 30.0) <= 150)
        assertEquals(260, glideDurationMs(0.0, 5.0))
    }
}
