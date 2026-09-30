package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/*
 * Port de desktopWorkspacePreferences.ts (DEVICE_KEYS, partie partagée et
 * partie d'appareil, réconciliation après relecture du fichier). Les
 * préférences restent des JsonObject aux noms de champs du TypeScript.
 */

/** Ce qui appartient à un appareil plutôt qu'au calendrier. */
private val DEVICE_KEYS = listOf("viewType", "dayCount", "sidebarVisible", "allDayCollapsed")

/** Le fichier partagé : tout sauf les réglages d'appareil. */
fun sharedWorkspacePreferences(preferences: JsonObject): JsonObject =
    JsonObject(preferences.filterKeys { it !in DEVICE_KEYS })

/** Les quatre réglages d'appareil ; un réglage absent reste absent. */
fun deviceWorkspacePreferences(preferences: JsonObject): JsonObject =
    JsonObject(DEVICE_KEYS.mapNotNull { key -> preferences[key]?.let { key to it } }.toMap())

/** La lecture tolérante du fichier d'appareil. Un tableau passe la garde du
 *  TypeScript (typeof "object") et n'a aucun des champs lus. */
fun parseDeviceWorkspacePreferences(value: JsonElement?): JsonObject {
    val source = when (value) {
        is JsonObject -> value
        is JsonArray -> JsonObject(emptyMap())
        else -> return JsonObject(emptyMap())
    }
    val fields = LinkedHashMap<String, JsonElement>()
    stringOf(source["viewType"])?.takeIf { it in VIEW_TYPES }?.let { fields["viewType"] = JsonPrimitive(it) }
    numberOf(source["dayCount"])?.takeIf { it >= 1 }
        ?.let { fields["dayCount"] = JsonPrimitive(minOf(60.0, jsRound(it)).toLong()) }
    for (key in listOf("sidebarVisible", "allDayCollapsed")) {
        val flag = source[key]
        if (flag is JsonPrimitive && !flag.isString) flag.booleanOrNull?.let { fields[key] = JsonPrimitive(it) }
    }
    return JsonObject(fields)
}

/** Remet la vue de cet appareil sur les préférences partagées ; ce que
 *  l'appareil n'a jamais réglé reste ce que porte la partie partagée. */
fun withDeviceWorkspacePreferences(preferences: JsonObject, device: JsonObject): JsonObject {
    val fields = LinkedHashMap<String, JsonElement>(preferences)
    for (key in DEVICE_KEYS) {
        val own = device[key]
        if (own != null && own !is JsonNull) fields[key] = own
    }
    return JsonObject(fields)
}

private fun merged(previous: JsonElement?, loaded: JsonElement?): JsonObject {
    val fields = LinkedHashMap<String, JsonElement>()
    (previous as? JsonObject)?.let { fields.putAll(it) }
    (loaded as? JsonObject)?.let { fields.putAll(it) }
    return JsonObject(fields)
}

/**
 * Ce que l'app doit croire après avoir relu le fichier : une entrée connue de
 * l'un ou l'autre côté est gardée, le fichier gagnant là où les deux la
 * connaissent. Les calendriers masqués sont repris du fichier tels quels
 * (les fusionner annulerait un « afficher »).
 */
fun reconcileWorkspacePreferences(previous: JsonObject?, loaded: JsonObject, fileExisted: Boolean): JsonObject {
    if (previous == null) return loaded
    // Rien n'a été lu, donc rien n'a été appris.
    if (!fileExisted) return previous

    val loadedOrder = loaded.getValue("order") as JsonArray
    val previousOrder = previous.getValue("order") as JsonArray
    val loadedFeeds = loaded.getValue("icsFeeds") as JsonArray
    val previousFeeds = previous.getValue("icsFeeds") as JsonArray
    val loadedFeedIds = loadedFeeds.map { (it as JsonObject)["id"] }

    val fields = LinkedHashMap<String, JsonElement>(loaded)
    fields["colors"] = merged(previous["colors"], loaded["colors"])
    fields["order"] = JsonArray(loadedOrder + previousOrder.filter { it !in loadedOrder })
    fields["icsFeeds"] = parseIcsFeeds(
        JsonArray(loadedFeeds + previousFeeds.filter { (it as JsonObject)["id"] !in loadedFeedIds })
    )
    for (key in listOf("prayerMosques", "prayerColors", "prayerReminderMinutes", "prayerJumua", "calendarReminderMinutes")) {
        fields[key] = merged(previous[key], loaded[key])
    }
    return JsonObject(fields)
}
