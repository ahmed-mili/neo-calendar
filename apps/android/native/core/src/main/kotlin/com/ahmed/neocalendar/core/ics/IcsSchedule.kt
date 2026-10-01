package com.ahmed.neocalendar.core.ics

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/*
 * Port de icsSyncScheduler.ts (dueIcsFeeds) et de icsSyncWindow
 * (icsCalendarIntegration.ts), plus l'état de synchro par lien que l'appareil
 * garde de son côté (tauriSettingsStore.ts : loadIcsRuntimeState).
 */

/** Un lien ICS tel que le fichier de préférences le porte (icsFeedPreferences.ts : IcsFeedSubscription). */
data class IcsLink(
    val id: String,
    val calendarPath: String,
    val name: String,
    val url: String,
    val refreshMinutes: Int?,
    val active: Boolean,
    val directory: String?,
    val address: String?,
)

private fun JsonObject.text(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.content

/** Un lien de la liste `icsFeeds` ; null s'il manque l'identifiant, le chemin, le nom ou l'adresse. */
fun icsLinkOf(feed: JsonObject): IcsLink? {
    val active = (feed["active"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: true
    val refresh = (feed["refreshMinutes"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it % 1.0 == 0.0 }?.toInt()
    return IcsLink(
        id = feed.text("id") ?: return null,
        calendarPath = feed.text("calendarPath") ?: return null,
        name = feed.text("name") ?: return null,
        url = feed.text("url") ?: return null,
        refreshMinutes = refresh,
        active = active,
        directory = feed.text("directory"),
        address = feed.text("address"),
    )
}

fun icsLinksOf(feeds: JsonElement?): List<IcsLink> =
    (feeds as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::icsLinkOf) }

private fun parseInstantOrNull(text: String): Instant? =
    runCatching { Instant.parse(text) }.getOrNull() ?: runCatching { OffsetDateTime.parse(text).toInstant() }.getOrNull()

/**
 * Les liens actifs à rafraîchir maintenant. Un lien jamais essayé est toujours dû ; un lien forcé l'est
 * quelle que soit son heure, mais un lien inactif ne tourne jamais, forcé ou non. Un lien dont la date
 * du dernier essai est illisible n'est pas dû (le TypeScript compare un NaN) ; seul « Actualiser » le relance.
 */
fun dueIcsLinks(
    links: List<IcsLink>,
    states: Map<String, IcsSyncState>,
    now: Instant,
    defaultMinutes: Int,
    forcedIds: Set<String>? = null,
): List<IcsLink> = links.filter { link ->
    if (!link.active) return@filter false
    if (forcedIds != null && link.id in forcedIds) return@filter true

    val attempt = states[link.id]?.lastAttemptAt ?: return@filter true
    val at = parseInstantOrNull(attempt) ?: return@filter false
    val elapsedMinutes = (now.toEpochMilli() - at.toEpochMilli()) / 60000.0
    elapsedMinutes >= (link.refreshMinutes ?: defaultMinutes)
}

/** Un an avant `now` jusqu'à deux ans après (jour local de l'appareil, `YYYY-MM-DD`). */
fun icsSyncWindow(now: Instant): Pair<String, String> {
    val today = now.atZone(ZoneId.systemDefault()).toLocalDate()
    return today.minusYears(1).toString() to today.plusYears(2).toString()
}

/** « Dernière synchro. le 30/08/2026 à 18h05 » : l'heure de l'appareil, jointe par un « h » (IcsFeedsPanel.tsx : formatLastIcsSync). */
fun formatLastIcsSync(iso: String, zone: ZoneId = ZoneId.systemDefault()): String {
    val at = parseInstantOrNull(iso)?.atZone(zone) ?: return iso
    return "Dernière synchro. le %02d/%02d/%d à %02dh%02d".format(java.util.Locale.ROOT, at.dayOfMonth, at.monthValue, at.year, at.hour, at.minute)
}

// --- l'état de synchro de chaque lien, gardé sur l'appareil -----------------------

fun icsStatesToJson(states: Map<String, IcsSyncState>): JsonObject = JsonObject(
    states.mapValues { (_, state) ->
        val fields = LinkedHashMap<String, JsonElement>()
        state.lastAttemptAt?.let { fields["lastAttemptAt"] = JsonPrimitive(it) }
        state.lastSuccessAt?.let { fields["lastSuccessAt"] = JsonPrimitive(it) }
        state.lastError?.let { fields["lastError"] = JsonPrimitive(it) }
        fields["knownEventCount"] = JsonPrimitive(state.knownEventCount)
        fields["missingCounts"] = JsonObject(state.missingCounts.mapValues { JsonPrimitive(it.value) })
        JsonObject(fields)
    }
)

/** Lecture tolérante : un texte absent ou illisible donne « jamais synchronisé », une entrée étrange est écartée. */
fun icsStatesFromJson(text: String?): Map<String, IcsSyncState> {
    val root = text?.let { runCatching { Json.parseToJsonElement(it) }.getOrNull() } as? JsonObject ?: return emptyMap()
    val out = LinkedHashMap<String, IcsSyncState>()
    for ((id, value) in root) {
        val entry = value as? JsonObject ?: continue
        val missing = (entry["missingCounts"] as? JsonObject).orEmpty().mapNotNull { (key, count) ->
            (count as? JsonPrimitive)?.longOrNull?.let { key to it }
        }.toMap()
        out[id] = IcsSyncState(
            lastAttemptAt = entry.text("lastAttemptAt"),
            lastSuccessAt = entry.text("lastSuccessAt"),
            knownEventCount = (entry["knownEventCount"] as? JsonPrimitive)?.longOrNull ?: 0L,
            missingCounts = missing,
            lastError = entry.text("lastError"),
        )
    }
    return out
}
