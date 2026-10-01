package com.ahmed.neocalendar.core.migration

import com.ahmed.neocalendar.core.workspace.WritableWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.findOrCreate
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Passage de com.ahmed.neocalendar à com.ahmedmili.neocalendar (étape 1, dernière version sous l'ancien nom).
 * Pour Android la nouvelle app est une AUTRE app : ce qui ne vit que dans l'appareil (SharedPreferences) est
 * déposé dans le dossier de notes, que la nouvelle app relit après avoir reçu sa propre autorisation.
 */

/** Le nom de la nouvelle app. */
const val NEW_APP_PACKAGE = "com.ahmedmili.neocalendar"

/** Ce que cette app écrit sous cet identifiant dans le fichier d'export. */
const val EXPORT_WRITTEN_BY = "com.ahmed.neocalendar"

private const val METADATA_DIR = ".neo-calendar"
private const val EXPORT_FILE = "android-device-settings.json"

/** Coexistence : dès que la nouvelle app est installée, l'ancienne n'arme plus aucun rappel (sinon chacun sonnerait deux fois). */
fun remindersMayRing(newAppInstalled: Boolean): Boolean = !newAppInstalled

/** Coexistence : l'ancienne app ne met plus son widget à jour et n'affiche que l'écran « a déménagé ». */
fun hasMovedOn(newAppInstalled: Boolean): Boolean = newAppInstalled

/**
 * Les réglages qui ne vivent que dans l'appareil.
 * [icsRuntimeState] : l'état des liens ICS tel que l'app le garde (`icsRuntimeState`), objet JSON ou null.
 * [widgetCalendars] : par widget (`w<id>`), les calendriers retenus.
 */
data class DeviceSettings(
    val dayCount: Int,
    val allDayCollapsed: Boolean,
    val icsRuntimeState: JsonElement?,
    val widgetCalendars: Map<String, Set<String>>,
    /** Le localStorage de la WebView de l'ancienne interface, clé -> valeur chaîne ; null si la lecture a échoué ou était vide. */
    val webViewLocalStorage: Map<String, String>? = null,
)

private val ISO_MILLIS: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

private val PRETTY = Json { prettyPrint = true }

/** Le contenu du fichier d'export : JSON lisible, listes triées pour qu'un même état donne le même texte. */
fun deviceSettingsJson(settings: DeviceSettings, writtenAt: Instant): String {
    val widgets = JsonObject(
        settings.widgetCalendars.toSortedMap().mapValues { (_, ids) -> JsonArray(ids.sorted().map { JsonPrimitive(it) }) },
    )
    val root = JsonObject(
        linkedMapOf(
            "version" to JsonPrimitive(1),
            "writtenBy" to JsonPrimitive(EXPORT_WRITTEN_BY),
            "writtenAt" to JsonPrimitive(ISO_MILLIS.format(writtenAt)),
            "dayCount" to JsonPrimitive(settings.dayCount),
            "allDayCollapsed" to JsonPrimitive(settings.allDayCollapsed),
            "icsRuntimeState" to (settings.icsRuntimeState ?: JsonNull),
            "widgetCalendars" to widgets,
        ).apply {
            settings.webViewLocalStorage?.let { storage ->
                put("webViewLocalStorage", JsonObject(storage.toSortedMap().mapValues { JsonPrimitive(it.value) }))
            }
        },
    )
    return PRETTY.encodeToString(JsonElement.serializer(), root) + "\n"
}

private fun withoutWrittenAt(text: String?): JsonElement? = try {
    (text?.let { Json.parseToJsonElement(it) } as? JsonObject)?.let { JsonObject(it - "writtenAt") }
} catch (_: Exception) {
    null
}

/** Vrai si [existing] dit déjà la même chose que [next], à l'horodatage près : on n'écrit pas pour rien (Syncthing). */
fun sameDeviceSettings(existing: String?, next: String): Boolean {
    val before = withoutWrittenAt(existing) ?: return false
    return before == withoutWrittenAt(next)
}

/**
 * Écrit `.neo-calendar/android-device-settings.json` (le dossier et le fichier sont créés au besoin) et rien d'autre.
 * Rend faux quand le fichier disait déjà la même chose et n'a pas été touché.
 */
fun writeDeviceSettings(storage: WritableWorkspaceStorage, text: String): Boolean {
    val metadata = findOrCreate(storage, "", METADATA_DIR, "", directory = true)
    val path = "$metadata/$EXPORT_FILE"
    val existing = if (storage.list(metadata).any { it.name == EXPORT_FILE }) storage.readText(path) else null
    if (sameDeviceSettings(existing, text)) return false
    val file = findOrCreate(storage, metadata, EXPORT_FILE, "application/json")
    storage.writeText(file, text)
    return true
}

/**
 * Ce que `evaluateJavascript("JSON.stringify(Object.fromEntries(Object.entries(localStorage)))")` rend : le texte
 * JSON de l'objet, lui-même encadré en chaîne JSON (« "{\"k\":\"v\"}" »). Rend null si rien d'exploitable
 * (échec, "null", localStorage vide) ; une valeur qui n'est pas une chaîne est écartée.
 */
fun webViewStorageFromJs(result: String?): Map<String, String>? = try {
    val text = (Json.parseToJsonElement(result ?: return null) as? JsonPrimitive)?.takeIf { it.isString }?.content
    val entries = (Json.parseToJsonElement(text ?: return null) as? JsonObject)
        ?.mapNotNull { (key, value) -> (value as? JsonPrimitive)?.takeIf { it.isString }?.let { key to it.content } }
        ?.toMap()
    entries?.takeIf { it.isNotEmpty() }
} catch (_: Exception) {
    null
}
