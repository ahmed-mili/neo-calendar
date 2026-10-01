package com.ahmed.neocalendar.core.sync

import java.security.SecureRandom
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Ce que l'app envoie à l'API REST de Syncthing v2 (`/rest/config/...`), sans rien d'autre : fonctions
 * pures, testées sans moteur. Les noms de champs sont ceux du dossier `lib/config/` de la v2.1.5.
 */
object EngineConfig {
    /** Le serveur de relais public : sans lui la synchro hors du même Wi-Fi tombe quand aucune connexion directe n'est possible. */
    const val RELAY_POOL = "dynamic+https://relays.syncthing.net/endpoint"

    const val TRASHCAN_DAYS = "30"

    fun listenAddresses(port: Int): List<String> = listOf("tcp://0.0.0.0:$port", "quic://0.0.0.0:$port", RELAY_POOL)

    /**
     * Les options du moteur, en PATCH sur `/rest/config/options` : pas de mise à jour automatique (l'app fixe la
     * version), pas de statistiques d'usage (`urAccepted = -1`), pas de rapport de plantage, découverte globale et
     * relais activés, découverte locale désactivée (le port UDP 21027 n'est pas partageable avec Syncthing-Fork
     * installé sur le même téléphone), un port d'écoute choisi par l'app.
     */
    fun options(port: Int): JsonObject = buildJsonObject {
        put("autoUpgradeIntervalH", 0)
        put("urAccepted", -1)
        put("crashReportingEnabled", false)
        put("startBrowser", false)
        put("globalAnnounceEnabled", true)
        put("localAnnounceEnabled", false)
        put("relaysEnabled", true)
        put("listenAddresses", JsonArray(listenAddresses(port).map { JsonPrimitive(it) }))
    }

    /** Un appareil distant, en PUT sur `/rest/config/devices/{id}`. Adresse « dynamic » : découverte globale. */
    fun device(deviceId: String, name: String): JsonObject = buildJsonObject {
        put("deviceID", deviceId)
        put("name", name)
        put("addresses", JsonArray(listOf(JsonPrimitive("dynamic"))))
        put("compression", "metadata")
        put("introducer", false)
        put("autoAcceptFolders", false)
        put("paused", false)
    }

    /**
     * Le dossier de notes, en PUT sur `/rest/config/folders/{id}` : envoi et réception, surveillance des
     * fichiers, `ignorePerms` (les droits d'un PC Windows n'ont pas de sens ici), corbeille de 30 jours
     * (une note écrasée ou supprimée par une synchro reste dans `.stversions`). `deviceIds` contient
     * l'identifiant de CET appareil.
     */
    fun folder(id: String, label: String, path: String, deviceIds: List<String>): JsonObject = buildJsonObject {
        put("id", id)
        put("label", label)
        put("path", path)
        put("type", "sendreceive")
        put("fsWatcherEnabled", true)
        put("ignorePerms", true)
        put("rescanIntervalS", 3600)
        put("devices", folderDevices(deviceIds))
        put("versioning", buildJsonObject {
            put("type", "trashcan")
            put("params", buildJsonObject { put("cleanoutDays", TRASHCAN_DAYS) })
        })
    }

    /** La liste `devices` d'un dossier (PATCH `/rest/config/folders/{id}` pour ajouter ou retirer un appareil). */
    fun folderDevices(deviceIds: List<String>): JsonArray =
        JsonArray(deviceIds.distinct().map { buildJsonObject { put("deviceID", it) } })

    private const val ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

    /** Un identifiant de dossier du genre `neo-k3x9a-2fq7z` : assez long pour ne jamais tomber sur celui d'un autre. */
    fun newFolderId(random: SecureRandom = SecureRandom()): String {
        fun chunk() = String(CharArray(5) { ID_ALPHABET[random.nextInt(ID_ALPHABET.length)] })
        return "neo-${chunk()}-${chunk()}"
    }
}
