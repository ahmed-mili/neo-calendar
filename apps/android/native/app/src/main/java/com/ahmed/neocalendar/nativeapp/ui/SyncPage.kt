package com.ahmed.neocalendar.nativeapp.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.ahmed.neocalendar.core.sync.DeviceIds
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.PendingDevice
import com.ahmed.neocalendar.core.sync.PowerSource
import com.ahmed.neocalendar.core.sync.ProposalDecision
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.lastSeenLabel
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import com.ahmed.neocalendar.nativeapp.sync.DeviceRow
import com.ahmed.neocalendar.nativeapp.sync.ProposalRow
import com.ahmed.neocalendar.nativeapp.sync.SyncController
import com.ahmed.neocalendar.nativeapp.sync.SyncPageModel
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.io.File
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Ce que la page Synchronisation demande à l'écran qui l'héberge pour changer de mode de stockage (branchés à la bascule). */
class SyncSwitchActions(
    val onSwitchToIntegrated: () -> Unit = {},
    val onOpenExistingFolder: () -> Unit = {},
    val onBackToExternal: () -> Unit = {},
)

private sealed interface SyncSheet {
    data object AddDevice : SyncSheet
    data object Rename : SyncSheet
    data object Mode : SyncSheet
    data object Power : SyncSheet
    data object Log : SyncSheet
    data class Remove(val device: DeviceRow) : SyncSheet
    data class Adopt(val row: ProposalRow, val notes: Int) : SyncSheet
}

/** La page Synchronisation (Réglages). Stockage externe : seulement le choix du mode ; stockage privé : tout le reste. */
@Composable
internal fun SyncPage(switchActions: SyncSwitchActions) {
    val context = LocalContext.current
    if (WorkspaceLocation.mode(context) == StorageMode.Integrated) IntegratedSyncPage(switchActions)
    else ExternalSyncPage(switchActions)
}

@Composable
private fun ExternalSyncPage(actions: SyncSwitchActions) {
    val context = LocalContext.current
    val folderName = WorkspaceLocation.displayName(context)
    Group(
        "Mode de stockage",
        note = "Vos notes sont dans un dossier que vous avez choisi, synchronisé par un autre outil (Syncthing, stockage en ligne, transfert manuel).\nLa synchronisation intégrée de Neo Calendar est inactive : les deux ne tournent jamais ensemble sur les mêmes notes.",
    ) {
        row(NeoIcons.FolderOpen, "Dossier synchronisé par une autre app", folderName, chevron = false, onClick = null)
        row(NeoIcons.RefreshCw, "Passer à la synchronisation intégrée", "Recommandé", onClick = actions.onSwitchToIntegrated)
    }
}

@Composable
private fun IntegratedSyncPage(switchActions: SyncSwitchActions) {
    val context = LocalContext.current
    val controller = remember { SyncController.get(context) }
    val model = remember { SyncPageModel(context) }
    val ui by model.ui.collectAsState()
    val status by controller.status.collectAsState()
    val engineState by controller.engine.state.collectAsState()
    val settings by controller.settings.settings.collectAsState()
    val scope = rememberCoroutineScope()
    var sheet by remember { mutableStateOf<SyncSheet?>(null) }
    var showQr by remember { mutableStateOf(false) }

    // Le moteur tourne tant que la page est ouverte (appairage), même sans appareil ; relu toutes les 3 s.
    DisposableEffect(Unit) {
        controller.setPageOpen(true)
        onDispose { controller.setPageOpen(false) }
    }
    LaunchedEffect(Unit) {
        while (true) {
            model.refresh()
            delay(3_000)
        }
    }

    fun report(error: String?) { if (error != null) Notices.show(error) }

    Group("Mode de stockage", note = "Vos notes sont dans le stockage privé de Neo Calendar, synchronisé par le moteur intégré.\nCe mode et un dossier synchronisé par une autre app s'excluent : jamais les deux sur les mêmes notes.") {
        row(NeoIcons.Check, "Synchronisation intégrée", "Recommandé", chevron = false, onClick = null)
        row(NeoIcons.FolderOpen, "Ouvrir un dossier existant", null, onClick = switchActions.onOpenExistingFolder)
        row(NeoIcons.Upload, "Revenir à un dossier externe", null, onClick = switchActions.onBackToExternal)
    }

    Group("État") {
        row(NeoIcons.RefreshCw, status.text(), null, chevron = false, onClick = null)
        // Après l'abandon des relances le moteur ne repart plus seul : un geste de l'utilisateur le relance.
        if (engineState is EngineState.Failed) row(NeoIcons.RefreshCw, "Réessayer", null, chevron = false) { controller.retry() }
    }

    Group("Cet appareil", note = "Pour appairer un autre appareil, scannez ce QR code depuis lui, ou saisissez l'identifiant.") {
        val id = ui.myId
        row(NeoIcons.Smartphone, "Nom", ui.myName.ifBlank { "Sans nom" }, onClick = { sheet = SyncSheet.Rename })
        if (id == null) {
            row(null, "Identifiant", "Démarrage du moteur…", chevron = false, onClick = null)
        } else {
            text(id)
            if (showQr) custom { shape ->
                Column(
                    Modifier.fillMaxWidth().background(Neo.SettingRow, shape).padding(vertical = 14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { QrCode(id, description = "QR code de l'identifiant de cet appareil") }
            }
            row(NeoIcons.QrCode, if (showQr) "Masquer le QR code" else "Afficher le QR code", null, chevron = false, onClick = { showQr = !showQr })
            row(NeoIcons.Copy, "Copier l'identifiant", null, chevron = false) {
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Identifiant", id))
                Notices.show("Identifiant copié")
            }
            row(NeoIcons.ExternalLink, "Partager", null, chevron = false) {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, id)
                context.startActivity(Intent.createChooser(send, null))
            }
        }
    }

    Group("Appareils") {
        for (device in ui.devices) {
            row(NeoIcons.Users, device.name, lastSeenLabel(device.connected, device.lastSeen, Instant.now()), dot = if (device.connected) Neo.Success else Neo.TextFaint) {
                sheet = SyncSheet.Remove(device)
            }
        }
        row(NeoIcons.Plus, "Ajouter un appareil", null, onClick = { sheet = SyncSheet.AddDevice })
    }

    if (ui.pendingDevices.isNotEmpty()) Group(
        "Demandes de connexion",
        note = "Comparez l'identifiant à celui que l'autre appareil affiche avant d'accepter. Rien n'est jamais accepté automatiquement.",
    ) {
        for (pending in ui.pendingDevices) custom { shape ->
            PendingDeviceCard(shape, pending, { scope.launch { report(model.accept(pending)) } }, { scope.launch { report(model.reject(pending.id)) } })
        }
    }

    Group("Dossier de notes", note = "Un seul dossier est synchronisé : celui de ce téléphone, partagé automatiquement avec chaque appareil accepté.") {
        val folder = ui.folder
        row(NeoIcons.FolderOpen, "Dossier partagé", if (folder == null) "Aucun" else "${folder.deviceIds.size - 1} appareil(s)", chevron = false, onClick = null)
        // Le dossier précédent a été retiré sans que le nouveau ait pu être posé : jamais un moteur muet sans dossier.
        ui.folderLost?.let { lost ->
            custom { shape ->
                FolderLostCard(shape, lost.label.ifBlank { "Neo Calendar" }) { scope.launch { report(model.adopt(lost)) } }
            }
        }
        for (proposal in ui.proposals) if (proposal.proposal != ui.folderLost) custom { shape ->
            ProposalCard(
                shape,
                proposal,
                onAdopt = { scope.launch { sheet = SyncSheet.Adopt(proposal, model.localNoteCount()) } },
                onIgnore = { scope.launch { report(model.refuseFolder(proposal.proposal)) } },
            )
        }
    }

    Group("Fonctionnement") {
        row(NeoIcons.Clock, "Mode", if (settings.runMode == RunMode.LikeFork) "Comme Syncthing-Fork" else "Seulement quand l'app est ouverte", onClick = { sheet = SyncSheet.Mode })
        if (settings.runMode == RunMode.LikeFork) toggle(NeoIcons.Timer, "Démarrage automatique", settings.autoStart) { on -> controller.settings.update { it.copy(autoStart = on) } }
        toggle(NeoIcons.Globe, "Sur Wi-Fi", settings.conditions.onWifi) { on -> controller.settings.update { it.copy(conditions = it.conditions.copy(onWifi = on)) } }
        toggle(NeoIcons.Globe, "Sur Wi-Fi limité", settings.conditions.onMeteredWifi) { on -> controller.settings.update { it.copy(conditions = it.conditions.copy(onMeteredWifi = on)) } }
        toggle(NeoIcons.Smartphone, "Sur données mobiles", settings.conditions.onMobileData) { on -> controller.settings.update { it.copy(conditions = it.conditions.copy(onMobileData = on)) } }
        row(NeoIcons.Bell, "Source d'alimentation", powerLabel(settings.conditions.power), onClick = { sheet = SyncSheet.Power })
        toggle(NeoIcons.Moon, "Respecter l'économiseur de batterie", settings.conditions.respectBatterySaver) { on ->
            controller.settings.update { it.copy(conditions = it.conditions.copy(respectBatterySaver = on)) }
        }
        if (settings.runMode == RunMode.LikeFork && !settings.autoStart) row(NeoIcons.Close, "Quitter", "Arrête la synchronisation jusqu'au prochain lancement", chevron = false) { controller.quit() }
    }

    Group("Conflits", note = "Quand deux appareils modifient la même note en même temps, Syncthing garde une copie. Elle n'est pas affichée comme évènement ; la fusion arrivera plus tard.") {
        row(NeoIcons.TriangleAlert, "Fichiers de conflit", ui.conflicts.toString(), chevron = false, onClick = null)
    }

    Group("Journal du moteur") {
        row(NeoIcons.FileText, "Afficher", null, onClick = { sheet = SyncSheet.Log })
        row(NeoIcons.ExternalLink, "Partager", null, chevron = false) { scope.launch { shareLog(context, model.logText()) } }
    }

    when (val open = sheet) {
        null -> Unit
        SyncSheet.AddDevice -> AddDeviceSheet(ui.myId, { sheet = null }) { id, name -> model.addDevice(id, name) }
        SyncSheet.Rename -> RenameSheet(ui.myName, { sheet = null }) { name -> scope.launch { report(model.rename(name)) }; sheet = null }
        SyncSheet.Mode -> ChoiceDialog(
            "Fonctionnement", listOf(Option("fork", "Comme Syncthing-Fork"), Option("open", "Seulement quand l'app est ouverte")),
            if (settings.runMode == RunMode.LikeFork) "fork" else "open",
            { picked -> controller.settings.update { it.copy(runMode = if (picked == "fork") RunMode.LikeFork else RunMode.OnlyWhenOpen) }; sheet = null },
            { sheet = null },
        )
        SyncSheet.Power -> ChoiceDialog(
            "Source d'alimentation", PowerSource.entries.map { Option(it.name, powerLabel(it)) }, settings.conditions.power.name,
            { picked -> controller.settings.update { it.copy(conditions = it.conditions.copy(power = PowerSource.valueOf(picked))) }; sheet = null },
            { sheet = null },
        )
        SyncSheet.Log -> LogDialog(model) { sheet = null }
        is SyncSheet.Remove -> ConfirmPanel(
            "Retirer l'appareil",
            "Retirer « ${open.device.name} » ? Vos notes restent sur ce téléphone ; elles ne seront plus synchronisées avec lui.",
            "Retirer", danger = true, onDismiss = { sheet = null },
        ) { scope.launch { report(model.remove(open.device.id)) }; sheet = null }
        is SyncSheet.Adopt -> ConfirmPanel(
            "Synchroniser ce dossier",
            "${open.row.proposerName.ifBlank { "Cet appareil" }} propose le dossier « ${open.row.proposal.label.ifBlank { "Neo Calendar" }} ». " +
                (if (open.notes == 0) "Vous n'avez pas encore de note locale : celles de cet appareil arriveront sur ce téléphone. Aucune note n'est supprimée"
                else "Vos ${open.notes} notes locales seront fusionnées avec celles de cet appareil ; aucune note n'est supprimée") +
                " (une note écrasée reste récupérable dans la corbeille de synchronisation pendant 30 jours).",
            "Synchroniser", danger = false, onDismiss = { sheet = null },
        ) { scope.launch { report(model.adopt(open.row.proposal)) }; sheet = null }
    }
}

private fun powerLabel(power: PowerSource) = when (power) {
    PowerSource.Always -> "Secteur et batterie"
    PowerSource.ChargingOnly -> "Secteur seulement"
    PowerSource.BatteryOnly -> "Batterie seulement"
}

@Composable
private fun PendingDeviceCard(shape: androidx.compose.ui.graphics.Shape, pending: PendingDevice, onAccept: () -> Unit, onReject: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Neo.SettingRow, shape).padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SText("${pending.name.ifBlank { "Un appareil" }} veut se connecter", weight = 500, lineHeight = 19.5f)
        // L'identifiant COMPLET : c'est ce que l'utilisateur compare avec celui que l'autre appareil affiche.
        SText(DeviceIds.normalize(pending.id) ?: pending.id, color = Neo.TextFaint, size = 12f, lineHeight = 16f)
        if (pending.address.isNotEmpty()) SText(pending.address, color = Neo.TextFaint, size = 12f)
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            TextAction("Refuser", color = Neo.TextSecondary, onClick = onReject)
            TextAction("Accepter", onClick = onAccept)
        }
    }
}

@Composable
private fun ProposalCard(shape: androidx.compose.ui.graphics.Shape, row: ProposalRow, onAdopt: () -> Unit, onIgnore: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Neo.SettingRow, shape).padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SText("${row.proposerName.ifBlank { "Un appareil" }} propose un dossier", weight = 500, lineHeight = 19.5f)
        SText("« ${row.proposal.label.ifBlank { row.proposal.id }} »", color = Neo.TextSecondary, size = 13f)
        val refused = row.decision as? ProposalDecision.Refuse
        if (refused != null) SText(refused.reason, color = Neo.Danger, size = 12f, lineHeight = 16f)
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            TextAction("Ignorer", color = Neo.TextSecondary, onClick = onIgnore)
            if (refused == null) TextAction("Synchroniser…", onClick = onAdopt)
        }
    }
}

@Composable
private fun FolderLostCard(shape: androidx.compose.ui.graphics.Shape, label: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Neo.SettingRow, shape).padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SText("Le dossier de notes n'a pas pu être posé : réessayez.", color = Neo.Danger, weight = 500, lineHeight = 19.5f)
        SText("« $label »", color = Neo.TextSecondary, size = 13f)
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) { TextAction("Réessayer", onClick = onRetry) }
    }
}

@Composable
private fun AddDeviceSheet(myId: String?, onDismiss: () -> Unit, onAdd: suspend (String, String) -> String?) {
    var id by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val scan = androidx.activity.compose.rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { id = it.trim(); error = null }
    }
    val normalized = DeviceIds.normalize(id)
    val valid = normalized != null
    val isSelf = normalized != null && normalized == myId?.let { DeviceIds.normalize(it) }
    BottomPanel(onDismiss) {
        UiText("Ajouter un appareil", size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 6.dp))
        UiText(
            "Sur l'autre appareil, ouvrez Syncthing et affichez son identifiant (QR code ou texte), ou celui de Neo Calendar.",
            color = Neo.TextSecondary, size = 14.sp, modifier = Modifier.padding(horizontal = 18.dp),
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp), horizontalArrangement = Arrangement.End) {
            TextAction("Scanner un QR code") {
                scan.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setBeepEnabled(false).setOrientationLocked(false).setPrompt("Scannez l'identifiant de l'appareil"))
            }
        }
        TextInput(id, { id = it; error = null }, "Identifiant de l'appareil", Modifier.padding(horizontal = 18.dp), uri = true)
        if (id.isNotBlank() && !valid) UiText("Cet identifiant n'est pas valide (la somme de contrôle ne correspond pas).", color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 6.dp))
        if (isSelf) UiText("C'est l'identifiant de cet appareil.", color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 6.dp))
        TextInput(name, { name = it }, "Nom de l'appareil (facultatif)", Modifier.padding(start = 18.dp, end = 18.dp, top = 10.dp))
        error?.let { UiText(it, color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 6.dp)) }
        SheetFooter("Annuler", "Ajouter", onDismiss, {
            busy = true
            scope.launch {
                val result = onAdd(id, name)
                busy = false
                if (result == null) onDismiss() else error = result
            }
        }, enabled = valid && !isSelf && !busy)
    }
}

@Composable
private fun RenameSheet(current: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var text by remember { mutableStateOf(current) }
    BottomPanel(onDismiss) {
        UiText("Nom de cet appareil", size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 10.dp))
        TextInput(text, { text = it }, "Nom", Modifier.padding(horizontal = 18.dp))
        SheetFooter("Annuler", "Enregistrer", onDismiss, { onConfirm(text) }, enabled = text.isNotBlank() && text.trim() != current)
    }
}

@Composable
private fun LogDialog(model: SyncPageModel, onDismiss: () -> Unit) {
    // La lecture du journal bloque : hors du fil principal.
    val log by produceState<String?>(null) { value = model.logText() }
    NeoDialog("Journal du moteur", onDismiss, dismissLabel = "Fermer") {
        // Les derniers 20 000 caractères : le journal complet se partage.
        val shown = log
        SText(if (shown == null) "" else shown.takeLast(20_000).ifBlank { "Le journal est vide." }, color = Neo.TextSecondary, size = 11f, lineHeight = 15f)
    }
}

/** Le journal complet en fichier (un extra de texte est limité à ~1 Mo par Binder), partagé par le FileProvider de l'app. */
private suspend fun shareLog(context: Context, log: String) {
    val uri = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "updates").also { it.mkdirs() }
        val file = File(dir, "neo-calendar-sync.log")
        file.writeText(log.ifBlank { "Le journal est vide.\n" })
        FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
    }
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(Intent.createChooser(send, null))
}
