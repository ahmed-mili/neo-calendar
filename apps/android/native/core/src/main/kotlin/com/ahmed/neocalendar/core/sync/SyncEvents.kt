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

/**
 * Un dossier vient d'être créé ici par la synchro (reçu d'un autre appareil) : sur Android, le surveillant de fichiers du
 * moteur ne le suit pas (mesuré le 2026-10-03 : un fichier posé dedans hors de l'app n'est vu qu'au scan suivant, une heure
 * plus tard), alors qu'il suit les dossiers créés sur le téléphone. L'app relance alors la surveillance du dossier de notes.
 */
fun isNewRemoteDir(event: SyncEvent, folderId: String?): Boolean {
    if (event.type != "ItemFinished") return false
    val d = event.data
    if (folderId != null && d.text("folder") != folderId) return false
    return d["error"].let { it == null || it is JsonNull } && d.text("type") == "dir" && d.text("action") == "update"
}
