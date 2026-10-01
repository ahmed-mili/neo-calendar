package com.ahmed.neocalendar.core.sheet

import com.ahmed.neocalendar.core.notes.validateEvent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private fun event(json: String) = validateEvent(Json.parseToJsonElement(json).jsonObject)!!

class SeriesNavigationTest {
    private val weekly = event(
        """{"title":"Sport","allDay":false,"startTime":"18:00","endTime":"19:00","type":"rrule","startDate":"2026-08-03","rrule":"RRULE:FREQ=WEEKLY;BYDAY=MO","skipDates":["2026-08-17"]}""",
    )

    @Test fun rruleNeighboursSkipTheDaysTakenOutOfTheSeries() {
        assertEquals("2026-08-10", adjacentOccurrenceDate(weekly, "2026-08-03", 1))
        assertEquals("2026-08-24", adjacentOccurrenceDate(weekly, "2026-08-10", 1))
        assertEquals("2026-08-10", adjacentOccurrenceDate(weekly, "2026-08-24", -1))
    }

    @Test fun theSeriesHasNoDayBeforeItsFirstOne() {
        assertNull(adjacentOccurrenceDate(weekly, "2026-08-03", -1))
    }

    @Test fun anEndedSeriesHasNoDayAfter() {
        val ended = event(
            """{"title":"Cours","allDay":true,"type":"rrule","startDate":"2026-08-03","rrule":"RRULE:FREQ=DAILY;COUNT=3","skipDates":[]}""",
        )
        assertEquals("2026-08-05", adjacentOccurrenceDate(ended, "2026-08-04", 1))
        assertNull(adjacentOccurrenceDate(ended, "2026-08-05", 1))
    }

    @Test fun anAnnualRuleFindsItsNeighbourElevenMonthsAway() {
        val yearly = event(
            """{"title":"Anniv","allDay":true,"type":"rrule","startDate":"2020-03-02","rrule":"RRULE:FREQ=YEARLY","skipDates":[]}""",
        )
        assertEquals("2027-03-02", adjacentOccurrenceDate(yearly, "2026-03-02", 1))
        assertEquals("2025-03-02", adjacentOccurrenceDate(yearly, "2026-03-02", -1))
    }

    @Test fun displayIdsKeepTheStoredId() {
        assertEquals("abc_2026-08-10" to "2026-08-10", adjacentOccurrenceId(weekly, "abc_2026-08-03", 1))
        assertNull(adjacentOccurrenceId(weekly, null, 1))
        assertNull(adjacentOccurrenceId(weekly, "pas-une-date", 1))
    }

    @Test fun aSingleEventHasNoNeighbour() {
        val single = event("""{"title":"RDV","allDay":true,"type":"single","date":"2026-08-03","endDate":null}""")
        assertNull(adjacentOccurrenceDate(single, "2026-08-03", 1))
    }
}
