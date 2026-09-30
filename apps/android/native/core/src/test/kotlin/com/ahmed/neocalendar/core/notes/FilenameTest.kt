package com.ahmed.neocalendar.core.notes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Ce que le corpus ne peut pas atteindre : `Untitled` n'est jamais rendu par
 *  filenameForEvent (le nom porte toujours une date ou une parenthèse), donc
 *  seul sanitizeForFilename l'expose. Le texte des règles hors corpus repart
 *  sur `null`. */
class FilenameTest {
    @Test
    fun unNomReduitARienDevientUntitled() {
        assertEquals("Untitled", sanitizeForFilename(""))
        assertEquals("Untitled", sanitizeForFilename(" . .. "))
        assertEquals("Untitled", sanitizeForFilename("   "))
    }

    @Test
    fun uneRegleHorsDeLApplicationNEstPasLue() {
        assertNull(rruleToText("RRULE:FREQ=HOURLY;INTERVAL=2"))
        assertNull(rruleToText("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;BYMONTH=3"))
        assertNull(rruleToText("RRULE:FREQ=DAILY;COUNT=3;UNTIL=20261231T235959Z"))
        assertNull(rruleToText("RRULE:INTERVAL=2;FREQ=DAILY"))
        assertNull(rruleToText("RRULE:FREQ=MONTHLY;INTERVAL=1"))
        assertNull(rruleToText("RRULE:FREQ=DAILY;UNTIL=20261331T235959Z"))
    }
}
