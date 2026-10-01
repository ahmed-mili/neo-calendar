package com.ahmed.neocalendar.core.widget

import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue

/** Le lieu des lignes du widget est un ajout du natif : le corpus (TypeScript) ne le connaît pas. */
class WidgetPayloadTest {
    private val theme = WidgetTheme("#2a2a3c", "#c6d0f5", "#9aa2c6", "#658ff2")
    private val now = Instant.parse("2026-08-07T10:00:00Z")

    private fun event(id: String, hour: Int, location: String?) = DisplayEvent(
        id = id, title = "Cours $id",
        start = Instant.parse("2026-08-07T%02d:00:00Z".format(hour)),
        end = Instant.parse("2026-08-07T%02d:00:00Z".format(hour + 1)),
        allDay = false, color = "#89b4fa", editable = true, calendarId = "cal", calendarName = "Cal",
        isTask = false, taskCompleted = JsonPrimitive(false), taskStatus = null, reminders = null,
        isRecurring = false, isSeriesStart = false, isMultiDay = false, isSomeday = false,
        description = null, location = location,
    )

    private fun rowsOf(vararg events: DisplayEvent) =
        buildWidgetPayload(events.toList(), now, true, theme).toJson().getValue("rows").jsonArray.map { it.jsonObject }

    @Test
    fun aRowCarriesItsLocation() {
        val rows = rowsOf(event("a", 12, "Amphi B"))
        assertEquals("Amphi B", rows.single().getValue("location").let { (it as JsonPrimitive).content })
    }

    @Test
    fun theLocationIsTrimmed() {
        assertEquals("Salle 12", (rowsOf(event("a", 12, "  Salle 12 \n")).single().getValue("location") as JsonPrimitive).content)
    }

    @Test
    fun noLocationMeansNoKey() {
        val rows = rowsOf(event("a", 12, null), event("b", 13, ""), event("c", 14, "   "))
        assertEquals(3, rows.size)
        for (row in rows) assertFalse("pas de clé location : $row", "location" in row.keys)
    }

    @Test
    fun aMixOfRowsKeepsEachOwnLocation() {
        val rows = rowsOf(event("a", 12, "Amphi B"), event("b", 13, null))
        assertTrue("location" in rows[0].keys)
        assertFalse("location" in rows[1].keys)
    }

    @Test
    fun theCorpusShapeLeavesTheLocationOut() {
        val payload = buildWidgetPayload(listOf(event("a", 12, "Amphi B")), now, true, theme)
        val row: JsonObject = payload.toJson(withLocation = false).getValue("rows").jsonArray.single().jsonObject
        assertFalse("location" in row.keys)
    }

    @Test
    fun theDefaultThemeMatchesWhatTheWebViewReadsFromTheCss() {
        // Surface #1e1e2e relevée de 12 % d'encre #c6d0f5, encre atténuée de 28 % de surface.
        val t = widgetThemeOf("#1e1e2e", "#c6d0f5", "#658ff2")
        assertEquals(WidgetTheme(surface = "#323346", text = "#c6d0f5", muted = "#979ebd", accent = "#658ff2"), t)
    }

    @Test
    fun anUnreadableColourKeepsTheFirst() {
        assertEquals("rouge", mixColors("rouge", "#000000", 0.5))
        assertEquals("#123456", mixColors("#123456", "?", 0.5))
    }
}
