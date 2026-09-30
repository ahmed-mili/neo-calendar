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

/** `MANAGED_KEYS` de managedEventNote.ts : les clés que ce module possède, pour les deux gestionnaires. */
private val MANAGED_KEYS = setOf(
    "neoManagedBy", "neoManagedVersion", "neoIcsFeedId", "neoIcsUid", "neoIcsRecurrenceId", "neoIcsStatus",
    "neoIslamicId", "neoIslamicCategory", "neoIslamicTraditions",
)

/**
 * Port de serializeManagedEventMarkdown pour le gestionnaire `neo-calendar:ics` :
 * l'en-tête de l'évènement tel que l'écrit serializeEventMarkdown, puis les
 * marqueurs `neo*` ajoutés à la fin, toute copie précédente retirée d'abord.
 */
fun serializeManagedEventMarkdown(
    event: NeoEvent,
    feedId: String,
    uid: String,
    recurrenceId: String?,
    previousContents: String = "",
): String {
    val document = extractFrontmatter(serializeEventMarkdown(event, previousContents))
        ?: error("The serialized event note has no frontmatter.")

    val kept = document.lines.filter { line ->
        val colon = line.indexOf(':')
        colon <= 0 || line.substring(0, colon).jsTrim() !in MANAGED_KEYS
    }
    val lines = kept + listOf(
        "neoManagedBy: ${jsonQuote("neo-calendar:ics")}",
        "neoManagedVersion: 1",
        "neoIcsFeedId: ${jsonQuote(feedId)}",
        "neoIcsUid: ${jsonQuote(uid)}",
        "neoIcsRecurrenceId: ${if (recurrenceId == null) "null" else jsonQuote(recurrenceId)}",
        "neoIcsStatus: ${jsonQuote("confirmed")}",
    )
    return "---\n${lines.joinToString("\n")}\n---\n${document.body}"
}
