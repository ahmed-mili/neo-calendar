package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import com.ahmed.neocalendar.core.sync.ConfiguredFolder
import com.ahmed.neocalendar.core.sync.FolderLostException
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
)

/** Les lectures et les gestes de la page Synchronisation, tous hors du fil principal. */
class SyncPageModel(context: Context) {
    private val app = context.applicationContext
    private val controller = SyncController.get(app)

    private val _ui = MutableStateFlow(SyncUi())
    val ui: StateFlow<SyncUi> = _ui.asStateFlow()

    @Volatile private var folderLost: PendingFolder? = null

    private fun api(): SyncthingApi = controller.engine.api
        ?: throw IllegalStateException("Le moteur de synchronisation démarre : réessayez dans un instant.")

    private fun setup() = SyncSetup(api(), WorkspaceLocation.privateRoot(app).absolutePath)

    /** Relit tout. Sans moteur qui répond, la page garde ce qu'elle montrait. */
    suspend fun refresh() = withContext(Dispatchers.IO) {
        val conflicts = runCatching { conflictFiles(FileWorkspaceStorage(WorkspaceLocation.privateRoot(app))).size }.getOrDefault(0)
        val api = controller.engine.api
        if (api == null) {
            _ui.value = _ui.value.copy(conflicts = conflicts)
            return@withContext
        }
        try {
            val me = api.myId()
            val configured = api.devices()
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
            )
        } catch (e: Exception) {
            _ui.value = _ui.value.copy(conflicts = conflicts, folderLost = folderLost)
        }
    }

    /** Nombre de notes du dossier privé : pour dire à l'utilisateur ce qui sera fusionné avant d'adopter un dossier. */
    suspend fun localNoteCount(): Int = withContext(Dispatchers.IO) {
        runCatching { loadWorkspace(FileWorkspaceStorage(WorkspaceLocation.privateRoot(app))).eventFiles.size }.getOrDefault(0)
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
            val decision = setup().adopt(proposal)
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
