package com.ahmed.neocalendar.core.migration

import com.ahmed.neocalendar.core.workspace.MemoryTree
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MigrationTest {
    private val path = ".neo-calendar/android-device-settings.json"
    private val full = """
        {
          "version": 1,
          "writtenBy": "com.ahmed.neocalendar",
          "writtenAt": "2026-10-01T10:00:00.000Z",
          "dayCount": 3,
          "allDayCollapsed": true,
          "icsRuntimeState": { "a": { "lastSync": "x" } },
          "widgetCalendars": { "w12": ["b", "a"], "w10": [] },
          "webViewLocalStorage": { "wallpaper": "a.jpg", "desktop-settings.json:x": "{\"k\":1}" }
        }
    """.trimIndent()

    @Test fun full_export_maps_to_settings() {
        val s = parseDeviceSettings(full)!!
        assertEquals(3, s.dayCount)
        assertEquals(true, s.allDayCollapsed)
        assertEquals("""{"a":{"lastSync":"x"}}""", s.icsRuntimeState)
        assertEquals(mapOf("w12" to setOf("a", "b"), "w10" to emptySet<String>()), s.widgetCalendars)
        assertEquals(mapOf("wallpaper" to "a.jpg", "desktop-settings.json:x" to "{\"k\":1}"), s.webViewLocalStorage)
    }

    @Test fun missing_or_malformed_fields_stay_default() {
        val s = parseDeviceSettings(
            """{"version":1,"writtenBy":"com.ahmed.neocalendar","dayCount":"trois","allDayCollapsed":"true","icsRuntimeState":null,"widgetCalendars":{"w1":"x","w2":["a",3]},"webViewLocalStorage":{"k":4,"j":"v"}}""",
        )!!
        assertNull(s.dayCount)
        assertNull(s.allDayCollapsed)
        assertNull(s.icsRuntimeState)
        assertEquals(mapOf("w2" to setOf("a")), s.widgetCalendars)
        assertEquals(mapOf("j" to "v"), s.webViewLocalStorage)
        val bare = parseDeviceSettings("""{"version":1,"writtenBy":"com.ahmed.neocalendar"}""")!!
        assertNull(bare.dayCount)
        assertTrue(bare.webViewLocalStorage.isEmpty())
    }

    @Test fun unusable_exports_are_ignored() {
        assertNull(parseDeviceSettings(null))
        assertNull(parseDeviceSettings("pas du json"))
        assertNull(parseDeviceSettings("[1]"))
        assertNull(parseDeviceSettings(full.replace("\"version\": 1", "\"version\": 2")))
        assertNull(parseDeviceSettings(full.replace("com.ahmed.neocalendar", "com.autre.app")))
        assertNull(parseDeviceSettings("""{"writtenBy":"com.ahmed.neocalendar"}"""))
    }

    @Test fun read_finds_the_file_and_ignores_absent_or_unreadable() {
        assertNull(readDeviceSettings(MemoryTree()))
        assertNull(readDeviceSettings(MemoryTree().file(path, "pas du json")))
        assertNotNull(readDeviceSettings(MemoryTree().file(path, full)))
    }

    @Test fun delete_removes_only_the_export() {
        val tree = MemoryTree().file(path, full).file("Essai/a.md", "x")
        deleteDeviceSettings(tree)
        assertFalse(tree.files.containsKey(path))
        assertTrue(tree.files.containsKey("Essai/a.md"))
        deleteDeviceSettings(tree)
    }

    @Test fun script_writes_every_key_as_is() {
        val script = localStorageScript(mapOf("a" to "x\"y</script>\n", "b" to "{\"k\":1}"))
        assertTrue(script.contains("localStorage.setItem"))
        assertTrue(script.contains("""var d={"a":"x\"y</script>\n","b":"{\"k\":1}"};"""))
    }
}
