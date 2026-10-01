package com.ahmed.neocalendar.core.sync

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull

private fun JsonObject.text(key: String): String? = (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull

/**
 * Cet évènement dit-il qu'un fichier du dossier vient d'être mis à jour (ou supprimé) par un autre appareil, donc que
 * l'app doit relire le dossier ? `ItemFinished` d'un fichier, sans erreur ; et le retour au repos d'une synchro
 * (`StateChanged` de `syncing` à `idle`), filet pour ce qu'un `ItemFinished` n'aurait pas dit.
 * `RemoteIndexUpdated` ne compte pas : il annonce un index reçu, pas un fichier déjà sur le disque.
 */
fun isRemoteChange(event: SyncEvent, folderId: String?): Boolean {
    val d = event.data
    if (folderId != null && d.text("folder") != folderId) return false
    return when (event.type) {
        "ItemFinished" -> d["error"].let { it == null || it is JsonNull } && d.text("type") == "file" && d.text("action") in setOf("update", "delete")
        "StateChanged" -> d.text("from") == "syncing" && d.text("to") == "idle"
        else -> false
    }
}
