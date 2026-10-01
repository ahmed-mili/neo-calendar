package com.ahmed.neocalendar.nativeapp.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.ahmed.neocalendar.core.workspace.PrivateStorageInUse
import com.ahmed.neocalendar.core.workspace.clearPrivateMessage
import com.ahmed.neocalendar.nativeapp.NativeViewModel
import com.ahmed.neocalendar.nativeapp.sync.StorageSwitch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private sealed interface SwitchStep {
    data object None : SwitchStep
    data class Confirm(val hasStfolder: Boolean) : SwitchStep
    data class Working(val message: String) : SwitchStep
    data class Reminder(val message: String) : SwitchStep
    data class ConfirmClear(val message: String) : SwitchStep
}

/**
 * Les gestes de bascule de la page Synchronisation, avec leurs dialogues (confirmation, copie en cours, rappel). À appeler
 * là où vit le sélecteur de dossier ; rend les actions à passer aux Réglages. Chaque passage tourne sous le verrou
 * d'écriture du ViewModel : aucune note n'est écrite pendant une copie.
 */
@Composable
internal fun rememberStorageSwitch(viewModel: NativeViewModel): SyncSwitchActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf<SwitchStep>(SwitchStep.None) }
    // Le mode vit dans les préférences, pas dans l'état de Compose : chaque passage change cette version pour que la page le relise.
    var version by remember { mutableIntStateOf(0) }

    fun finish(error: String?, success: String, reminder: String? = null) {
        step = SwitchStep.None
        version++
        // L'erreur d'un essai précédent ne reste pas affichée à côté d'un succès.
        Notices.dismissError()
        if (error != null) Notices.fail(error)
        else if (reminder != null) step = SwitchStep.Reminder(reminder)
        else Notices.show(success)
    }

    val openExisting = rememberLauncherForActivityResult(PickTree()) { picked ->
        if (picked != null) scope.launch {
            step = SwitchStep.Working("Ouverture du dossier…")
            finish(viewModel.switchStorage { StorageSwitch.openExisting(context, picked) }, "Dossier ouvert : la synchronisation intégrée est arrêtée.")
        }
    }
    val backToExternal = rememberLauncherForActivityResult(PickTree()) { picked ->
        if (picked != null) scope.launch {
            step = SwitchStep.Working("Copie et vérification des notes…")
            finish(viewModel.switchStorage { StorageSwitch.backToExternal(context, picked) }, "Notes copiées dans le dossier choisi. Le stockage privé est conservé.")
        }
    }

    when (val s = step) {
        SwitchStep.None -> Unit
        is SwitchStep.Confirm -> ConfirmPanel(
            "Passer à la synchronisation intégrée",
            "Vos notes vont être copiées dans le stockage privé de Neo Calendar, puis vérifiées fichier par fichier (liste, tailles, empreintes). " +
                "Votre dossier actuel n'est ni modifié ni supprimé." +
                if (s.hasStfolder) "\nCe dossier est encore partagé par une autre application Syncthing : une fois le passage fait, retirez-le de cette application, sinon le téléphone le synchroniserait deux fois." else "",
            "Copier et passer", danger = false, onDismiss = { step = SwitchStep.None },
        ) {
            val stfolder = s.hasStfolder
            scope.launch {
                step = SwitchStep.Working("Copie et vérification des notes…")
                val error = viewModel.switchStorage { StorageSwitch.switchToIntegrated(context) }
                finish(
                    error, "Notes copiées et vérifiées : la synchronisation intégrée est prête.",
                    reminder = if (stfolder) "Les notes sont maintenant dans le stockage privé. N'oubliez pas de retirer l'ancien dossier de l'autre application Syncthing, sinon le téléphone le synchroniserait deux fois." else null,
                )
            }
        }
        is SwitchStep.Working -> NeoDialog(s.message, onDismiss = {}, dismissLabel = "Patienter") {
            SText("Ne fermez pas l'application. Rien n'est écrit dans vos notes pendant la copie.", color = Neo.TextSecondary, size = 13f, lineHeight = 18f)
        }
        is SwitchStep.Reminder -> ConfirmPanel("Passage terminé", s.message, "OK", danger = false, onDismiss = { step = SwitchStep.None }) { step = SwitchStep.None }
        is SwitchStep.ConfirmClear -> ConfirmPanel(
            "Vider le stockage privé",
            s.message,
            "Vider définitivement", danger = true, onDismiss = { step = SwitchStep.None },
        ) {
            scope.launch {
                val error = withContext(Dispatchers.IO) { StorageSwitch.clearPrivate(context) }
                step = SwitchStep.None
                version++
                Notices.dismissError()
                if (error != null) Notices.fail(error) else Notices.show("Stockage privé vidé.")
            }
        }
    }

    return remember(version) {
        SyncSwitchActions(
            onSwitchToIntegrated = {
                scope.launch {
                    val inspection = try {
                        withContext(Dispatchers.IO) {
                            // Refusé avant même la confirmation : le passage ne mélange jamais deux jeux de notes.
                            if (StorageSwitch.privateHasNotes(context)) throw PrivateStorageInUse()
                            StorageSwitch.inspectExternal(context)
                        }
                    } catch (e: Exception) {
                        Notices.fail(e.message ?: e.toString())
                        return@launch
                    }
                    step = SwitchStep.Confirm(inspection.hasStfolder)
                }
            },
            onOpenExistingFolder = { openExisting.launch(Unit) },
            onBackToExternal = { backToExternal.launch(Unit) },
            onClearPrivate = {
                scope.launch {
                    // Lecture seule : ce qui n'existe QUE dans le stockage privé est dit avant de proposer le vidage.
                    step = SwitchStep.Working("Comparaison avec le dossier externe…")
                    val message = withContext(Dispatchers.IO) { clearPrivateMessage(StorageSwitch.compareWithExternal(context)) }
                    step = SwitchStep.ConfirmClear(message)
                }
            },
        )
    }
}
