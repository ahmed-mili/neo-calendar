package com.ahmed.neocalendar.core.reminders

import org.junit.Assert.assertEquals
import org.junit.Test

class RemindersByCalendarTest {
    @Test
    fun delaysAreReKeyedFromPathToCalendarId() {
        val calendars = listOf("etudes" to "Etudes", "islam" to "Islam")
        val byPath = mapOf("Etudes" to listOf(30L, 60L), "Retire" to listOf(5L))
        assertEquals(mapOf("etudes" to listOf(30L, 60L)), remindersByCalendarId(calendars, byPath))
    }

    @Test
    fun aSilentCalendarKeepsItsEmptyList() {
        assertEquals(mapOf("a" to emptyList<Long>()), remindersByCalendarId(listOf("a" to "A"), mapOf("A" to emptyList())))
    }
}
