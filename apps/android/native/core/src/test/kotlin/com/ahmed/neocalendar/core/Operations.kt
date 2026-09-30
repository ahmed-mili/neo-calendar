package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.notes.filenameForEvent
import com.ahmed.neocalendar.core.notes.parseFrontmatter
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Le pendant Kotlin de conformance/operations.ts : mêmes noms d'opération. */
val OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf(
    "notes.frontmatter" to { input -> parseFrontmatter(input.getValue("text").jsonPrimitive.content) ?: JsonNull },
    "notes.filename" to { input -> JsonPrimitive(filenameForEvent(input.getValue("event").jsonObject)) },
)
