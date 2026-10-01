package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class HolidayCalendarTest {
    private val base = JsonObject(
        mapOf(
            "colors" to JsonObject(mapOf("Etudes" to JsonPrimitive("#0036b2"))),
            "order" to JsonArray(listOf(JsonPrimitive("Etudes"))),
            "externalCalendars" to JsonArray(emptyList()),
        ),
    )

    @Test
    fun laSourceLaCouleurEtLOrdreSontPosesSousLaCleAuto() {
        val next = withHolidayCalendar(base, null, "#4a9d5f")
        val sources = next["externalCalendars"] as JsonArray
        assertEquals(1, sources.size)
        val source = sources[0] as JsonObject
        assertEquals(JsonPrimitive("auto"), source["type"])
        assertEquals(JsonPrimitive(FRANCE_HOLIDAY_NAME), source["name"])
        assertEquals(JsonPrimitive("#4a9d5f"), (next["colors"] as JsonObject)["auto::FR"])
        assertEquals(JsonPrimitive("#0036b2"), (next["colors"] as JsonObject)["Etudes"])
        assertEquals(JsonArray(listOf(JsonPrimitive("Etudes"), JsonPrimitive("auto::FR"))), next["order"])
    }

    @Test
    fun unNomChoisiRemplaceCeluiDuModele() {
        val next = withHolidayCalendar(base, "  Fériés  ", "#123456")
        val source = (next["externalCalendars"] as JsonArray)[0] as JsonObject
        assertEquals(JsonPrimitive("Fériés"), source["name"])
        assertEquals(JsonPrimitive("#123456"), source["color"])
        assertTrue((source["rules"] as JsonArray).size > 10)
    }

    @Test
    fun uneSecondeAjoutEstRefusee() {
        val once = withHolidayCalendar(base, null, "#4a9d5f")
        assertThrows(IllegalStateException::class.java) { withHolidayCalendar(once, null, "#4a9d5f") }
    }
}
