package com.ahmed.neocalendar.core.migration

import com.ahmed.neocalendar.core.workspace.WritableWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.findPath
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/*
 * Passage de com.ahmed.neocalendar à com.ahmedmili.neocalendar (étape 2, première version sous le nouveau nom).
 * La dernière version de l'ancienne app a déposé ce qui ne vit que dans l'appareil dans
 * `.neo-calendar/android-device-settings.json` du dossier de notes ; cette app le relit après le choix du dossier.
 */

/** Le nom de l'ancienne app, encore installée tant que l'utilisateur ne l'a pas désinstallée. */
const val OLD_APP_PACKAGE = "com.ahmed.neocalendar"

/** Ce que l'ancienne app a écrit sous cet identifiant dans le fichier d'export. */
const val EXPORT_WRITTEN_BY = OLD_APP_PACKAGE

private const val METADATA_DIR = ".neo-calendar"
private const val EXPORT_FILE = "android-device-settings.json"
private const val EXPORT_PATH = "$METADATA_DIR/$EXPORT_FILE"
private const val SUPPORTED_VERSION = 1

/**
 * Les réglages exportés par l'ancienne app. Un champ absent ou mal formé reste null (valeur par défaut de l'app).
 * [icsRuntimeState] : l'état des liens ICS, déjà en texte JSON tel que la nouvelle app le garde.
 * [widgetCalendars] : par widget (`w<id>`), les calendriers retenus.
 * [webViewLocalStorage] : le localStorage de la WebView de l'ancienne interface, clé -> valeur chaîne.
 */
data class DeviceSettings(
    val dayCount: Int?,
    val allDayCollapsed: Boolean?,
    val icsRuntimeState: String?,
    val widgetCalendars: Map<String, Set<String>>,
    val webViewLocalStorage: Map<String, String>,
)

/** Lit l'export : null si ce n'est pas du JSON, pas un objet, d'une version inconnue ou écrit par un autre paquet. */
fun parseDeviceSettings(text: String?): DeviceSettings? {
    val root = try {
        Json.parseToJsonElement(text ?: return null) as? JsonObject ?: return null
    } catch (_: Exception) {
        return null
    }
    if ((root["version"] as? JsonPrimitive)?.intOrNull != SUPPORTED_VERSION) return null
    if ((root["writtenBy"] as? JsonPrimitive)?.takeIf { it.isString }?.content != EXPORT_WRITTEN_BY) return null
    val ics = root["icsRuntimeState"]?.takeIf { it is JsonObject }
    val widgets = (root["widgetCalendars"] as? JsonObject)?.mapNotNull { (key, value) ->
        (value as? JsonArray)?.let { list -> key to list.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }.toSet() }
    }?.toMap().orEmpty()
    val storage = (root["webViewLocalStorage"] as? JsonObject)?.mapNotNull { (key, value) ->
        (value as? JsonPrimitive)?.takeIf { it.isString }?.let { key to it.content }
    }?.toMap().orEmpty()
    return DeviceSettings(
        dayCount = (root["dayCount"] as? JsonPrimitive)?.intOrNull,
        allDayCollapsed = (root["allDayCollapsed"] as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toBooleanStrictOrNull(),
        icsRuntimeState = ics?.toString(),
        widgetCalendars = widgets,
        webViewLocalStorage = storage,
    )
}

/** Le fichier d'export du dossier, lu ; null s'il est absent, illisible ou d'une version inconnue. */
fun readDeviceSettings(storage: WritableWorkspaceStorage): DeviceSettings? = try {
    val path = findPath(storage, EXPORT_PATH)
    if (path == null) null else parseDeviceSettings(storage.readText(path))
} catch (_: Exception) {
    null
}

/** Supprime le fichier d'export par le chemin de résolution du noyau (`findPath`) ; absent, ce n'est pas une erreur. */
fun deleteDeviceSettings(storage: WritableWorkspaceStorage) {
    val path = findPath(storage, EXPORT_PATH) ?: return
    storage.delete(path)
}

/**
 * Le script qui réécrit chaque clé dans le localStorage de la page. Le tableau est du JSON, donc un littéral JS
 * valide : aucune valeur n'est recomposée à la main. Rend « true » quand tout est écrit.
 */
fun localStorageScript(entries: Map<String, String>): String {
    val literal = Json.encodeToString(
        JsonElement.serializer(),
        JsonObject(entries.toSortedMap().mapValues { JsonPrimitive(it.value) }),
    )
    return "(function(){var d=$literal;for(var k in d){localStorage.setItem(k,d[k]);}return true;})()"
}

