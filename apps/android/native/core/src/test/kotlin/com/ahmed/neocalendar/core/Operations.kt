package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.notes.filenameForEvent
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/** Le pendant Kotlin de conformance/operations.ts : mêmes noms d'opération. */
val OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf(
    "notes.filename" to { input -> JsonPrimitive(filenameForEvent(input.getValue("event").jsonObject)) },
)
