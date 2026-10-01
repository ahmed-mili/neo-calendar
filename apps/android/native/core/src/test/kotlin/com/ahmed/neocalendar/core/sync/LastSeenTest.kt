package com.ahmed.neocalendar.core.sync

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class LastSeenTest {
    private val now = Instant.parse("2026-10-01T12:00:00Z")
    private val utc = ZoneId.of("UTC")

    @Test fun `connecte`() { assertEquals("Connecté", lastSeenLabel(true, null, now, utc)) }

    @Test fun `jamais connecte quand la date manque ou est illisible`() {
        assertEquals("Jamais connecté", lastSeenLabel(false, null, now, utc))
        assertEquals("Jamais connecté", lastSeenLabel(false, "pas une date", now, utc))
    }

    @Test fun `il y a quelques minutes, heures, jours`() {
        assertEquals("Vu à l'instant", lastSeenLabel(false, "2026-10-01T11:59:40Z", now, utc))
        assertEquals("Vu il y a 5 min", lastSeenLabel(false, "2026-10-01T11:55:00Z", now, utc))
        assertEquals("Vu il y a 3 h", lastSeenLabel(false, "2026-10-01T09:00:00Z", now, utc))
        assertEquals("Vu il y a 2 j", lastSeenLabel(false, "2026-09-29T12:00:00Z", now, utc))
    }

    @Test fun `au dela d'une semaine, la date`() {
        assertEquals("Vu le 1 août 2026", lastSeenLabel(false, "2026-08-01T10:00:00Z", now, utc))
    }

    @Test fun `une date dans le futur n'est pas negative`() {
        assertEquals("Vu à l'instant", lastSeenLabel(false, "2026-10-01T12:05:00Z", now, utc))
    }
}
