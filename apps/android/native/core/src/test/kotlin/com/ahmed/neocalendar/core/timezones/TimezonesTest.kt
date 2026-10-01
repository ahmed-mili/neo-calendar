package com.ahmed.neocalendar.core.timezones

import com.ahmed.neocalendar.core.format.CoreLanguage
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private val PARIS = ZoneId.of("Europe/Paris")
private val NEW_YORK = ZoneId.of("America/New_York")
private val INSTANT = Instant.parse("2026-10-01T12:00:00Z")

class TimezonesTest {
    @After fun back() { CoreLanguage.english = false }

    @Test fun anAddedZoneKeepsTheCanonicalNameAndTheOrder() {
        assertEquals(listOf("Asia/Tokyo", "America/New_York"), timezoneAdded(listOf("Asia/Tokyo"), "  america/new_york "))
    }

    @Test fun anEmptyUnknownOrRepeatedZoneChangesNothing() {
        assertNull(timezoneAdded(emptyList(), "   "))
        assertNull(timezoneAdded(emptyList(), "Mars/Olympus"))
        assertNull(timezoneAdded(listOf("Asia/Tokyo"), "Asia/Tokyo"))
        assertNull(timezoneAdded(listOf("Asia/Tokyo"), "asia/tokyo"))
    }

    @Test fun theOffsetLabelUsesTheTypographicMinusAndHalfHours() {
        assertEquals("GMT+2", offsetLabel(PARIS, INSTANT))
        assertEquals("GMT−4", offsetLabel(NEW_YORK, INSTANT))
        assertEquals("GMT+5:30", offsetLabel(ZoneId.of("Asia/Kolkata"), INSTANT))
        assertEquals("GMT−3:30", offsetLabel(ZoneId.of("America/St_Johns"), Instant.parse("2026-01-15T12:00:00Z")))
        assertEquals("GMT+0", offsetLabel(ZoneId.of("UTC"), INSTANT))
    }

    @Test fun theShortNameFollowsTheLanguage() {
        assertEquals("UTC−4", zoneShortName(NEW_YORK, INSTANT))
        CoreLanguage.english = true
        assertEquals("GMT−4", zoneShortName(NEW_YORK, INSTANT))
    }

    @Test fun anHourLabelIsTheTimeThereWhenItIsThatHereAndFollowsSummerTime() {
        val day = LocalDate.parse("2026-10-01")
        // 01:00 à Paris (UTC+2) = 19:00 la veille à New York (UTC−4).
        assertEquals("19:00", zoneHourLabel(NEW_YORK, PARIS, day, 1, true))
        assertEquals("7 PM", zoneHourLabel(NEW_YORK, PARIS, day, 1, false))
        // Le 27 octobre Paris est revenu à l'heure d'hiver avant New York : l'écart passe de 6 h à 5 h.
        assertEquals("20:00", zoneHourLabel(NEW_YORK, PARIS, LocalDate.parse("2026-10-27"), 1, true))
    }

    @Test fun aHalfHourZoneKeepsItsMinutesInTwelveHourTime() {
        val day = LocalDate.parse("2026-10-01")
        val kolkata = ZoneId.of("Asia/Kolkata")
        val utc = ZoneId.of("UTC")
        assertEquals("04:30", zoneHourLabel(kolkata, utc, day, 23, true))
        assertEquals("4:30 AM", zoneHourLabel(kolkata, utc, day, 23, false))
    }

    @Test fun theNowLabelIsTheClockThere() {
        assertEquals("08:00", zoneNowLabel(NEW_YORK, INSTANT, true))
        assertEquals("8:00 AM", zoneNowLabel(NEW_YORK, INSTANT, false))
        assertEquals("21:05", zoneNowLabel(ZoneId.of("Asia/Tokyo"), Instant.parse("2026-10-01T12:05:00Z"), true))
    }
}
