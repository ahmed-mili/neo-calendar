package com.ahmed.neocalendar.core.form

import com.ahmed.neocalendar.core.recurrence.Freq
import com.ahmed.neocalendar.core.recurrence.PresetKey
import com.ahmed.neocalendar.core.recurrence.defaultRecurrence
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormEditsTest {
    private val timed = EventFormValues(
        date = "2026-08-12", startTime = "09:00", endTime = "10:00", recurrence = defaultRecurrence("2026-08-12"),
    )
    private val allDay = EventFormValues(date = "2026-08-12", allDay = true, recurrence = defaultRecurrence("2026-08-12"))

    // EventPanel.tsx toggleAllDay : décocher sans heures en pose (midi), avec heures elles reviennent telles quelles.
    @Test fun untickingAllDaySeedsNoonOnlyWithoutTimes() {
        val seeded = allDay.withAllDay(false)
        assertFalse(seeded.allDay)
        assertEquals("12:00", seeded.startTime)
        assertEquals("12:30", seeded.endTime)
        val kept = timed.copy(allDay = true).withAllDay(false)
        assertEquals("09:00", kept.startTime)
        assertEquals("10:00", kept.endTime)
        assertTrue(timed.withAllDay(true).allDay)
        assertEquals("09:00", timed.withAllDay(true).startTime)
    }

    @Test fun clearingTheDateTurnsTheEntryIntoASomedayOne() {
        val series = timed.copy(endDate = "2026-08-13", isRecurring = true)
        val cleared = series.withClearedDate()
        assertEquals("", cleared.date)
        assertNull(cleared.endDate)
        assertFalse(cleared.isRecurring)
        assertTrue(cleared.allDay)
        assertEquals("", cleared.startTime)
        assertEquals("someday", cleared.buildPayload()["type"]!!.toString().trim('"'))
    }

    @Test fun choosingARepeatSetsTheRuleAndDropsTheDeadline() {
        val task = timed.copy(taskStatus = "todo", due = "2026-09-01")
        val yearly = task.withRepeat(PresetKey.Yearly)
        assertTrue(yearly.isRecurring)
        assertEquals(Freq.Yearly, yearly.recurrence.freq)
        assertNull(yearly.due)
        assertFalse(yearly.withRepeat(null).isRecurring)
    }

    // « Personnalisé… » garde la règle déjà écrite, et en propose une (hebdomadaire, le jour de départ) sinon.
    @Test fun customKeepsTheExistingRule() {
        val daily = timed.withRepeat(PresetKey.Daily)
        assertEquals(Freq.Daily, daily.withRepeat(PresetKey.Custom).recurrence.freq)
        val once = timed.withRepeat(PresetKey.Custom)
        assertEquals(Freq.Weekly, once.recurrence.freq)
        assertEquals(listOf("W"), once.recurrence.byDay)
    }

    @Test fun occurrencesAreTickedInAnOrderedList() {
        val series = timed.copy(completedDates = listOf("2026-08-10"))
        val ticked = series.withOccurrenceStatus("2026-08-03", true)
        assertEquals(listOf("2026-08-03", "2026-08-10"), ticked.completedDates)
        assertEquals(listOf("2026-08-03"), ticked.withOccurrenceStatus("2026-08-10", false).completedDates)
        assertEquals(listOf("2026-08-03"), timed.withOccurrenceStatus("2026-08-03", true).completedDates)
    }
}
