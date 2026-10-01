package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class HiddenCalendarsTest {
    @Test
    fun laListeDesMasquesEstRemplaceeSansDoublons() {
        val prefs = JsonObject(mapOf("hiddenCalendarPaths" to JsonArray(listOf(JsonPrimitive("A"))), "autre" to JsonPrimitive(1)))
        val next = withHiddenCalendars(prefs, listOf("B", "C", "B"))
        assertEquals(JsonArray(listOf(JsonPrimitive("B"), JsonPrimitive("C"))), next["hiddenCalendarPaths"])
        assertEquals(JsonPrimitive(1), next["autre"])
    }

    @Test
    fun uneListeVideRetablitTout() {
        val prefs = JsonObject(mapOf("hiddenCalendarPaths" to JsonArray(listOf(JsonPrimitive("A")))))
        assertEquals(JsonArray(emptyList()), withHiddenCalendars(prefs, emptyList())["hiddenCalendarPaths"])
    }
}
