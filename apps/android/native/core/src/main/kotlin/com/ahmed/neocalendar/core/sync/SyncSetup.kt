package com.ahmed.neocalendar.core.sync

import com.ahmed.neocalendar.core.workspace.ensureFolderMarker
import java.security.SecureRandom

/** Ce que l'app fait d'un dossier que le PC (ou un autre appareil accepté) propose. */
sealed interface ProposalDecision {
    /** Aucun dossier ici : le dossier de notes prend l'identifiant proposé. */
    data object Adopt : ProposalDecision

    /** Notre dossier a un autre identifiant, mais personne d'autre que le proposeur n'y est lié : il prend l'identifiant proposé. */
    data class Replace(val oldId: String) : ProposalDecision

    /** C'est déjà notre dossier : il suffit d'y ajouter le proposeur. */
    data object ShareExisting : ProposalDecision

    data class Refuse(val reason: String) : ProposalDecision
}

const val REFUSE_SECOND_FOLDER =
    "Un seul dossier est synchronisé, et le dossier de notes de ce téléphone l'est déjà avec d'autres appareils. " +
        "Retirez ces appareils avant d'en adopter un autre, ou refusez cette proposition."

/** Le dossier précédent a été retiré mais le nouveau n'a pas pu être posé : le moteur n'a plus de dossier tant que l'adoption n'est pas rejouée. */
class FolderLostException(val oldId: String, cause: Throwable) : Exception(
    "Le dossier de notes a été retiré du moteur mais le nouveau n'a pas pu être posé (${cause.message}).", cause,
)

/** Un seul dossier est synchronisé. `local` = le dossier de notes configuré dans le moteur, s'il y en a un. */
fun decideProposal(local: ConfiguredFolder?, selfId: String, proposerId: String, proposedId: String): ProposalDecision = when {
    local == null -> ProposalDecision.Adopt
    local.id == proposedId -> ProposalDecision.ShareExisting
    (local.deviceIds.toSet() - selfId - proposerId).isEmpty() -> ProposalDecision.Replace(local.id)
    else -> ProposalDecision.Refuse(REFUSE_SECOND_FOLDER)
}

/** Les gestes de l'utilisateur sur les appareils et le dossier, traduits en appels à l'API. `folderPath` : le dossier de notes privé. */
class SyncSetup(
    private val api: SyncthingApi,
    private val folderPath: String,
    private val random: SecureRandom = SecureRandom(),
    private val retryDelayMs: Long = 400,
) {
    companion object {
        const val FOLDER_LABEL = "Neo Calendar"
    }

    /** Le moteur refuse un dossier sans `.stfolder` : une copie fraîche (bascule après « Vider ») ne l'emporte pas. */
    private fun ensureMarker() = ensureFolderMarker(java.io.File(folderPath))

    /** Premier démarrage : options du moteur (port d'écoute, découvertes, pas de statistiques). */
    fun applyOptions(port: Int) = api.patchOptions(EngineConfig.options(port))

    /** « Ajouter un appareil » : l'identifiant est validé (somme de contrôle) AVANT toute requête. */
    fun addDevice(rawId: String, name: String) {
        val id = DeviceIds.normalize(rawId) ?: throw IllegalArgumentException("Cet identifiant d'appareil n'est pas valide.")
        val me = api.myId()
        if (id == me) throw IllegalArgumentException("C'est l'identifiant de cet appareil.")
        api.putDevice(id, name.trim().ifEmpty { id.take(7) })
        shareFolderWith(me, id)
    }

    /** Accepte une demande entrante : jamais appelé sans geste de l'utilisateur. */
    fun acceptDevice(pending: PendingDevice) {
        val me = api.myId()
        api.putDevice(pending.id, pending.name.trim().ifEmpty { pending.id.take(7) })
        // Si cet appareil propose déjà un dossier, l'utilisateur doit choisir : on ne crée pas un deuxième dossier derrière son dos.
        if (api.pendingFolders(pending.id).isEmpty()) shareFolderWith(me, pending.id)
        runCatching { api.dismissPendingDevice(pending.id) }
    }

    fun rejectDevice(id: String) = api.dismissPendingDevice(id)

    /** Retire l'appareil, d'abord du dossier puis du moteur. Les notes locales ne sont pas touchées. */
    fun removeDevice(id: String) {
        api.folders().firstOrNull { id in it.deviceIds }?.let { api.setFolderDevices(it.id, it.deviceIds - id) }
        api.removeDevice(id)
    }

    /** Ce qui arrivera si l'utilisateur adopte la proposition (pour le dialogue de confirmation). */
    fun decide(proposal: PendingFolder): ProposalDecision =
        decideProposal(api.folders().firstOrNull(), api.myId(), proposal.offeredBy, proposal.id)

    /** Adopte le dossier proposé, après confirmation. Rend la décision appliquée. */
    fun adopt(proposal: PendingFolder): ProposalDecision {
        val me = api.myId()
        val local = api.folders().firstOrNull()
        val decision = decideProposal(local, me, proposal.offeredBy, proposal.id)
        when (decision) {
            is ProposalDecision.Refuse -> return decision
            ProposalDecision.ShareExisting -> api.setFolderDevices(proposal.id, (local!!.deviceIds + proposal.offeredBy))
            ProposalDecision.Adopt, is ProposalDecision.Replace -> {
                val devices = (local?.deviceIds.orEmpty() + me + proposal.offeredBy).distinct()
                ensureMarker()
                val folder = EngineConfig.folder(proposal.id, proposal.label.ifBlank { FOLDER_LABEL }, folderPath, devices)
                if (decision is ProposalDecision.Replace) {
                    api.removeFolder(decision.oldId)
                    // L'ancien est parti : le nouveau est posé coûte que coûte (trois essais), sinon le moteur resterait sans dossier.
                    putFolderOrLose(folder, decision.oldId)
                } else {
                    api.putFolder(folder)
                }
            }
        }
        runCatching { api.dismissPendingFolder(proposal.id, proposal.offeredBy) }
        return decision
    }

    private fun putFolderOrLose(folder: kotlinx.serialization.json.JsonObject, oldId: String) {
        var last: Exception? = null
        repeat(3) { attempt ->
            try {
                api.putFolder(folder)
                return
            } catch (e: Exception) {
                last = e
                if (attempt < 2 && retryDelayMs > 0) Thread.sleep(retryDelayMs)
            }
        }
        throw FolderLostException(oldId, last!!)
    }

    /**
     * Repart d'un index vide pour le dossier déjà déclaré dans le moteur (re-bascule après « Vider ») : le retire puis le remet au
     * MÊME identifiant. Recréer `.stfolder` à la main sur un index ancien désactiverait la sécurité de Syncthing (le dossier recopié
     * « a perdu » des fichiers : suppressions propagées au PC) ; retiré, le dossier perd son index, et c'est Syncthing qui réécrit
     * le marqueur à la remise. Rend false quand aucun dossier n'est déclaré.
     */
    fun resetFolderIndex(): Boolean {
        val local = api.folders().firstOrNull() ?: return false
        api.removeFolder(local.id)
        putFolderOrLose(EngineConfig.folder(local.id, local.label, folderPath, local.deviceIds), local.id)
        return true
    }

    fun refuseFolder(proposal: PendingFolder) = api.dismissPendingFolder(proposal.id, proposal.offeredBy)

    private fun shareFolderWith(me: String, deviceId: String) {
        val folder = api.folders().firstOrNull()
        if (folder == null) {
            ensureMarker()
            api.putFolder(EngineConfig.folder(EngineConfig.newFolderId(random), FOLDER_LABEL, folderPath, listOf(me, deviceId)))
        } else if (deviceId !in folder.deviceIds) {
            api.setFolderDevices(folder.id, folder.deviceIds + deviceId)
        }
    }
}
