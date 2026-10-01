package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.ahmed.neocalendar.core.workspace.CopyFailure
import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.PrivateStorageInUse
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.core.workspace.copyToPrivateAtomically
import com.ahmed.neocalendar.core.workspace.PrivateComparison
import com.ahmed.neocalendar.core.workspace.comparePrivateWithExternal
import com.ahmed.neocalendar.core.workspace.copyBackToExternal
import com.ahmed.neocalendar.core.workspace.isNeoCalendarFolder
import com.ahmed.neocalendar.core.workspace.privateStorageInUse
import com.ahmed.neocalendar.nativeapp.SafWorkspaceStorage
import com.ahmed.neocalendar.nativeapp.StorageGate
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import java.io.File

/**
 * Les trois passages d'un stockage à l'autre. Règles communes : l'original n'est JAMAIS modifié ni supprimé ; le mode ne
 * change qu'APRÈS une copie vérifiée (liste, tailles, SHA-256) ; sinon rien ne change et le message dit quel fichier et pourquoi.
 * À appeler hors du fil principal, sous le verrou d'écriture du ViewModel (`NativeViewModel.switchStorage`).
 */
object StorageSwitch {
    /** Ce que l'on sait d'un dossier externe avant de le copier : un `.stfolder` dit qu'une autre app Syncthing le partage encore. */
    class Inspection(val hasStfolder: Boolean)

    fun inspectExternal(context: Context): Inspection {
        val source = SafWorkspaceStorage(context, WorkspaceLocation.externalTreeUri(context, write = false))
        return Inspection(source.list("").any { it.name == ".stfolder" })
    }

    /** Le stockage privé contient-il autre chose qu'un dossier neuf (notes d'un passage précédent, réglages, pièces jointes) ? */
    fun privateHasNotes(context: Context): Boolean = privateStorageInUse(WorkspaceLocation.privateRoot(context))

    /**
     * « Vider le stockage privé » : geste explicite de l'utilisateur, jamais automatique. Refusé en mode intégré, où le stockage
     * privé est le dossier de notes vivant. Rend le message d'erreur, ou null.
     */
    fun clearPrivate(context: Context): String? {
        if (WorkspaceLocation.mode(context) != StorageMode.External) return "Le stockage privé est le dossier de notes actuel : il n'est pas vidé."
        val root = WorkspaceLocation.privateRoot(context)
        val staging = File(root.parentFile, root.name + ".copie-en-cours")
        return StorageGate.writing {
            if (root.exists() && !root.deleteRecursively()) "Le stockage privé n'a pas pu être entièrement vidé."
            else { staging.deleteRecursively(); null }
        }
    }

    /**
     * Ce que le stockage privé a en plus du dossier externe actuel, lu seulement (SHA-256), avant de proposer de le vider.
     * `null` : le dossier externe n'a pas pu être lu, rien n'est prouvé. Hors du fil principal.
     */
    fun compareWithExternal(context: Context): PrivateComparison? = try {
        comparePrivateWithExternal(
            FileWorkspaceStorage(WorkspaceLocation.privateRoot(context)),
            SafWorkspaceStorage(context, WorkspaceLocation.externalTreeUri(context, write = false)),
        )
    } catch (e: Exception) {
        null
    }

    /**
     * Un dossier temporaire de copie laissé par un arrêt en pleine copie : supprimé, sauf pendant un changement de stockage
     * (la porte attend sa fin). À appeler APRÈS le premier écran, hors du fil principal, jamais sur le chemin du lancement.
     */
    fun cleanLeftovers(context: Context) {
        val root = WorkspaceLocation.privateRoot(context)
        val staging = File(root.parentFile, root.name + ".copie-en-cours")
        if (staging.exists()) StorageGate.writing { staging.deleteRecursively() }
    }

    /** Dossier externe vers stockage privé. Rend le message d'erreur, ou null quand tout a réussi. */
    suspend fun switchToIntegrated(context: Context): String? {
        if (WorkspaceLocation.mode(context) != StorageMode.External) return "Les notes sont déjà dans le stockage privé."
        try {
            val source = SafWorkspaceStorage(context, WorkspaceLocation.externalTreeUri(context, write = false))
            copyToPrivateAtomically(source, WorkspaceLocation.privateRoot(context))
            WorkspaceLocation.setMode(context, StorageMode.Integrated)
            if (WorkspaceLocation.mode(context) != StorageMode.Integrated) {
                return "La copie est faite, mais le mode n'a pas pu être enregistré. Vos notes d'origine n'ont pas bougé ; videz le stockage privé (Réglages, Synchronisation) puis recommencez."
            }
        } catch (e: PrivateStorageInUse) {
            return e.message
        } catch (e: CopyFailure) {
            return "La copie n'a pas pu être vérifiée, rien n'a changé. ${e.message}"
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            return "Le passage à la synchronisation intégrée a échoué, rien n'a changé : ${e.message ?: e}"
        }
        // L'app est au premier plan : le contrôleur le sait, « Quitter » n'a plus cours, le moteur peut démarrer.
        runCatching { SyncController.get(context).onAppStarted() }
        return null
    }

    /**
     * « Ouvrir un dossier existant » : le dossier n'est accepté que s'il porte le marqueur. Le moteur est arrêté, les notes
     * du dossier externe sont lues telles quelles. Le stockage privé est conservé.
     */
    suspend fun openExisting(context: Context, picked: Intent): String? {
        val uri = picked.data ?: return "Aucun dossier choisi."
        if (WorkspaceLocation.mode(context) != StorageMode.Integrated) return "Les notes sont déjà dans un dossier externe."
        // Écriture exigée comme pour le retour : un dossier en lecture seule ne ferait que casser l'app à la première note.
        val grant = takeGrant(context, picked, uri, needWrite = true)
        if (grant.error != null) return grant.error
        val marked = try {
            isNeoCalendarFolder(SafWorkspaceStorage(context, uri))
        } catch (e: Exception) {
            grant.undo(context)
            return "Dossier illisible : ${e.message ?: e}. Rien n'a changé."
        }
        if (!marked) {
            grant.undo(context)
            return "Ce dossier n'est pas un dossier Neo Calendar : il ne contient ni .neo-calendar.json ni le sous-dossier .neo-calendar. Rien n'a changé."
        }
        SyncController.storageSwitching = true
        try {
            SyncController.peek()?.holdForStorageSwitch()
            WorkspaceLocation.chooseExternalTree(context, uri)
            if (WorkspaceLocation.mode(context) != StorageMode.External) {
                grant.undo(context)
                return "Le dossier n'a pas pu être enregistré. Rien n'a changé."
            }
            return null
        } finally {
            release()
        }
    }

    /**
     * « Revenir à un dossier externe » : le moteur s'arrête AVANT toute copie, puis copie vérifiée des notes privées dans le
     * dossier choisi (qui doit être vide). Le stockage privé est conservé jusqu'à ce que l'utilisateur le vide.
     */
    suspend fun backToExternal(context: Context, picked: Intent): String? {
        val uri: Uri = picked.data ?: return "Aucun dossier choisi."
        if (WorkspaceLocation.mode(context) != StorageMode.Integrated) return "Les notes sont déjà dans un dossier externe."
        val grant = takeGrant(context, picked, uri, needWrite = true)
        if (grant.error != null) return grant.error
        SyncController.storageSwitching = true
        try {
            // Le moteur est arrêté (sortie réelle du processus) et ne repart pas : rien n'écrit plus dans les notes privées.
            SyncController.peek()?.holdForStorageSwitch()
            copyBackToExternal(FileWorkspaceStorage(WorkspaceLocation.privateRoot(context)), SafWorkspaceStorage(context, uri))
            WorkspaceLocation.chooseExternalTree(context, uri)
            if (WorkspaceLocation.mode(context) != StorageMode.External) {
                grant.undo(context)
                return "La copie est faite, mais le dossier n'a pas pu être enregistré. Le stockage privé n'a pas bougé ; videz le dossier choisi avant de recommencer."
            }
            return null
        } catch (e: CopyFailure) {
            grant.undo(context)
            return "La copie n'a pas pu être vérifiée, rien n'a changé. ${e.message}"
        } catch (e: kotlinx.coroutines.CancellationException) {
            grant.undo(context)
            throw e
        } catch (e: Exception) {
            grant.undo(context)
            return "Le retour à un dossier externe a échoué, rien n'a changé : ${e.message ?: e}"
        } finally {
            // Mode inchangé : le moteur repart ; mode externe : il reste arrêté.
            release()
        }
    }

    private fun release() {
        SyncController.storageSwitching = false
        SyncController.peek()?.reconcile()
    }

    /** L'autorisation durable d'un dossier choisi ; `undo` ne la rend que si ce passage vient de la prendre (jamais celle d'un dossier déjà autorisé). */
    private class Grant(val uri: Uri, val flags: Int, val newlyTaken: Boolean, val error: String? = null) {
        fun undo(context: Context) {
            if (newlyTaken) runCatching { context.contentResolver.releasePersistableUriPermission(uri, flags) }
        }
    }

    private fun takeGrant(context: Context, picked: Intent, uri: Uri, needWrite: Boolean): Grant {
        val flags = picked.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (flags and Intent.FLAG_GRANT_READ_URI_PERMISSION == 0) {
            return Grant(uri, flags, newlyTaken = false, error = "L'autorisation de lire ce dossier n'a pas été accordée. Rien n'a changé.")
        }
        if (needWrite && flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION == 0) {
            return Grant(uri, flags, newlyTaken = false, error = "Ce dossier est en lecture seule : Neo Calendar doit pouvoir y écrire. Choisissez un autre dossier. Rien n'a changé.")
        }
        val already = context.contentResolver.persistedUriPermissions.any { it.uri == uri }
        return try {
            context.contentResolver.takePersistableUriPermission(uri, flags)
            Grant(uri, flags, newlyTaken = !already)
        } catch (e: Exception) {
            Grant(uri, flags, newlyTaken = false, error = (e.message ?: e.toString()) + " Rien n'a changé.")
        }
    }
}
