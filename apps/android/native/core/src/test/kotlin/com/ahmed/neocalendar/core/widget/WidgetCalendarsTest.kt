package com.ahmed.neocalendar.core.widget

import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Instant
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le choix des calendriers d'un widget : filtrage et forme de la charge (ajouts du natif). */
class WidgetCalendarsTest {
    @Test
    fun noSavedChoiceShowsEverything() {
        assertTrue(isCalendarShown("etudes", null))
        assertTrue(isCalendarShown("nouveau", null))
        assertTrue(isCalendarShown(null, null))
    }

    @Test
    fun aSavedChoiceShowsOnlyTheKeptCalendars() {
        val chosen = setOf("etudes")
        assertTrue(isCalendarShown("etudes", chosen))
        assertFalse(isCalendarShown("islam", chosen))
    }

    @Test
    fun aCalendarAddedLaterIsHiddenOnceAChoiceExists() {
        assertFalse(isCalendarShown("cree-apres", setOf("etudes", "islam")))
    }

    @Test
    fun anEmptyChoiceShowsNothingAndARowWithoutCalendarIsHiddenByAChoice() {
        assertFalse(isCalendarShown("etudes", emptySet()))
        assertFalse(isCalendarShown(null, setOf("etudes")))
    }

    private fun event(calendarId: String) = DisplayEvent(
        id = "e-$calendarId", title = "T",
        start = Instant.parse("2026-08-07T12:00:00Z"), end = Instant.parse("2026-08-07T13:00:00Z"),
        allDay = false, color = "#89b4fa", editable = true, calendarId = calendarId, calendarName = calendarId,
        isTask = false, taskCompleted = JsonPrimitive(false), taskStatus = null, reminders = null,
        isRecurring = false, isSeriesStart = false, isMultiDay = false, isSomeday = false,
        description = null, location = null,
    )

    private val theme = WidgetTheme("#2a2a3c", "#c6d0f5", "#9aa2c6", "#658ff2")
    private val now = Instant.parse("2026-08-07T10:00:00Z")

    @Test
    fun payloadCarriesCalendarIdOfRowsAndTheCalendarList() {
        val payload = buildWidgetPayload(
            listOf(event("etudes")), now, true, theme,
            calendars = listOf(WidgetCalendar("etudes", "Etudes", "#89b4fa"), WidgetCalendar("islam", "Islam", "#a6e3a1")),
        ).toJson()
        assertEquals("etudes", (payload.getValue("rows").jsonArray.single().jsonObject.getValue("calendarId") as JsonPrimitive).content)
        val calendars = payload.getValue("calendars").jsonArray.map { it.jsonObject }
        assertEquals(listOf("etudes", "islam"), calendars.map { (it.getValue("id") as JsonPrimitive).content })
        assertEquals("Etudes", (calendars[0].getValue("name") as JsonPrimitive).content)
    }

    @Test
    fun theCorpusShapeLeavesTheNativeFieldsOut() {
        val payload = buildWidgetPayload(
            listOf(event("etudes")), now, true, theme,
            calendars = listOf(WidgetCalendar("etudes", "Etudes", "#89b4fa")),
        ).toJson(withNativeFields = false)
        assertFalse("calendars" in payload.keys)
        assertFalse("calendarId" in payload.getValue("rows").jsonArray.single().jsonObject.keys)
    }
}
