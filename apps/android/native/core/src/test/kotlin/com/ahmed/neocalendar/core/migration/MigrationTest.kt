package com.ahmed.neocalendar.core.migration

import com.ahmed.neocalendar.core.workspace.MemoryTree
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MigrationTest {
    private val at = Instant.parse("2026-10-01T10:00:00Z")
    private val settings = DeviceSettings(
        dayCount = 3,
        allDayCollapsed = true,
        icsRuntimeState = Json.parseToJsonElement("""{"a":{"lastSync":"x"}}"""),
        widgetCalendars = mapOf("w12" to setOf("b", "a"), "w10" to emptySet()),
    )

    @Test fun reminders_do_not_ring_when_the_new_app_is_there() {
        assertFalse(remindersMayRing(true))
        assertTrue(remindersMayRing(false))
        assertTrue(hasMovedOn(true))
        assertFalse(hasMovedOn(false))
    }

    @Test fun export_content() {
        val json = Json.parseToJsonElement(deviceSettingsJson(settings, at)).jsonObject
        assertEquals(1, json.getValue("version").jsonPrimitive.int)
        assertEquals("com.ahmed.neocalendar", json.getValue("writtenBy").jsonPrimitive.content)
        assertEquals("2026-10-01T10:00:00.000Z", json.getValue("writtenAt").jsonPrimitive.content)
        assertEquals(3, json.getValue("dayCount").jsonPrimitive.int)
        assertEquals(JsonPrimitive(true), json.getValue("allDayCollapsed"))
        assertEquals("x", json.getValue("icsRuntimeState").jsonObject.getValue("a").jsonObject.getValue("lastSync").jsonPrimitive.content)
        val widgets = json.getValue("widgetCalendars").jsonObject
        assertEquals(listOf("a", "b"), widgets.getValue("w12").jsonArray.map { it.jsonPrimitive.content })
        assertEquals(JsonArray(emptyList()), widgets.getValue("w10"))
    }

    @Test fun webview_storage_is_exported_as_is_and_omitted_when_absent() {
        val with = Json.parseToJsonElement(deviceSettingsJson(settings.copy(webViewLocalStorage = mapOf("wallpaper" to "a.jpg", "desktop-settings.json:x" to "{\"k\":1}")), at)).jsonObject
        val storage = with.getValue("webViewLocalStorage").jsonObject
        assertEquals("a.jpg", storage.getValue("wallpaper").jsonPrimitive.content)
        assertEquals("{\"k\":1}", storage.getValue("desktop-settings.json:x").jsonPrimitive.content)
        assertFalse(Json.parseToJsonElement(deviceSettingsJson(settings, at)).jsonObject.containsKey("webViewLocalStorage"))
    }

    @Test fun javascript_result_is_unwrapped() {
        assertEquals(mapOf("a" to "1", "b" to "{\"x\":2}"), webViewStorageFromJs("\"{\\\"a\\\":\\\"1\\\",\\\"b\\\":\\\"{\\\\\\\"x\\\\\\\":2}\\\"}\""))
        assertEquals(null, webViewStorageFromJs("null"))
        assertEquals(null, webViewStorageFromJs(null))
        assertEquals(null, webViewStorageFromJs("\"{}\""))
        assertEquals(null, webViewStorageFromJs("\"pas du json\""))
    }

    @Test fun missing_ics_state_is_null() {
        val json = Json.parseToJsonElement(deviceSettingsJson(settings.copy(icsRuntimeState = null), at)).jsonObject
        assertEquals(JsonNull, json.getValue("icsRuntimeState"))
    }

    @Test fun write_creates_folder_and_file_and_nothing_else() {
        val tree = MemoryTree()
        assertTrue(writeDeviceSettings(tree, deviceSettingsJson(settings, at)))
        assertEquals(setOf(".neo-calendar/android-device-settings.json"), tree.files.keys)
    }

    @Test fun unchanged_settings_are_not_rewritten_but_a_change_is() {
        val tree = MemoryTree()
        writeDeviceSettings(tree, deviceSettingsJson(settings, at))
        assertFalse(writeDeviceSettings(tree, deviceSettingsJson(settings, at.plusSeconds(60))))
        assertTrue(writeDeviceSettings(tree, deviceSettingsJson(settings.copy(dayCount = 7), at.plusSeconds(120))))
        val stored = Json.parseToJsonElement(tree.files.getValue(".neo-calendar/android-device-settings.json")) as JsonObject
        assertEquals(7, stored.getValue("dayCount").jsonPrimitive.int)
    }

    @Test fun unreadable_existing_file_is_replaced() {
        val tree = MemoryTree().file(".neo-calendar/android-device-settings.json", "pas du json")
        assertTrue(writeDeviceSettings(tree, deviceSettingsJson(settings, at)))
    }
}
