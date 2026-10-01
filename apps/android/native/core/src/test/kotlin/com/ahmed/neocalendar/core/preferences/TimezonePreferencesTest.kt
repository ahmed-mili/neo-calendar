package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

private fun prefs(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject
private fun zones(p: JsonObject) = p.getValue("secondaryTimezones").jsonArray.map { (it as JsonPrimitive).content }

class TimezonePreferencesTest {
    @Test fun addingAndRemovingTouchesOnlyTheZoneList() {
        val start = prefs("""{"firstDay":1,"secondaryTimezones":["Asia/Tokyo"]}""")
        val added = withTimezoneAdded(start, "america/new_york")
        assertEquals(listOf("Asia/Tokyo", "America/New_York"), zones(added))
        assertEquals(JsonPrimitive(1), added["firstDay"])
        assertEquals(listOf("America/New_York"), zones(withTimezoneRemoved(added, "Asia/Tokyo")))
    }

    @Test fun aRepeatedOrUnknownZoneLeavesThePreferencesAsTheyWere() {
        val start = prefs("""{"secondaryTimezones":["Asia/Tokyo"]}""")
        assertSame(start, withTimezoneAdded(start, "Asia/Tokyo"))
        assertSame(start, withTimezoneAdded(start, "Nulle/Part"))
    }

    @Test fun applyingTheFrequencyToAllLinksClearsEveryOverride() {
        val start = prefs(
            """{"icsDefaultRefreshMinutes":30,"icsFeeds":[
                {"id":"a","calendarPath":"Etudes","name":"A","url":"https://x.test/a.ics","active":true,"refreshMinutes":5},
                {"id":"b","calendarPath":"Etudes","name":"B","url":"https://x.test/b.ics","active":true}]}"""
        )
        val next = withIcsRefreshOverridesCleared(start)
        val feeds = next.getValue("icsFeeds").jsonArray.map { it.jsonObject }
        assertEquals(listOf(false, false), feeds.map { "refreshMinutes" in it })
        assertEquals(listOf("a", "b"), feeds.map { (it.getValue("id") as JsonPrimitive).content })
        assertEquals(JsonPrimitive(30), next["icsDefaultRefreshMinutes"])
    }
}
