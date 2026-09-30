package com.ahmed.neocalendar.core.notes

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Port de filenameForEvent (desktopEventFormat.ts). Complété en Task 5. */
fun filenameForEvent(event: JsonObject): String {
    val title = event.getValue("title").jsonPrimitive.content
    val date = event.getValue("date").jsonPrimitive.content
    return "$date $title.md"
}
