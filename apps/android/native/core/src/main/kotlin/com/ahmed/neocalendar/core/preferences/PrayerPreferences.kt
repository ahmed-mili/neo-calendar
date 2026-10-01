package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Les réglages de prière d'un calendrier, écrits comme `DesktopCalendar.tsx` (PrayerMosqueDialog) : une entrée
 * par chemin de calendrier dans `prayerMosques`, `prayerColors` et `prayerJumua`. Une entrée absente veut dire
 * « rien de réglé » : on retire l'entrée plutôt que d'y écrire une chaîne vide ou une copie de la couleur du calendrier.
 */

private fun JsonObject.entry(key: String): JsonObject = this[key] as? JsonObject ?: JsonObject(emptyMap())

private fun JsonObject.withEntry(key: String, path: String, value: JsonElement?): JsonObject {
    val next = LinkedHashMap(entry(key))
    if (value == null) next.remove(path) else next[path] = value
    return JsonObject(LinkedHashMap(this).also { it[key] = JsonObject(next) })
}

/** La mosquée suivie par ce calendrier ; `null` (« aucun horaire ») retire l'entrée. */
fun withPrayerMosque(preferences: JsonObject, path: String, mosqueId: String?): JsonObject =
    preferences.withEntry("prayerMosques", path, mosqueId?.takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) })

/** La couleur des traits ; `null` les remet à suivre la couleur du calendrier. */
fun withPrayerColor(preferences: JsonObject, path: String, hex: String?): JsonObject =
    preferences.withEntry("prayerColors", path, hex?.let { JsonPrimitive(it) })

/** Les séances de Jumu'a choisies ; `null` rend la main à celles de la mosquée suivie. */
fun withPrayerJumua(preferences: JsonObject, path: String, times: List<String>?): JsonObject =
    preferences.withEntry("prayerJumua", path, times?.let { JsonArray(it.map { time -> JsonPrimitive(time) }) })
