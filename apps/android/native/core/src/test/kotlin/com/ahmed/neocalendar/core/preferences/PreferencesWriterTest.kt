package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Ce que le corpus (`ecriture-*.json`) ne pose pas : les bornes de l'ordre des
 * clés de JS (attendu relevé avec `JSON.stringify` sous Node) et le repli décimal
 * de `JSONObject.numberToString` (attendu relevé avec la vraie classe `org.json`
 * d'Android, libcore, compilée à part avec le JDK sur les sources du SDK 37).
 */
class PreferencesWriterTest {
    private fun text(vararg pairs: Pair<String, Any>): String =
        preferencesFileText(
            JsonObject(
                pairs.associate { (key, value) ->
                    key to when (value) {
                        is String -> JsonPrimitive(value)
                        is Number -> JsonPrimitive(value)
                        else -> error("type")
                    }
                }
            )
        )

    @Test
    fun uneCleEntiereTropGrandeResteALaPlaceDInsertion() {
        // 4294967294 est le dernier indice de tableau de JS ; 4294967295 n'en est plus un.
        assertEquals(
            "{\n  \"4294967294\": 1,\n  \"b\": 2,\n  \"4294967295\": 3\n}\n",
            text("b" to 2, "4294967295" to 3, "4294967294" to 1)
        )
    }

    @Test
    fun unNombreDecimalPasseParDoubleToString() {
        assertEquals("{\n  \"x\": 0.5\n}\n", text("x" to 0.5))
        assertEquals("{\n  \"x\": 10\n}\n", text("x" to 10.0))
    }

    @Test
    fun unObjetEtUnTableauVidesSecriventSansSautDeLigne() {
        val preferences = JsonObject(mapOf("a" to JsonObject(emptyMap()), "b" to JsonArray(emptyList())))
        assertEquals("{\n  \"a\": {},\n  \"b\": []\n}\n", preferencesFileText(preferences))
    }
}
