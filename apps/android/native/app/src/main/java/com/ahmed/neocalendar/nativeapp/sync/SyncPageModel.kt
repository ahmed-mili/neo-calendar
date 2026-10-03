package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import com.ahmed.neocalendar.core.sync.ConfiguredFolder
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.RunDecision
import com.ahmed.neocalendar.core.sync.FolderLostException
import com.ahmed.neocalendar.core.sync.PairingFollowUp
import com.ahmed.neocalendar.core.sync.PairingName
import com.ahmed.neocalendar.core.sync.PairingPayload
import com.ahmed.neocalendar.core.sync.PendingDevice
import com.ahmed.neocalendar.core.sync.PendingFolder
import com.ahmed.neocalendar.core.sync.ProposalDecision
import com.ahmed.neocalendar.core.sync.SyncSetup
import com.ahmed.neocalendar.core.sync.SyncthingApi
import com.ahmed.neocalendar.core.sync.decideProposal
import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.conflictFiles
import com.ahmed.neocalendar.core.workspace.loadWorkspace
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

data class DeviceRow(val id: String, val name: String, val connected: Boolean, val lastSeen: String?)

/** Un dossier proposé par un appareil accepté, avec ce que l'app en ferait. */
data class ProposalRow(val proposal: PendingFolder, val proposerName: String, val decision: ProposalDecision)

/** Tout ce que la page Synchronisation lit du moteur, d'un seul coup. */
data class SyncUi(
    val myId: String? = null,
    val myName: String = "",
    val devices: List<DeviceRow> = emptyList(),
    val pendingDevices: List<PendingDevice> = emptyList(),
    val proposals: List<ProposalRow> = emptyList(),
    val folder: ConfiguredFolder? = null,
    val conflicts: Int = 0,
    /** Une adoption a retiré l'ancien dossier sans pouvoir poser le nouveau : le moteur n'a plus de dossier tant que « Réessayer » n'a pas abouti. */
    val folderLost: PendingFolder? = null,
    /** La version du moteur intégré (`2.1.5`), lue une fois : la page dit quel Syncthing synchronise le dossier. */
    val engineVersion: String? = null,
)

private const val ENGINE_WAIT_MS = 30_000L

/** Les lectures et les gestes de la page Synchronisation, tous hors du fil principal. */
class SyncPageModel(context: Context) {
    private val app = context.applicationContext
    private val controller = SyncController.get(app)

    private val _ui = MutableStateFlow(SyncUi())
    val ui: StateFlow<SyncUi> = _ui.asStateFlow()

    @Volatile private var folderLost: PendingFolder? = null

    @Volatile private var engineVersion: String? = null

    /** Un appairage par QR code est en cours : le PC scanné et l'instant du scan (en mémoire seulement, jamais écrit). */
    private class PairingSession(val pcId: String, val startedAtMs: Long)

    @Volatile private var pairing: PairingSession? = null

    private fun api(): SyncthingApi = controller.engine.api
        ?: throw IllegalStateException("Le moteur de synchronisation démarre : réessayez dans un instant.")

    private fun setup() = SyncSetup(api(), WorkspaceLocation.integratedRoot(app).absolutePath)

    /** Relit tout. Sans moteur qui répond, la page garde ce qu'elle montrait. */
    suspend fun refresh() = withContext(Dispatchers.IO) {
        val conflicts = runCatching { conflictFiles(FileWorkspaceStorage(WorkspaceLocation.integratedRoot(app))).size }.getOrDefault(0)
        val api = controller.engine.api
        if (api == null) {
            _ui.value = _ui.value.copy(conflicts = conflicts)
            return@withContext
        }
        try {
            val me = api.myId()
            if (engineVersion == null) engineVersion = runCatching { api.version() }.getOrNull()
            var configured = api.devices()
            // Un téléphone sans nom prend celui de ses réglages (ou son modèle) : jamais « Sans nom ».
            if (com.ahmed.neocalendar.nativeapp.ui.isGenericDeviceName(configured.firstOrNull { it.id == me }?.name) && pairing == null) {
                runCatching { api.renameDevice(me, com.ahmed.neocalendar.nativeapp.ui.defaultDeviceName(app)) }.onSuccess { configured = api.devices() }
            }
            val connections = api.connections()
            val seen = api.lastSeen()
            val folder = api.folders().firstOrNull()
            // Un dossier est revenu (réessai, ou posé autrement) : plus rien à rattraper.
            if (folder != null) folderLost = null
            val devices = configured.filter { it.id != me }.map {
                DeviceRow(it.id, it.name.ifBlank { it.id.take(7) }, connections[it.id] == true, seen[it.id])
            }
            val names = devices.associate { it.id to it.name }
            val proposals = devices.flatMap { api.pendingFolders(it.id) }.map {
                ProposalRow(it, names[it.offeredBy].orEmpty(), decideProposal(folder, me, it.offeredBy, it.id))
            }
            _ui.value = SyncUi(
                myId = me,
                myName = configured.firstOrNull { it.id == me }?.name.orEmpty(),
                devices = devices,
                pendingDevices = api.pendingDevices(),
                proposals = proposals,
                folder = folder,
                conflicts = conflicts,
                folderLost = folderLost,
                engineVersion = engineVersion,
            )
            followUpPairing(_ui.value)
        } catch (e: Exception) {
            _ui.value = _ui.value.copy(conflicts = conflicts, folderLost = folderLost)
        }
    }

    /**
     * Après le scan du QR code du PC : rend son vrai nom au téléphone (le code ne doit pas rester dans ce que les autres
     * appareils voient), puis adopte le dossier que le PC propose sans question quand il n'y a rien à fusionner. Avec des
     * notes ou des réglages locaux, la carte de confirmation habituelle s'affiche : rien n'est fusionné à l'insu de l'utilisateur.
     */
    private suspend fun followUpPairing(ui: SyncUi) {
        val session = pairing
        val pcConnected = session != null && ui.devices.any { it.id == session.pcId && it.connected }
        if (PairingFollowUp.shouldClearName(PairingName.hasCode(ui.myName), session?.startedAtMs, System.currentTimeMillis(), pcConnected)) {
            runCatching { setup().clearPairingName() }
        }
        if (session == null) return
        val offered = ui.proposals.firstOrNull { it.proposal.offeredBy == session.pcId && it.proposal != ui.folderLost }
        if (offered != null && PairingFollowUp.shouldAutoAdopt(true, localNoteCount(), hasLocalPreferences())) {
            // Deux relectures peuvent se croiser : une seule prend la session et adopte.
            if (endPairing(session)) adopt(offered.proposal)
        } else if (offered != null || System.currentTimeMillis() - session.startedAtMs > PairingFollowUp.WINDOW_MS) {
            endPairing(session)
        }
    }

    /** Vrai pour le seul appelant qui ferme cette session. */
    private fun endPairing(session: PairingSession): Boolean = synchronized(this) {
        if (pairing === session) { pairing = null; true } else false
    }

    /** Appairage par QR code : `scanned` est le contenu du QR code. Rend le message d'erreur, ou null. */
    suspend fun pairWithPc(scanned: String): String? = withContext(Dispatchers.IO) {
        val payload = PairingPayload.parse(scanned)
            ?: return@withContext "Ce QR code n'est pas celui d'un PC Neo Calendar. Sur le PC : Réglages, Synchronisation, « Ajouter le téléphone »."
        // Pause pour une raison réseau : inutile d'attendre 30 s, on dit laquelle et où la changer.
        if (controller.engine.api == null) {
            val paused = controller.decision.value as? RunDecision.Pause
            if (paused != null && paused.reason.network) return@withContext "En pause : ${paused.reason.label}. Changez « Synchroniser » dans Fonctionnement."
        }
        // Le moteur peut encore démarrer (retour du scanner) : on l'attend au lieu d'échouer aussitôt.
        if (controller.engine.api == null) {
            withTimeoutOrNull(ENGINE_WAIT_MS) { controller.engine.state.first { it is EngineState.Running && controller.engine.api != null } }
        }
        if (controller.engine.api == null) return@withContext "Le moteur de synchronisation n'a pas démarré après 30 secondes. Vérifiez les conditions de fonctionnement, puis scannez de nouveau."
        try {
            setup().pairWithPc(payload)
            pairing = PairingSession(payload.deviceId, System.currentTimeMillis())
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }.also { refresh(); controller.refreshNow() }
    }

    /** Nombre de notes du dossier privé : pour dire à l'utilisateur ce qui sera fusionné avant d'adopter un dossier. */
    suspend fun localNoteCount(): Int = withContext(Dispatchers.IO) {
        runCatching { loadWorkspace(FileWorkspaceStorage(WorkspaceLocation.integratedRoot(app))).eventFiles.size }.getOrDefault(0)
    }

    /** Le dossier de notes a-t-il son propre fichier de réglages partagés ? (adopter un dossier le mettrait de côté.) */
    suspend fun hasLocalPreferences(): Boolean = withContext(Dispatchers.IO) {
        runCatching { com.ahmed.neocalendar.core.workspace.hasLocalPreferences(WorkspaceLocation.integratedRoot(app)) }.getOrDefault(false)
    }

    /**
     * Le fichier de réglages local est mis de côté (stockage privé, hors du dossier synchronisé, nom horodaté) avant une adoption
     * qui apporte un autre dossier : le PC fait foi, jamais deux fichiers créés chacun de leur côté qui se disputent.
     */
    private fun setAsidePreferences() {
        val root = WorkspaceLocation.integratedRoot(app)
        val aside = java.io.File(root.parentFile, "reglages-mis-de-cote")
        val stamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"))
        val moved = com.ahmed.neocalendar.nativeapp.StorageGate.writing { com.ahmed.neocalendar.core.workspace.setAsideLocalPreferences(root, aside, stamp) }
        if (moved != null) controller.engine.note("Adoption : réglages locaux mis de côté dans ${moved.name}")
    }

    /** Le journal du moteur (lecture de fichiers : jamais sur le fil principal). */
    suspend fun logText(): String = withContext(Dispatchers.IO) { controller.engine.logText() }

    /** Rend le message d'erreur, ou null. Les gestes ne lèvent jamais : la page affiche le message. */
    private suspend fun guarded(block: SyncSetup.() -> Unit): String? = withContext(Dispatchers.IO) {
        try {
            setup().block()
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }.also { refresh(); controller.refreshNow() }
    }

    suspend fun addDevice(rawId: String, name: String): String? = guarded { addDevice(rawId, name) }

    suspend fun accept(pending: PendingDevice): String? = guarded { acceptDevice(pending) }

    suspend fun reject(id: String): String? = guarded { rejectDevice(id) }

    suspend fun remove(id: String): String? = guarded { removeDevice(id) }

    /**
     * Adopte le dossier proposé. Si l'ancien dossier a été retiré sans que le nouveau puisse être posé (même après trois essais),
     * la page garde l'état d'erreur (`SyncUi.folderLost`) avec « Réessayer » ; le moteur n'est jamais laissé sans dossier en silence.
     */
    suspend fun adopt(proposal: PendingFolder): String? = withContext(Dispatchers.IO) {
        var message: String? = null
        try {
            val setup = setup()
            val planned = setup.decide(proposal)
            if (planned == ProposalDecision.Adopt || planned is ProposalDecision.Replace) setAsidePreferences()
            val decision = setup.adopt(proposal)
            if (decision is ProposalDecision.Refuse) message = decision.reason else folderLost = null
        } catch (e: FolderLostException) {
            folderLost = proposal
            controller.engine.note("Adoption : ${e.message}")
            message = e.message
        } catch (e: Exception) {
            message = e.message ?: e.toString()
        }
        refresh()
        controller.refreshNow()
        message
    }

    suspend fun refuseFolder(proposal: PendingFolder): String? = guarded { refuseFolder(proposal) }

    suspend fun rename(name: String): String? = withContext(Dispatchers.IO) {
        try {
            val api = api()
            api.renameDevice(api.myId(), name.trim())
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }.also { refresh() }
    }
}
