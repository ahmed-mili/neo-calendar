package com.ahmed.neocalendar.core

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class ConformanceTest(private val label: String, private val file: File) {
    companion object {
        private val root = File(
            System.getProperty("conformance.dir") ?: error("conformance.dir non fourni par Gradle")
        )

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun cases(): List<Array<Any>> {
            val files = root.walkTopDown().filter { it.isFile && it.extension == "json" }.sortedBy { it.path }.toList()
            assertTrue("le corpus est vide : $root", files.isNotEmpty())
            return files.map { arrayOf(it.relativeTo(root).invariantSeparatorsPath, it) }
        }
    }

    @Test
    fun reproduitLeTypeScript() {
        val case: JsonObject = Json.parseToJsonElement(file.readText()).jsonObject
        val fn = case.getValue("fn").jsonPrimitive.content
        val operation = OPERATIONS[fn] ?: error("Opération inconnue : $fn")
        // JsonObject est une Map : l'égalité ignore l'ordre des clés, comme toEqual.
        assertEquals(case.getValue("expected"), operation(case.getValue("input").jsonObject))
    }
}
