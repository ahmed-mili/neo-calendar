package com.ahmed.neocalendar.core.notes

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ce qu'on écrit se relit : pour chaque cas `serialize-*` valide, relire la
 *  note donne le même évènement que celui qu'on a écrit. */
class RoundTripTest {
    /** Hors aller-retour. rappels-exposants : écrit tel quel, mais le relecteur du
     *  TypeScript ne le relit pas (1e-7 revient en chaîne, évènement invalide).
     *  cle-non-possedee-gardee : la note garde par conception des lignes que
     *  l'évènement n'a plus (location, id...), donc relue elle a plus de champs. */
    private val unreadable = setOf(
        "serialize-neuve-rappels-exposants.json",
        "serialize-existante-cle-non-possedee-gardee.json",
    )

    @Test
    fun uneNoteEcriteSeRelitIdentique() {
        val dir = File(System.getProperty("conformance.dir") ?: error("conformance.dir non fourni par Gradle"), "notes")
        val cases = dir.listFiles { f -> f.name.startsWith("serialize-") && f.name.endsWith(".json") }!!.sortedBy { it.name }
        assertTrue("aucun cas serialize-*", cases.isNotEmpty())

        for (file in cases) {
            val case = Json.parseToJsonElement(file.readText()).jsonObject
            val expected = case.getValue("expected").jsonObject
            if ("error" in expected || file.name in unreadable) continue
            val event = case.getValue("input").jsonObject.getValue("event").jsonObject
            val text = expected.getValue("text").jsonPrimitive.content

            val reread = parseFrontmatter(text)
            assertNotNull("${file.name} : en-tête illisible", reread)
            assertEquals(file.name, validateEvent(event)?.toRecord(), validateEvent(reread!!)?.toRecord())
        }
    }
}
