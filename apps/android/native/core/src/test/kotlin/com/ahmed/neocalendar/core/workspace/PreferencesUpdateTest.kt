package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.preferences.withCalendarColor
import com.ahmed.neocalendar.core.preferences.withCalendarHidden
import com.ahmed.neocalendar.core.preferences.withCalendarOrder
import com.ahmed.neocalendar.core.preferences.withCalendarReminder
import com.ahmed.neocalendar.core.preferences.withDefaultCalendar
import com.ahmed.neocalendar.core.preferences.withSetting
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class PreferencesUpdateTest {
    private val file = ".neo-calendar/.neo-calendar.json"

    /** Le fichier réel du téléphone (émulateur, 2026-10-01), tel que l'écrit la WebView. */
    private val real = """{
  "version": 5,
  "colors": {
    "Islam": "#045d05",
    "Etudes": "#0036b2"
  },
  "order": [
    "Islam",
    "Etudes"
  ],
  "hiddenCalendarPaths": [],
  "showWeekNumbers": false,
  "secondaryTimezones": [],
  "initialView": {
    "desktop": "week",
    "mobile": "3days"
  },
  "firstDay": 1,
  "timeFormat24h": true,
  "clickToCreateEventFromMonthView": true,
  "freeScroll": false,
  "defaultEventsAsTasks": true,
  "reminderMinutes": [
    10,
    15,
    30,
    60
  ],
  "calendarReminderMinutes": {
    "Etudes": [
      5,
      10,
      15,
      30,
      90
    ]
  },
  "mapsTravelMode": "auto",
  "mapsApp": "ask",
  "icsDefaultRefreshMinutes": 60,
  "icsFeeds": [
    {
      "id": "043e6f6c-595c-423b-9dd1-f57be1ed5fd1",
      "calendarPath": "Etudes",
      "name": "Planning Efrei",
      "url": "https:\/\/www.myefrei.fr\/api\/public\/student\/planning\/Wb5DHNwTWy3Gj765ZwxDTA",
      "active": true,
      "directory": "Etudes\/Planning Efrei",
      "address": "Efrei Paris Villejuif"
    }
  ],
  "externalCalendars": [],
  "prayerMosques": {
    "Islam": "foi-et-unicite"
  },
  "prayerColors": {
    "Islam": "#5d042f"
  }
}
"""

    private fun treeWith(text: String) = MemoryTree().file(file, text)

    private fun fileOf(tree: MemoryTree) = Json.parseToJsonElement(tree.files.getValue(file)) as JsonObject

    private fun strings(obj: JsonObject, key: String) = (obj.getValue(key) as JsonArray).map { (it as JsonPrimitive).content }

    private fun JsonElement.minus(key: String) = JsonObject((this as JsonObject).filterKeys { it != key })

    // Le point critique : un fichier corrompu n'est JAMAIS écrasé par des valeurs par défaut.
    @Test fun aCorruptFileIsNeverWritten() {
        for (corrupt in listOf("{\"version\": 5, \"colors\": {", "pas du json", "[1, 2]", "{\"a\": }")) {
            val tree = treeWith(corrupt)
            try {
                updatePreferences(tree) { withSetting(it, "firstDay", JsonPrimitive(3)) }
                fail("accepté : $corrupt")
            } catch (e: UnreadablePreferencesException) {
                assertTrue(e.message!!.startsWith("Le fichier de preferences est illisible"))
            }
            assertEquals(corrupt, tree.files[file])
            assertTrue("aucune écriture : ${tree.log}", tree.log.isEmpty())
        }
    }

    @Test fun anUnreadableFileBlocksTheCalendarRenameToo() {
        val tree = treeWith("{ corrompu").dir("Islam")
        try {
            renameCalendar(tree, "Islam", "Prière")
            fail()
        } catch (e: UnreadablePreferencesException) {
            // attendu
        }
        assertTrue("Islam" in tree.dirs)
        assertFalse("Prière" in tree.dirs)
        assertEquals("{ corrompu", tree.files[file])
        assertTrue(tree.log.isEmpty())
    }

    // Syncthing a changé le fichier depuis l'instantané de l'écran : seule la clé demandée change, le reste est celui du fichier.
    @Test fun onlyTheRequestedKeyIsAppliedOnTheFreshFile() {
        // L'écran croit : rien de masqué, firstDay 1. Entre-temps le PC a masqué Islam et mis firstDay à 0.
        val onTheOtherDevice = real
            .replace("\"hiddenCalendarPaths\": []", "\"hiddenCalendarPaths\": [\n    \"Islam\"\n  ]")
            .replace("\"firstDay\": 1", "\"firstDay\": 0")
        val tree = treeWith(onTheOtherDevice)
        updatePreferences(tree) { withCalendarHidden(it, "Etudes", true) }
        val written = fileOf(tree)
        assertEquals(listOf("Islam", "Etudes"), strings(written, "hiddenCalendarPaths"))
        assertEquals(JsonPrimitive(0), written["firstDay"])
        assertEquals(Json.parseToJsonElement(onTheOtherDevice).minus("hiddenCalendarPaths"), written.minus("hiddenCalendarPaths"))
    }

    // Une clé que cette version ne connaît pas (un réglage d'une version plus récente du PC) survit.
    @Test fun unknownKeysAreKept() {
        val tree = treeWith("{\n  \"version\": 6,\n  \"futur\": {\"x\": [1, 2]},\n  \"firstDay\": 2\n}\n")
        updatePreferences(tree) { withSetting(it, "timeFormat24h", JsonPrimitive(false)) }
        val written = fileOf(tree)
        assertEquals(JsonPrimitive(6), written["version"])
        assertTrue("futur" in written)
        assertEquals(JsonPrimitive(2), written["firstDay"])
        assertEquals(JsonPrimitive(false), written["timeFormat24h"])
        // Les clés que le fichier n'avait pas ne sont pas ajoutées avec leur défaut.
        assertFalse("mapsApp" in written)
    }

    // La partie d'appareil ne va jamais dans le fichier partagé.
    @Test fun deviceKeysAreNotWritten() {
        val tree = treeWith("{\"viewType\": \"week\", \"dayCount\": 5, \"sidebarVisible\": false, \"allDayCollapsed\": true, \"firstDay\": 2}")
        updatePreferences(tree) { withSetting(it, "freeScroll", JsonPrimitive(true)) }
        val written = fileOf(tree)
        for (key in listOf("viewType", "dayCount", "sidebarVisible", "allDayCollapsed")) assertFalse(key, key in written)
        assertEquals(JsonPrimitive(true), written["freeScroll"])
    }

    // Le format est celui du téléphone, octet pour octet : changer une clé puis la remettre rend le fichier d'origine.
    @Test fun changingAKeyAndPuttingItBackGivesTheOriginalBytes() {
        val tree = treeWith(real)
        updatePreferences(tree) { withSetting(it, "firstDay", JsonPrimitive(3)) }
        assertEquals(real.replace("\"firstDay\": 1", "\"firstDay\": 3"), tree.files.getValue(file))
        updatePreferences(tree) { withSetting(it, "firstDay", JsonPrimitive(1)) }
        assertEquals(real, tree.files.getValue(file))
    }

    @Test fun aChangeThatChangesNothingWritesNothing() {
        val tree = treeWith(real)
        updatePreferences(tree) { withSetting(it, "firstDay", JsonPrimitive(1)) }
        updatePreferences(tree) { withCalendarHidden(it, "Etudes", false) }
        assertTrue(tree.log.isEmpty())
        assertEquals(real, tree.files[file])
    }

    @Test fun aMissingFileIsAFirstRunAndGetsTheDefaultsPlusTheChange() {
        val tree = MemoryTree().dir("Islam")
        updatePreferences(tree) { withCalendarHidden(it, "Islam", true) }
        val written = fileOf(tree)
        assertEquals(listOf("Islam"), strings(written, "hiddenCalendarPaths"))
        assertEquals(JsonPrimitive(5), written["version"])
        assertEquals(JsonPrimitive(1), written["firstDay"])
        assertFalse("viewType" in written)
        assertTrue(tree.files.getValue(file).endsWith("}\n"))
    }

    @Test fun aBlankFileIsAFirstRun() {
        val tree = treeWith("  \n")
        updatePreferences(tree) { withSetting(it, "mapsApp", JsonPrimitive("waze")) }
        assertEquals(JsonPrimitive("waze"), fileOf(tree)["mapsApp"])
    }

    @Test fun legacyRootFilesAreReadThenRemoved() {
        val tree = MemoryTree().file(".neo-calendar.json", "{\"firstDay\": 4, \"colors\": {\"A\": \"#111111\"}}")
        updatePreferences(tree) { withSetting(it, "freeScroll", JsonPrimitive(true)) }
        assertFalse(".neo-calendar.json" in tree.files)
        val written = fileOf(tree)
        assertEquals(JsonPrimitive(4), written["firstDay"])
        assertTrue("A" in (written["colors"] as JsonObject))
    }

    @Test fun anIoFailureWhileWritingKeepsTheOldFile() {
        val tree = treeWith(real)
        tree.failWritesTo = file
        try {
            updatePreferences(tree) { withSetting(it, "firstDay", JsonPrimitive(3)) }
            fail()
        } catch (e: java.io.IOException) {
            // attendu
        }
        assertEquals(real, tree.files[file])
    }

    @Test fun calendarChangesAreAppliedToTheFreshFile() {
        val tree = treeWith(real)
        updatePreferences(tree) { withCalendarColor(it, "Islam", "#ff0000") }
        updatePreferences(tree) { withDefaultCalendar(it, "Etudes") }
        updatePreferences(tree) { withCalendarOrder(it, listOf("Etudes", "Islam")) }
        updatePreferences(tree) { withCalendarReminder(it, "Islam", listOf(5L, 30L)) }
        updatePreferences(tree) { withCalendarReminder(it, "Etudes", null) }
        val written = fileOf(tree)
        val original = Json.parseToJsonElement(real) as JsonObject
        assertEquals(JsonPrimitive("#ff0000"), (written["colors"] as JsonObject)["Islam"])
        assertEquals(JsonPrimitive("#0036b2"), (written["colors"] as JsonObject)["Etudes"])
        assertEquals(JsonPrimitive("Etudes"), written["defaultCalendarPath"])
        assertEquals(listOf("Etudes", "Islam"), strings(written, "order"))
        val reminders = written["calendarReminderMinutes"] as JsonObject
        assertEquals(listOf("5", "30"), (reminders.getValue("Islam") as JsonArray).map { (it as JsonPrimitive).content })
        assertFalse("Etudes" in reminders)
        // Ni les liens ICS ni la prière ne sont touchés.
        assertEquals(original["icsFeeds"], written["icsFeeds"])
        assertEquals(original["prayerMosques"], written["prayerMosques"])
    }

    @Test fun renamingACalendarMovesTheFolderAndItsPreferences() {
        val tree = treeWith(real.replace("\"hiddenCalendarPaths\": []", "\"hiddenCalendarPaths\": [\n    \"Etudes\"\n  ]")).dir("Etudes").dir("Islam")
        updatePreferences(tree) { withDefaultCalendar(it, "Etudes") }
        assertEquals("Cours", renameCalendar(tree, "Etudes", " Cours "))
        assertTrue("Cours" in tree.dirs)
        assertFalse("Etudes" in tree.dirs)
        val written = fileOf(tree)
        val colors = written["colors"] as JsonObject
        assertEquals(JsonPrimitive("#0036b2"), colors["Cours"])
        assertFalse("Etudes" in colors)
        assertEquals(listOf("Islam", "Cours"), strings(written, "order"))
        assertEquals(listOf("Cours"), strings(written, "hiddenCalendarPaths"))
        assertEquals(JsonPrimitive("Cours"), written["defaultCalendarPath"])
        assertTrue("Cours" in (written["calendarReminderMinutes"] as JsonObject))
    }

    @Test fun renamingToATakenOrInvalidNameChangesNothing() {
        val tree = treeWith(real).dir("Etudes").dir("Islam")
        for (bad in listOf("Islam", "", "..", "a/b")) {
            try {
                renameCalendar(tree, "Etudes", bad)
                fail("accepté : '$bad'")
            } catch (e: RuntimeException) {
                // attendu
            }
        }
        assertTrue("Etudes" in tree.dirs)
        assertEquals(real, tree.files[file])
    }

    @Test fun hidingAndShowingKeepsTheOtherPaths() {
        val tree = treeWith("{\"hiddenCalendarPaths\": [\"A\", \"B\"]}")
        updatePreferences(tree) { withCalendarHidden(it, "C", true) }
        updatePreferences(tree) { withCalendarHidden(it, "C", true) }
        updatePreferences(tree) { withCalendarHidden(it, "A", false) }
        assertEquals(listOf("B", "C"), strings(fileOf(tree), "hiddenCalendarPaths"))
    }

    // Dossiers de calendriers : noms validés comme le Java.
    @Test fun folderNamesAreValidatedLikeTheJava() {
        val tree = MemoryTree()
        for (bad in listOf("", "   ", ".", "..", "a/b", "a\\b")) {
            try {
                createFolder(tree, bad)
                fail("accepté : '$bad'")
            } catch (e: IllegalArgumentException) {
                assertTrue(e.message!!.startsWith("Nom invalide"))
            }
        }
        assertTrue(tree.dirs.isEmpty())
        // Un nom qui finit par .md est un nom de dossier valide (seul un fichier de note l'exige).
        assertEquals("Notes.md", createFolder(tree, "Notes.md"))
    }

    @Test fun renamingOrDeletingAMissingFolder() {
        val tree = MemoryTree().dir("Etudes")
        try {
            renameFolder(tree, "Absent", "Autre")
            fail()
        } catch (e: IllegalStateException) {
            assertEquals("Calendrier introuvable.", e.message)
        }
        try {
            renameFolder(tree, "Etudes", "Etudes")
            fail()
        } catch (e: IllegalStateException) {
            assertEquals("Un dossier portant ce nom existe deja.", e.message)
        }
        deleteFolder(tree, "Absent")
        assertTrue("Etudes" in tree.dirs)
    }

    @Test fun aNonEmptyFolderIsNeverDeleted() {
        val tree = MemoryTree().file("Etudes/.cache", "x")
        try {
            deleteFolder(tree, "Etudes")
            fail()
        } catch (e: IllegalStateException) {
            assertEquals("Ce calendrier nest pas vide.", e.message)
        }
        assertTrue("Etudes/.cache" in tree.files)
    }
}
