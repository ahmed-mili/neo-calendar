package com.ahmed.neocalendar.core.form

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TimeInputTest {
    @Test fun readsTheUsualWaysOfTypingAnHour() {
        assertEquals("06:00", parseTypedTime("6"))
        assertEquals("06:30", parseTypedTime("630"))
        assertEquals("18:30", parseTypedTime("18:30"))
        assertEquals("18:30", parseTypedTime("18h30"))
        assertEquals("09:05", parseTypedTime("905"))
        assertEquals("23:59", parseTypedTime("2359"))
    }

    @Test fun readsTwelveHourClocks() {
        assertEquals("18:00", parseTypedTime("6 pm"))
        assertEquals("06:30", parseTypedTime("6:30am"))
        assertEquals("00:15", parseTypedTime("12:15 AM"))
        assertEquals("12:00", parseTypedTime("12pm"))
    }

    @Test fun refusesWhatIsNotATime() {
        assertNull(parseTypedTime(""))
        assertNull(parseTypedTime("25:00"))
        assertNull(parseTypedTime("12:75"))
        assertNull(parseTypedTime("abc"))
        assertNull(parseTypedTime("13pm"))
    }
}
