package com.ahmed.neocalendar.nativeapp.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.ahmed.neocalendar.core.sync.RunConditions
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.lastSeenLabel
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import com.ahmed.neocalendar.nativeapp.sync.DeviceRow
import com.ahmed.neocalendar.nativeapp.sync.ProposalRow
import com.ahmed.neocalendar.nativeapp.sync.SyncController
import com.ahmed.neocalendar.nativeapp.sync.SyncPageModel
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction
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
    val onClearPrivate: () -> Unit = {},
)

private sealed interface SyncSheet {
    data object AddDevice : SyncSheet
    data object Rename : SyncSheet
    data object Network : SyncSheet
    data object Power : SyncSheet
    data object Log : SyncSheet
    data class Remove(val device: DeviceRow) : SyncSheet
    data class Adopt(val row: ProposalRow, val notes: Int, val replacesPreferences: Boolean) : SyncSheet
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
    // Des notes restées dans le stockage privé d'un passage précédent : on propose de les vider (jamais automatiquement).
    // Relu à chaque nouvelle série d'actions (`actions` change après chaque passage).
    val leftover by androidx.compose.runtime.produceState(false, actions) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { com.ahmed.neocalendar.nativeapp.sync.StorageSwitch.privateHasNotes(context) }
    }
    SyncHeader("Le dossier de Neo Calendar est synchronisé par une autre application")
    Group(null) {
        row(NeoIcons.FolderOpen, "Dossier de notes", folderName, chevron = false, onClick = null)
        row(null, "Passer à la synchronisation intégrée", null, iconContent = { Icon(SyncthingLogo, null, tint = Color.Unspecified, modifier = Modifier.size(20.dp)) }, onClick = actions.onSwitchToIntegrated)
        if (leftover) row(NeoIcons.Trash2, "Vider le stockage privé", "Notes d'un passage précédent", chevron = false, onClick = actions.onClearPrivate)
    }
    SyncthingAbout(context)
}

/** Les réseaux sur lesquels synchroniser : un seul choix pour les deux réglages Wi-Fi et données mobiles. */
private fun networkChoice(c: RunConditions) = when {
    c.onWifi && c.onMobileData -> "both"
    c.onWifi -> "wifi"
    c.onMobileData -> "mobile"
    else -> "none"
}

private fun networkLabel(choice: String) = when (choice) {
    "both" -> "Wi-Fi et données mobiles"
    "wifi" -> "Wi-Fi seulement"
    "mobile" -> "Données mobiles seulement"
    else -> "Jamais (en pause)"
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
    var advanced by remember { mutableStateOf(false) }

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

    // Appairage par QR code : le scan vaut consentement côté téléphone ; le PC accepte tout seul le bon code (fenêtre de 5 minutes).
    fun scanPc() = scanQrCode(context) { scanned ->
        scope.launch {
            val error = model.pairWithPc(scanned)
            if (error != null) Notices.show(error) else Notices.show("Appairage lancé : le PC va accepter ce téléphone dans un instant.")
        }
    }

    SyncHeader("Le dossier de Neo Calendar est synchronisé par Syncthing intégré")

    Group("État") {
        row(NeoIcons.RefreshCw, status.text(), null, chevron = false, onClick = null)
        // Après l'abandon des relances le moteur ne repart plus seul : un geste de l'utilisateur le relance.
        if (engineState is EngineState.Failed) row(NeoIcons.RefreshCw, "Réessayer", null, chevron = false) { controller.retry() }
    }

    Group("Cet appareil") {
        val id = ui.myId
        row(NeoIcons.Smartphone, "Nom", if (isGenericDeviceName(ui.myName)) defaultDeviceName(context) else ui.myName, onClick = { sheet = SyncSheet.Rename })
        if (id != null) {
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

    Group("Appairer avec un PC") {
        custom { shape -> PrimaryButtonRow(shape, NeoIcons.QrCode, "Scanner le QR code du PC") { scanPc() } }
    }

    Group("Vos appareils") {
        for (device in ui.devices) {
            row(NeoIcons.Users, device.name, lastSeenLabel(device.connected, device.lastSeen, Instant.now()), dot = if (device.connected) Neo.Success else Neo.TextFaint) {
                sheet = SyncSheet.Remove(device)
            }
        }
        custom { OutlineAddButton("Ajouter un appareil") { sheet = SyncSheet.AddDevice } }
    }

    if (ui.pendingDevices.isNotEmpty()) Group("Demandes de connexion") {
        for (pending in ui.pendingDevices) custom { shape ->
            PendingDeviceCard(shape, pending, { scope.launch { report(model.accept(pending)) } }, { scope.launch { report(model.reject(pending.id)) } })
        }
    }

    // Les dossiers proposés par un appareil, ou le dossier qui n'a pas pu être posé : seulement quand il y a quelque chose à décider.
    val lost = ui.folderLost
    val offered = ui.proposals.filter { it.proposal != lost }
    if (lost != null || offered.isNotEmpty()) Group("Dossier proposé") {
        // Le dossier précédent a été retiré sans que le nouveau ait pu être posé : jamais un moteur muet sans dossier.
        if (lost != null) custom { shape ->
            FolderLostCard(shape, lost.label.ifBlank { "Neo Calendar" }) { scope.launch { report(model.adopt(lost)) } }
        }
        for (proposal in offered) custom { shape ->
            ProposalCard(
                shape,
                proposal,
                onAdopt = {
                    scope.launch {
                        val brings = proposal.decision == ProposalDecision.Adopt || proposal.decision is ProposalDecision.Replace
                        sheet = SyncSheet.Adopt(proposal, model.localNoteCount(), brings && model.hasLocalPreferences())
                    }
                },
                onIgnore = { scope.launch { report(model.refuseFolder(proposal.proposal)) } },
            )
        }
    }

    Group("Fonctionnement") {
        toggle(NeoIcons.Clock, "Synchroniser en arrière-plan", settings.runMode == RunMode.LikeFork) { on ->
            controller.settings.update { it.copy(runMode = if (on) RunMode.LikeFork else RunMode.OnlyWhenOpen) }
        }
        if (settings.runMode == RunMode.LikeFork) toggle(NeoIcons.Timer, "Démarrer avec le téléphone", settings.autoStart) { on -> controller.settings.update { it.copy(autoStart = on) } }
        row(NeoIcons.Globe, "Synchroniser", networkLabel(networkChoice(settings.conditions)), onClick = { sheet = SyncSheet.Network })
        row(NeoIcons.SlidersHorizontal, "Réglages avancés", null, onClick = { advanced = !advanced })
        if (advanced) {
            toggle(NeoIcons.Globe, "Synchroniser sur un Wi-Fi limité", settings.conditions.onMeteredWifi) { on -> controller.settings.update { it.copy(conditions = it.conditions.copy(onMeteredWifi = on)) } }
            row(NeoIcons.Bell, "Synchroniser sur", powerLabel(settings.conditions.power), onClick = { sheet = SyncSheet.Power })
            toggle(NeoIcons.Moon, "Pause en économie d'énergie", settings.conditions.respectBatterySaver) { on ->
                controller.settings.update { it.copy(conditions = it.conditions.copy(respectBatterySaver = on)) }
            }
        }
        if (settings.runMode == RunMode.LikeFork && !settings.autoStart) row(NeoIcons.Close, "Arrêter la synchronisation", null, chevron = false) { controller.quit() }
    }

    Group("Conflits") {
        row(NeoIcons.TriangleAlert, "Fichiers de conflit", ui.conflicts.toString(), chevron = false, onClick = null)
    }

    Group("Journal du moteur") {
        row(NeoIcons.FileText, "Afficher", null, onClick = { sheet = SyncSheet.Log })
        row(NeoIcons.ExternalLink, "Partager", null, chevron = false) { scope.launch { shareLog(context, model.logText()) } }
    }

    SyncthingAbout(context)

    when (val open = sheet) {
        null -> Unit
        SyncSheet.AddDevice -> AddDeviceDialog(ui.myId, { sheet = null }) { id, name -> model.addDevice(id, name) }
        SyncSheet.Rename -> RenameSheet(if (isGenericDeviceName(ui.myName)) defaultDeviceName(context) else ui.myName, { sheet = null }) { name -> scope.launch { report(model.rename(name)) }; sheet = null }
        SyncSheet.Network -> ChoiceDialog(
            "Synchroniser", listOf("wifi", "both", "mobile", "none").map { Option(it, networkLabel(it)) }, networkChoice(settings.conditions),
            { picked ->
                controller.settings.update {
                    it.copy(conditions = it.conditions.copy(onWifi = picked == "wifi" || picked == "both", onMobileData = picked == "mobile" || picked == "both"))
                }
                sheet = null
            },
            { sheet = null },
        )
        SyncSheet.Power -> ChoiceDialog(
            "Synchroniser sur", PowerSource.entries.map { Option(it.name, powerLabel(it)) }, settings.conditions.power.name,
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
                " (une note écrasée reste récupérable dans la corbeille de synchronisation pendant 30 jours)." +
                (if (open.replacesPreferences) PREFERENCES_WARNING else ""),
            "Synchroniser", danger = false, onDismiss = { sheet = null },
        ) { scope.launch { report(model.adopt(open.row.proposal)) }; sheet = null }
    }
}

/** Un bouton discret à contour, à gauche, sous la liste d'un groupe : pas pleine largeur, pas de fond plein. */
@Composable
private fun OutlineAddButton(label: String, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Row(
        Modifier.padding(top = 8.dp).height(40.dp).clip(shape).border(1.dp, Neo.Border, shape).clickable(onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(NeoIcons.Plus, null, tint = Neo.SettingsValue, modifier = Modifier.size(16.dp))
        SText(label, size = 14f, weight = 500, maxLines = 1)
    }
}

/** La phrase du haut de page : qui synchronise le dossier de Neo Calendar, avec le logo de Syncthing. */
@Composable
private fun SyncHeader(sentence: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(SyncthingLogo, null, tint = Color.Unspecified, modifier = Modifier.size(28.dp))
        SText(sentence, Modifier.weight(1f), lineHeight = 20f)
    }
}

/** Le nom que le moteur se donne sans qu'on lui en demande un (« localhost » ou rien) : il ne dit rien à l'utilisateur. */
internal fun isGenericDeviceName(name: String?) = name.isNullOrBlank() || name.equals("localhost", ignoreCase = true)

/** Le nom de l'appareil quand l'utilisateur n'en a pas donné : celui des réglages du téléphone, sinon fabricant et modèle. */
internal fun defaultDeviceName(context: Context): String {
    val set = runCatching { android.provider.Settings.Global.getString(context.contentResolver, android.provider.Settings.Global.DEVICE_NAME) }.getOrNull()
    if (!set.isNullOrBlank()) return set.trim()
    val model = android.os.Build.MODEL.orEmpty()
    val maker = android.os.Build.MANUFACTURER.orEmpty()
    return if (model.startsWith(maker, ignoreCase = true) || maker.isBlank()) model else "${maker.replaceFirstChar { it.uppercase() }} $model"
}

/** Les réglages partagés (`.neo-calendar/.neo-calendar.json`) existent des deux côtés : le fichier de l'autre appareil fait foi. */
private const val PREFERENCES_WARNING =
    "\n\nCe téléphone a déjà ses réglages partagés (couleurs, calendriers masqués, liens ICS) : ils pourront être remplacés par ceux " +
        "de l'autre appareil, ou l'inverse. Pour que l'autre appareil fasse foi, le fichier de réglages de ce téléphone est mis de côté " +
        "avant la synchronisation (copie datée dans le stockage privé, hors du dossier synchronisé, jamais supprimée)."

private fun powerLabel(power: PowerSource) = when (power) {
    PowerSource.Always -> "Secteur et batterie"
    PowerSource.ChargingOnly -> "Secteur seulement"
    PowerSource.BatteryOnly -> "Batterie seulement"
}

/** Le geste principal d'un groupe : une ligne pleine à la couleur d'accent, libellé sur une ligne. */
@Composable
private fun PrimaryButtonRow(shape: androidx.compose.ui.graphics.Shape, icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(52.dp).clip(shape).background(Neo.Accent).clickable(onClick = onClick).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = Neo.OnAccent, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(9.dp))
        SText(label, color = Neo.OnAccent, weight = 600, maxLines = 1)
    }
}

/** Le logo de Syncthing (Simple Icons, `syncthing.svg`) : tracé plein à la couleur de la marque, comme les autres logos de marque de l'app. */
private val SyncthingLogo: ImageVector by lazy {
    ImageVector.Builder("syncthing", 22.dp, 22.dp, 24f, 24f).apply {
        addPath(pathData = addPathNodes("M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm0 2.412c3.115 0 5.885 1.5 7.629 3.815a1.834 1.834 0 0 1 1.564 3.162c.23.818.354 1.68.354 2.57a9.504 9.504 0 0 1-2.166 6.05c.128.281.189.595.162.92a1.854 1.854 0 0 1-2.004 1.678 1.86 1.86 0 0 1-.877-.322A9.486 9.486 0 0 1 12 21.505c-3.84 0-7.154-2.277-8.668-5.552-.3-.01-.601-.092-.879-.254-.858-.51-1.144-1.634-.633-2.513.164-.276.39-.493.653-.643a9.62 9.62 0 0 1-.02-.584c0-5.265 4.282-9.547 9.547-9.547zm0 1.227a8.311 8.311 0 0 0-8.31 8.683c.22.036.439.111.644.23.323.2.564.484.713.805l6.984-.644a1.78 1.78 0 0 1 .787-1.08c.288-.19.612-.286.936-.295.34-.01.68.08.978.254l3.51-2.914a1.82 1.82 0 0 1 .317-1.84A8.3 8.3 0 0 0 12 3.638zm7.027 5.98-3.502 2.91a1.829 1.829 0 0 1-.23 1.719l1.904 2.744c.212-.06.436-.085.668-.066.238.024.46.092.66.193a8.285 8.285 0 0 0 1.793-5.16 8.38 8.38 0 0 0-.265-2.092 1.835 1.835 0 0 1-1.028-.248zm-6.886 4.315-6.975.644a1.8 1.8 0 0 1-.66 1.004A8.312 8.312 0 0 0 12 20.279a8.294 8.294 0 0 0 3.938-.986 1.845 1.845 0 0 1-.075-.69c.028-.341.148-.65.332-.908L14.29 14.95a1.839 1.839 0 0 1-2.148-1.015z"), fill = SolidColor(Color(0xFF0891D1)))
    }.build()
}

/** Au bas de la page : le logo de Syncthing et un lien vers son site. */
@Composable
private fun SyncthingAbout(context: Context) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(SyncthingLogo, "Syncthing", tint = Color.Unspecified, modifier = Modifier.size(22.dp))
        SText(
            "En savoir plus sur Syncthing",
            Modifier.clickable { context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://syncthing.net"))) }.padding(vertical = 8.dp),
            color = Neo.Accent, size = 13f, maxLines = 1,
        )
    }
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

/** Une fenêtre centrée sur fond sombre : la forme de « Ajouter un appareil » et de la confirmation du passage à la synchronisation intégrée. */
@Composable
internal fun CenteredDialog(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        val shape = RoundedCornerShape(20.dp)
        Column(
            Modifier.padding(horizontal = 24.dp).fillMaxWidth().widthIn(max = 420.dp).background(Neo.Surface, shape).border(1.dp, Neo.BorderStrong, shape).padding(top = 18.dp),
            content = content,
        )
    }
}

/** La confirmation du passage à la synchronisation intégrée : une phrase, et l'avertissement d'une autre app Syncthing seulement s'il y a lieu. */
@Composable
internal fun SwitchToIntegratedDialog(hasStfolder: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    CenteredDialog(onDismiss) {
        UiText("Passer à la synchronisation intégrée", size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 18.dp))
        UiText("Vos notes sont copiées dans Neo Calendar. Votre dossier actuel ne change pas.", color = Neo.TextSecondary, size = 15.sp, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 10.dp))
        if (hasStfolder) UiText("Retirez ensuite ce dossier de l'autre app Syncthing.", color = Neo.TextSecondary, size = 15.sp, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 8.dp))
        SheetFooter("Annuler", "Passer", onDismiss, onConfirm)
    }
}

@Composable
private fun AddDeviceDialog(myId: String?, onDismiss: () -> Unit, onAdd: suspend (String, String) -> String?) {
    val context = LocalContext.current
    var id by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val normalized = DeviceIds.normalize(id)
    val valid = normalized != null
    val isSelf = normalized != null && normalized == myId?.let { DeviceIds.normalize(it) }
    CenteredDialog(onDismiss) {
        UiText("Ajouter un appareil", size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 18.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp), horizontalArrangement = Arrangement.End) {
            TextAction("Scanner un QR code") { scanQrCode(context) { id = it.trim(); error = null } }
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
