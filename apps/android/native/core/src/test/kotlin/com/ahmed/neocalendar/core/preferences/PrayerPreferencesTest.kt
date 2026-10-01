package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

private fun prefs(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

class PrayerPreferencesTest {
    @Test fun choosingAMosqueWritesOneEntryAndKeepsTheOthers() {
        val start = prefs("""{"firstDay":1,"prayerMosques":{"Etudes":"villejuif"}}""")
        val next = withPrayerMosque(start, "Islam", "kremlin-bicetre")
        assertEquals(prefs("""{"firstDay":1,"prayerMosques":{"Etudes":"villejuif","Islam":"kremlin-bicetre"}}"""), next)
    }

    @Test fun choosingNoneRemovesTheEntryInsteadOfWritingAnEmptyString() {
        val start = prefs("""{"prayerMosques":{"Islam":"villejuif"}}""")
        assertEquals(prefs("""{"prayerMosques":{}}"""), withPrayerMosque(start, "Islam", null))
    }

    @Test fun theLineColourAndItsResetOnlyTouchTheirOwnEntry() {
        val coloured = withPrayerColor(prefs("{}"), "Islam", "#4aabe0")
        assertEquals(prefs("""{"prayerColors":{"Islam":"#4aabe0"}}"""), coloured)
        assertEquals(prefs("""{"prayerColors":{}}"""), withPrayerColor(coloured, "Islam", null))
    }

    @Test fun jumuaSessionsAreStoredAsAListAndRemovedToFollowTheMosque() {
        val chosen = withPrayerJumua(prefs("""{"prayerMosques":{"Islam":"villejuif"}}"""), "Islam", listOf("12:30", "13:30"))
        assertEquals(prefs("""{"prayerMosques":{"Islam":"villejuif"},"prayerJumua":{"Islam":["12:30","13:30"]}}"""), chosen)
        assertEquals(prefs("""{"prayerMosques":{"Islam":"villejuif"},"prayerJumua":{}}"""), withPrayerJumua(chosen, "Islam", null))
    }
}
