package com.ahmed.neocalendar.nativeapp

import android.content.Context
import com.ahmed.neocalendar.core.workspace.BinaryWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.MergeFailure
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.core.workspace.isSyncedElsewhere
import com.ahmed.neocalendar.core.workspace.mergeIntoDirectory
import com.ahmed.neocalendar.core.workspace.prepareVisibleFolderForEngine
import com.ahmed.neocalendar.nativeapp.sync.SyncController
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Le passage des installations existantes au dossier visible `/storage/emulated/0/Neo Calendar`.
 *
 * Règles : l'original (stockage privé, ou dossier choisi) n'est JAMAIS modifié ni supprimé ; la bascule ne se fait qu'APRÈS une
 * copie vérifiée (`mergeIntoDirectory` : liste, tailles, SHA-256, source relue) ; un dossier visible déjà rempli est fusionné sans
 * rien écraser ; un dossier choisi par l'utilisateur et déjà synchronisé par autre chose (un `.stfolder` d'un autre Syncthing, un
 * fournisseur en ligne) n'est pas migré. Tout se fait APRÈS l'affichage de la grille, hors du fil principal.
 */
object VisibleMigration {
    sealed interface State {
        data object Idle : State

        /** L'accès à tous les fichiers manque : l'app continue sur le dossier actuel, sans rien perdre, et redemande. */
        data object NeedsAccess : State

        data object Running : State

        /** Dossier synchronisé par autre chose (ou inutilisable) : gardé tel quel. */
        data object Kept : State
        data class Done(val summary: String) : State
        data class Failed(val message: String) : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    private const val PREFS = "neo_android"
    private const val KEY_REPORT = "visible_migration_report"

    /** Reste-t-il à passer au dossier visible ? Un appel instantané (préférences seulement), sans disque. */
    fun pending(context: Context): Boolean =
        WorkspaceLocation.mode(context) != null && !WorkspaceLocation.isVisible(context) && _state.value !is State.Kept &&
            _state.value !is State.Running && _state.value !is State.Failed

    /** « Plus tard » : le dialogue se ferme, la demande revient au prochain lancement. */
    fun postpone() {
        if (_state.value is State.NeedsAccess) _state.value = State.Idle
    }

    fun lastReport(context: Context): String? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_REPORT, null)

    /**
     * À appeler hors du fil principal, sous la porte de stockage (`NativeViewModel.switchStorage`). Rend le message d'erreur,
     * ou null (réussi, rien à faire, ou en attente de l'autorisation : voir [state]).
     */
    suspend fun run(context: Context): String? {
        val mode = WorkspaceLocation.mode(context) ?: return null
        if (WorkspaceLocation.isVisible(context)) return null
        if (!WorkspaceLocation.hasAllFilesAccess(context)) {
            _state.value = State.NeedsAccess
            return null
        }
        _state.value = State.Running
        val visible = WorkspaceLocation.visibleRoot()
        val source: BinaryWorkspaceStorage?
        when (mode) {
            StorageMode.Integrated -> source = FileWorkspaceStorage(WorkspaceLocation.privateRoot(context))
            StorageMode.External -> {
                val uri = try {
                    WorkspaceLocation.externalTreeUri(context, write = false)
                } catch (e: Exception) {
                    // Autorisation du dossier retirée : l'utilisateur est devant l'écran habituel, rien à migrer d'ici.
                    _state.value = State.Kept
                    return null
                }
                val saf = SafWorkspaceStorage(context, uri)
                val rootEntries = try { saf.list("") } catch (e: Exception) { _state.value = State.Kept; return null }
                if (isSyncedElsewhere(rootEntries.any { it.name == ".stfolder" }, uri.authority) || rootEntries.isEmpty()) {
                    _state.value = State.Kept
                    return null
                }
                // Le dossier choisi EST déjà `/storage/emulated/0/Neo Calendar` : rien à copier, il suffit de le lire en fichiers directs.
                val docId = runCatching { android.provider.DocumentsContract.getTreeDocumentId(uri) }.getOrNull()
                source = if (docId == "primary:${com.ahmed.neocalendar.core.workspace.VISIBLE_FOLDER_NAME}") null else saf
            }
        }
        SyncController.storageSwitching = true
        try {
            SyncController.peek()?.holdForStorageSwitch()
            val summary = if (source == null) "Le dossier choisi est déjà le dossier visible : lu directement, rien copié."
            else mergeIntoDirectory(source, visible).toString()
            prepareVisibleFolderForEngine(visible)
            // Le moteur peut avoir l'ancien dossier dans sa configuration : à son prochain démarrage il le retire et le remet au même
            // identifiant sur le dossier visible, d'un index vide (les fichiers sont les mêmes, la synchro ne renvoie rien de neuf).
            SyncController.get(context).settings.update { it.copy(resetFolderIndex = true) }
            WorkspaceLocation.adoptVisible(context)
            if (!WorkspaceLocation.isVisible(context)) {
                _state.value = State.Failed("La copie est faite, mais le dossier n'a pas pu être enregistré. Vos notes d'origine n'ont pas bougé.")
                return "La copie est faite, mais le dossier n'a pas pu être enregistré. Vos notes d'origine n'ont pas bougé."
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_REPORT, summary).apply()
            android.util.Log.i("NeoMigration", "Dossier visible : $summary")
            _state.value = State.Done(summary)
            return null
        } catch (e: MergeFailure) {
            val message = "La copie vers le dossier Neo Calendar n'a pas pu être vérifiée, rien n'a changé. ${e.message}"
            _state.value = State.Failed(message)
            return message
        } catch (e: kotlinx.coroutines.CancellationException) {
            _state.value = State.Idle
            throw e
        } catch (e: Exception) {
            val message = "Le passage au dossier Neo Calendar a échoué, rien n'a changé : ${e.message ?: e}"
            _state.value = State.Failed(message)
            return message
        } finally {
            SyncController.storageSwitching = false
            SyncController.peek()?.reconcile()
        }
    }
}
