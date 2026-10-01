package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.ics.IcsSyncState
import com.ahmed.neocalendar.core.ics.dueIcsLinks
import com.ahmed.neocalendar.core.ics.formatLastIcsSync
import com.ahmed.neocalendar.core.ics.icsLinksOf
import com.ahmed.neocalendar.core.ics.icsStatesFromJson
import com.ahmed.neocalendar.core.ics.icsStatesToJson
import com.ahmed.neocalendar.core.preferences.icsFeedProblem
import com.ahmed.neocalendar.core.preferences.withIcsFeedAdded
import com.ahmed.neocalendar.core.preferences.withIcsFeedDirectory
import com.ahmed.neocalendar.core.preferences.withIcsFeedEdited
import com.ahmed.neocalendar.core.preferences.withIcsFeedRemoved
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class IcsFeedsPreferencesTest {
    private val file = ".neo-calendar/.neo-calendar.json"
    private val base = """{
  "version": 5,
  "colors": {},
  "order": [],
  "firstDay": 2,
  "inconnue": "gardee",
  "icsDefaultRefreshMinutes": 60,
  "icsFeeds": [
    {
      "id": "efrei",
      "calendarPath": "Etudes",
      "name": "Planning Efrei",
      "url": "https:\/\/example.com\/efrei",
      "active": true,
      "directory": "Etudes\/Planning Efrei",
      "address": "Efrei Paris Villejuif"
    }
  ]
}
"""

    private fun tree(text: String = base) = MemoryTree().dir("Etudes").file(file, text)

    private fun feeds(tree: MemoryTree): List<JsonObject> =
        ((Json.parseToJsonElement(tree.files.getValue(file)) as JsonObject).getValue("icsFeeds") as JsonArray).map { it as JsonObject }

    private fun text(feed: JsonObject, key: String) = (feed[key] as JsonPrimitive).content

    @Test fun addingALinkWritesOnlyTheFeedsKeyAndKeepsTheOthers() {
        val tree = tree()
        updatePreferences(tree) { withIcsFeedAdded(it, "nouveau", "Etudes", " Test ", "webcal://example.com/test") }
        val written = feeds(tree)
        assertEquals(2, written.size)
        assertEquals("efrei", text(written[0], "id"))
        assertEquals("Etudes/Planning Efrei", text(written[0], "directory"))
        assertEquals("Test", text(written[1], "name"))
        assertEquals("https://example.com/test", text(written[1], "url"))
        assertEquals(listOf("id", "calendarPath", "name", "url", "active"), written[1].keys.toList())
        assertTrue(tree.files.getValue(file).contains("\"inconnue\": \"gardee\""))
        assertTrue(tree.files.getValue(file).contains("\"firstDay\": 2"))
    }

    @Test fun theProblemsTheLinkPanelNames() {
        assertEquals("Cette adresse n'est pas valide. Entrez une adresse HTTPS ou webcal.", icsFeedProblem("A", "pas une adresse", emptyList()))
        assertEquals("Cette adresse n'est pas valide. Entrez une adresse HTTPS ou webcal.", icsFeedProblem("  ", "https://a.fr/x", emptyList()))
        assertEquals("Ce lien est déjà utilisé par un autre flux de ce calendrier.", icsFeedProblem("A", "webcal://a.fr/x", listOf("https://a.fr/x")))
        assertEquals("Ce calendrier a déjà le maximum de cinq liens ICS.", icsFeedProblem("A", "https://a.fr/y", List(5) { "https://a.fr/$it" }))
        assertNull(icsFeedProblem("A", "https://a.fr/y", listOf("https://a.fr/x")))
    }

    @Test fun aRefusedLinkWritesNothing() {
        val tree = tree()
        val before = tree.files.getValue(file)
        try {
            updatePreferences(tree) { withIcsFeedAdded(it, "dup", "Etudes", "Doublon", "https://example.com/efrei") }
            fail("même adresse que le lien existant")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("déjà utilisé"))
        }
        assertEquals(before, tree.files.getValue(file))
        assertTrue(tree.log.isEmpty())
    }

    @Test fun editingChangesOnlyTheFieldsGiven() {
        val tree = tree()
        updatePreferences(tree) { withIcsFeedEdited(it, "efrei", refreshMinutes = 15) }
        updatePreferences(tree) { withIcsFeedEdited(it, "efrei", name = "Efrei 2") }
        updatePreferences(tree) { withIcsFeedEdited(it, "efrei", address = "") }
        val feed = feeds(tree).single()
        assertEquals("Efrei 2", text(feed, "name"))
        assertEquals("15", text(feed, "refreshMinutes"))
        assertNull(feed["address"])
        assertEquals("Etudes/Planning Efrei", text(feed, "directory"))
    }

    @Test fun removingALinkLeavesItsNotesAlone() {
        val tree = tree().file("Etudes/Planning Efrei/2026-10-05 Cours.md", "note")
        updatePreferences(tree) { withIcsFeedRemoved(it, "efrei") }
        assertTrue(feeds(tree).isEmpty())
        assertEquals("note", tree.files["Etudes/Planning Efrei/2026-10-05 Cours.md"])
    }

    @Test fun theFolderIsNotedOnceCreated() {
        val tree = tree(base.replace("      \"directory\": \"Etudes\\/Planning Efrei\",\n", ""))
        assertNull(feeds(tree).single()["directory"])
        updatePreferences(tree) { withIcsFeedDirectory(it, "efrei", "Etudes/Planning Efrei") }
        assertEquals("Etudes/Planning Efrei", text(feeds(tree).single(), "directory"))
    }

    @Test fun aCorruptedPreferencesFileRefusesTheChange() {
        val broken = "{ \"version\": 5, \"icsFeeds\": ["
        val tree = tree(broken)
        try {
            updatePreferences(tree) { withIcsFeedAdded(it, "x", "Etudes", "A", "https://a.fr/x") }
            fail("fichier illisible")
        } catch (e: UnreadablePreferencesException) {
            // rien n'est écrit
        }
        assertEquals(broken, tree.files.getValue(file))
    }

    @Test fun runtimeStatesSurviveTheirJsonAndATornFile() {
        val states = mapOf(
            "a" to IcsSyncState("2026-10-01T09:00:00.000Z", "2026-09-30T09:00:00.000Z", 4, mapOf("u1" to 1L), "Le serveur a répondu HTTP 404."),
            "b" to IcsSyncState(null, null, 0, emptyMap()),
        )
        assertEquals(states, icsStatesFromJson(icsStatesToJson(states).toString()))
        assertEquals(emptyMap<String, IcsSyncState>(), icsStatesFromJson("{ pas du json"))
        assertEquals(emptyMap<String, IcsSyncState>(), icsStatesFromJson(null))
        assertEquals(setOf("b"), icsStatesFromJson("""{"a": 3, "b": {"knownEventCount": 2}}""").keys)
    }

    // Le lien d'Efrei, tel que le fichier le porte, est dû tant qu'aucun état ne le connaît.
    @Test fun theLinksOfThePreferencesAreDueWhenNeverSynced() {
        val links = icsLinksOf(JsonArray(feeds(tree())))
        assertEquals("Etudes/Planning Efrei", links.single().directory)
        assertEquals("Efrei Paris Villejuif", links.single().address)
        val now = Instant.parse("2026-10-01T10:00:00Z")
        assertEquals(1, dueIcsLinks(links, emptyMap(), now, 60).size)
        assertEquals(0, dueIcsLinks(links, mapOf("efrei" to IcsSyncState("2099-01-01T00:00:00.000Z", null, 0, emptyMap())), now, 60).size)
    }

    // « Dernière synchro. le 30/08/2026 à 18h05 » : l'heure de l'appareil, un « h » littéral.
    @Test fun theLastSyncReadsInLocalTime() {
        val paris = java.time.ZoneId.of("Europe/Paris")
        assertEquals("Dernière synchro. le 30/08/2026 à 18h05", formatLastIcsSync("2026-08-30T16:05:00.000Z", paris))
        assertEquals("Dernière synchro. le 01/01/2027 à 00h30", formatLastIcsSync("2026-12-31T23:30:00.000Z", paris))
        assertEquals("pas une date", formatLastIcsSync("pas une date", paris))
    }
}
