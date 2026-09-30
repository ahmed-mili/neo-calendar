package com.ahmed.neocalendar.core.notes

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/*
 * Port de managedMetadataFromMarkdown (managedEventNote.ts). Seul le
 * gestionnaire `neo-calendar:ics` est produit et lu ; toute autre note, ou un
 * jeu de marqueurs partiel, donne null.
 */

private fun JsonElement?.nonEmptyString(): String? =
    if (this is JsonPrimitive && this !is JsonNull && isString && content.jsTrim().isNotEmpty()) content else null

fun managedMetadataFromMarkdown(contents: String): JsonObject? {
    val raw = parseFrontmatter(contents) ?: return null
    val manager = raw["neoManagedBy"]
    if (manager !is JsonPrimitive || !manager.isString || manager.content != "neo-calendar:ics") return null

    val recurrence = raw["neoIcsRecurrenceId"]
    val recurrenceOk = raw.containsKey("neoIcsRecurrenceId") &&
        (recurrence is JsonNull || recurrence.nonEmptyString() != null)

    val version = raw["neoManagedVersion"]
    val versionOk = version is JsonPrimitive && version !is JsonNull && !version.isString && version.doubleOrNull == 1.0
    val status = raw["neoIcsStatus"]
    val statusOk = status is JsonPrimitive && status.isString && status.content == "confirmed"
    val feedId = raw["neoIcsFeedId"].nonEmptyString()
    val uid = raw["neoIcsUid"].nonEmptyString()

    if (!versionOk || feedId == null || uid == null || !recurrenceOk || !statusOk) return null

    return JsonObject(
        linkedMapOf(
            "neoManagedBy" to JsonPrimitive("neo-calendar:ics"),
            "neoManagedVersion" to JsonPrimitive(1L),
            "neoIcsFeedId" to JsonPrimitive(feedId),
            "neoIcsUid" to JsonPrimitive(uid),
            "neoIcsRecurrenceId" to (if (recurrence is JsonNull) JsonNull else JsonPrimitive(recurrence.nonEmptyString()!!)),
            "neoIcsStatus" to JsonPrimitive("confirmed"),
        )
    )
}
