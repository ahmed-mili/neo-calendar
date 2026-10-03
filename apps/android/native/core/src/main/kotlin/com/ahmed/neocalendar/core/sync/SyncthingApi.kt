package com.ahmed.neocalendar.core.sync

import java.io.IOException
import java.net.URLEncoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** Le transport HTTP, bloquant : OkHttp sur socket Unix dans l'app, `java.net.http` en TCP dans le test d'intégration. */
interface HttpTransport {
    /** `path` commence par `/rest/`. La clé d'API est ajoutée par le transport. Rend le code et le corps, quel que soit le code. */
    fun request(method: String, path: String, body: String? = null, readTimeoutMs: Int = 15_000): HttpResult
}

class HttpResult(val code: Int, val body: String)

/** Le moteur a répondu autrement que par un succès (ou n'a pas répondu : `code` = 0). */
class SyncthingApiException(val code: Int, message: String) : IOException(message)

data class ConfiguredDevice(val id: String, val name: String)
data class ConfiguredFolder(val id: String, val label: String, val path: String, val deviceIds: List<String>)
data class PendingDevice(val id: String, val name: String, val address: String)
data class PendingFolder(val id: String, val label: String, val offeredBy: String)
data class FolderState(val state: String, val needFiles: Int, val needBytes: Long, val error: String)
data class SyncEvent(val id: Int, val type: String, val data: JsonObject)

/** Les appels de l'API REST de Syncthing v2 dont l'app a besoin (chaque chemin vérifié dans `lib/api/api.go` de la v2.1.5). */
class SyncthingApi(private val transport: HttpTransport) {
    private val json = Json { ignoreUnknownKeys = true }

    private fun call(method: String, path: String, body: JsonElement? = null, readTimeoutMs: Int = 15_000): String {
        val result = try {
            transport.request(method, path, body?.toString(), readTimeoutMs)
        } catch (e: SyncthingApiException) {
            throw e
        } catch (e: IOException) {
            throw SyncthingApiException(0, "Le moteur ne répond pas : ${e.message}")
        }
        if (result.code !in 200..299) throw SyncthingApiException(result.code, "Syncthing a refusé $method $path (${result.code}) : ${result.body.take(200)}")
        return result.body
    }

    private fun get(path: String): JsonElement = json.parseToJsonElement(call("GET", path))

    private fun q(value: String) = URLEncoder.encode(value, "UTF-8")

    /** Vrai quand le moteur répond (`/rest/noauth/health`). Ne lève jamais. */
    fun isHealthy(): Boolean = try {
        transport.request("GET", "/rest/noauth/health", null, 3_000).code == 200
    } catch (_: IOException) {
        false
    }

    /** La version du moteur, sans le « v » (`2.1.5`) : la page dit quel Syncthing synchronise le dossier. */
    fun version(): String = get("/rest/system/version").jsonObject.getValue("version").jsonPrimitive.content.removePrefix("v")

    /** L'identifiant de CET appareil. */
    fun myId(): String = get("/rest/system/status").jsonObject.getValue("myID").jsonPrimitive.content

    fun patchOptions(options: JsonObject) { call("PATCH", "/rest/config/options", options) }

    fun devices(): List<ConfiguredDevice> = get("/rest/config/devices").jsonArray.map {
        val o = it.jsonObject
        ConfiguredDevice(o.getValue("deviceID").jsonPrimitive.content, o["name"]?.jsonPrimitive?.contentOrNull.orEmpty())
    }

    fun putDevice(id: String, name: String) { call("PUT", "/rest/config/devices/${q(id)}", EngineConfig.device(id, name)) }

    fun renameDevice(id: String, name: String) {
        call("PATCH", "/rest/config/devices/${q(id)}", JsonObject(mapOf("name" to JsonPrimitive(name))))
    }

    fun removeDevice(id: String) { call("DELETE", "/rest/config/devices/${q(id)}") }

    fun folders(): List<ConfiguredFolder> = get("/rest/config/folders").jsonArray.map {
        val o = it.jsonObject
        ConfiguredFolder(
            o.getValue("id").jsonPrimitive.content,
            o["label"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            o["path"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            (o["devices"] as? JsonArray).orEmpty().map { d -> d.jsonObject.getValue("deviceID").jsonPrimitive.content },
        )
    }

    fun putFolder(folder: JsonObject) {
        call("PUT", "/rest/config/folders/${q(folder.getValue("id").jsonPrimitive.content)}", folder)
    }

    fun patchFolder(folderId: String, patch: JsonObject) { call("PATCH", "/rest/config/folders/${q(folderId)}", patch) }

    fun setFolderDevices(folderId: String, deviceIds: List<String>) {
        call("PATCH", "/rest/config/folders/${q(folderId)}", JsonObject(mapOf("devices" to EngineConfig.folderDevices(deviceIds))))
    }

    fun removeFolder(id: String) { call("DELETE", "/rest/config/folders/${q(id)}") }

    /** Les appareils inconnus qui ont tenté de se connecter (`/rest/cluster/pending/devices`). */
    fun pendingDevices(): List<PendingDevice> = get("/rest/cluster/pending/devices").jsonObject.map { (id, value) ->
        val o = value.jsonObject
        PendingDevice(id, o["name"]?.jsonPrimitive?.contentOrNull.orEmpty(), o["address"]?.jsonPrimitive?.contentOrNull.orEmpty())
    }

    /** Les dossiers que cet appareil nous propose (`/rest/cluster/pending/folders?device=`). */
    fun pendingFolders(deviceId: String): List<PendingFolder> =
        get("/rest/cluster/pending/folders?device=${q(deviceId)}").jsonObject.flatMap { (folderId, value) ->
            val offered = value.jsonObject["offeredBy"]?.jsonObject ?: JsonObject(emptyMap())
            offered.map { (device, info) ->
                PendingFolder(folderId, info.jsonObject["label"]?.jsonPrimitive?.contentOrNull.orEmpty(), device)
            }
        }

    fun dismissPendingDevice(id: String) { call("DELETE", "/rest/cluster/pending/devices?device=${q(id)}") }

    fun dismissPendingFolder(folderId: String, deviceId: String) {
        call("DELETE", "/rest/cluster/pending/folders?folder=${q(folderId)}&device=${q(deviceId)}")
    }

    /** Pour chaque appareil configuré : connecté ou non (`/rest/system/connections`). */
    fun connections(): Map<String, Boolean> =
        get("/rest/system/connections").jsonObject.getValue("connections").jsonObject
            .mapValues { it.value.jsonObject["connected"]?.jsonPrimitive?.booleanOrNull ?: false }

    /** Dernière connexion de chaque appareil, en texte ISO ; null s'il ne s'est jamais connecté (`/rest/stats/device`). */
    fun lastSeen(): Map<String, String?> = get("/rest/stats/device").jsonObject.mapValues {
        it.value.jsonObject["lastSeen"]?.jsonPrimitive?.contentOrNull?.takeUnless { text -> text.startsWith("1970-") || text.startsWith("0001-") }
    }

    fun folderState(folderId: String): FolderState {
        val o = get("/rest/db/status?folder=${q(folderId)}").jsonObject
        return FolderState(
            o["state"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            o["needFiles"]?.jsonPrimitive?.intOrNull ?: 0,
            o["needBytes"]?.jsonPrimitive?.longOrNull ?: 0L,
            o["error"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }

    /** Pourcentage (0 à 100) de ce que l'appareil distant a reçu de notre dossier (`/rest/db/completion`). */
    fun completion(folderId: String, deviceId: String): Double =
        get("/rest/db/completion?folder=${q(folderId)}&device=${q(deviceId)}").jsonObject["completion"]?.jsonPrimitive?.doubleOrNull ?: 0.0

    /** Pourcentage (0 à 100) de ce que CE téléphone a reçu du dossier, tous appareils confondus (`/rest/db/completion` sans appareil). */
    fun localCompletion(folderId: String): Double =
        get("/rest/db/completion?folder=${q(folderId)}").jsonObject["completion"]?.jsonPrimitive?.doubleOrNull ?: 100.0

    fun scan(folderId: String) { call("POST", "/rest/db/scan?folder=${q(folderId)}") }

    fun pauseDevice(id: String) { call("POST", "/rest/system/pause?device=${q(id)}") }

    fun resumeDevice(id: String) { call("POST", "/rest/system/resume?device=${q(id)}") }

    /** Arrêt propre. Le moteur peut couper la connexion avant de répondre : ce n'est pas une erreur. */
    fun shutdown(readTimeoutMs: Int = 3_000) {
        try {
            call("POST", "/rest/system/shutdown", readTimeoutMs = readTimeoutMs)
        } catch (e: SyncthingApiException) {
            if (e.code != 0) throw e
        }
    }

    /**
     * Longue requête (`/rest/events`) : rend les évènements de numéro supérieur à `since`, ou une liste vide
     * au bout de `timeoutSeconds` (`limit` > 0 : seulement les plus récents). Le transport doit accepter un délai de lecture plus long que `timeoutSeconds`.
     */
    fun events(since: Int, timeoutSeconds: Int, types: List<String>, limit: Int = 0): List<SyncEvent> {
        val path = "/rest/events?since=$since&timeout=$timeoutSeconds&events=${q(types.joinToString(","))}" + if (limit > 0) "&limit=$limit" else ""
        val body = call("GET", path, null, (timeoutSeconds + 15) * 1000)
        return json.parseToJsonElement(body).jsonArray.map {
            val o = it.jsonObject
            SyncEvent(
                o.getValue("id").jsonPrimitive.content.toInt(),
                o.getValue("type").jsonPrimitive.content,
                o["data"] as? JsonObject ?: JsonObject(emptyMap()),
            )
        }
    }
}

/** Les évènements dont l'app a besoin : un fichier reçu, l'état d'un dossier, des demandes, des connexions. */
val ENGINE_EVENT_TYPES = listOf(
    "ItemFinished", "StateChanged", "PendingDevicesChanged", "PendingFoldersChanged",
    "DeviceConnected", "DeviceDisconnected", "ConfigSaved",
)
