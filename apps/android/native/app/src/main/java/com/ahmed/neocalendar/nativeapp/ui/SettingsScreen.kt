package com.ahmed.neocalendar.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.reminders.reminderListLabel
import com.ahmed.neocalendar.MainActivity
import com.ahmed.neocalendar.nativeapp.NativeUpdates
import com.ahmed.neocalendar.nativeapp.WorkspaceData
import android.content.Intent
import androidx.compose.ui.platform.LocalContext
import com.ahmed.neocalendar.nativeapp.ui.fields.NeoSwitch
import kotlinx.serialization.json.JsonPrimitive

private val WEEKDAYS = listOf("Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi")

private val TRAVEL_MODES = listOf(
    "auto" to "Choisi par Maps",
    "transit" to "Transports en commun",
    "driving" to "Voiture",
    "walking" to "À pied",
    "bicycling" to "Vélo",
)

private val MAPS_APPS = listOf(
    "ask" to "Demander à chaque fois",
    "google" to "Google Maps",
    "citymapper" to "Citymapper",
    "moovit" to "Moovit",
    "waze" to "Waze",
)

/** Les actions que les Réglages demandent à l'écran qui les héberge. */
class SettingsActions(
    val onSetting: (key: String, value: JsonPrimitive) -> Unit,
    val onAppReminder: () -> Unit,
    val onCalendarReminder: (CalendarEntry) -> Unit,
    val onAddCalendar: () -> Unit,
    val onPickFolder: () -> Unit,
    val folderName: String,
    val oldAppInstalled: Boolean = false,
    val onUninstallOldApp: () -> Unit = {},
)

private fun checkLabel(updates: NativeUpdates): String = when (updates.checkResult) {
    null -> ""
    "checking" -> "Recherche…"
    "debug" -> "Développement"
    "latest" -> "À jour"
    "found" -> if (updates.pending.isNotEmpty()) "Version ${updates.pending} prête" else "Téléchargement…"
    else -> "Impossible de vérifier"
}

/** Un calendrier tel que la page « Calendriers » le montre. */
typealias CalendarEntry = com.ahmed.neocalendar.core.grid.CalendarModel

/**
 * Les Réglages : la page racine de l'inventaire §3 sans les réglages du PC, puis la page des calendriers.
 * Chaque réglage est écrit aussitôt dans le fichier partagé (la clé seule, relue avant l'écriture).
 */
@Composable
fun SettingsScreen(version: String, updates: NativeUpdates, data: WorkspaceData, actions: SettingsActions, onBack: () -> Unit) {
    var page by rememberSaveable { mutableStateOf("") }
    var choice by remember { mutableStateOf<String?>(null) }
    BackHandler(enabled = page.isNotEmpty()) { page = "" }

    Column(Modifier.fillMaxSize().background(Neo.Background)) {
        ListHeader(if (page == "calendars") "Calendriers" else "Paramètres", onBack = { if (page.isNotEmpty()) page = "" else onBack() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp)) {
            if (page == "calendars") CalendarsPage(data, actions) else RootPage(data, actions, version, updates, { page = it }, { choice = it })
        }
    }

    when (choice) {
        "firstDay" -> ChoiceDialog(
            "Premier jour de la semaine",
            WEEKDAYS.mapIndexed { index, name -> index.toString() to name },
            data.firstDay.toString(),
            { actions.onSetting("firstDay", JsonPrimitive(it.toInt())); choice = null },
            { choice = null },
        )
        "travel" -> ChoiceDialog(
            "Mode de trajet",
            TRAVEL_MODES,
            data.mapsTravelMode,
            { actions.onSetting("mapsTravelMode", JsonPrimitive(it)); choice = null },
            { choice = null },
        )
        "maps" -> ChoiceDialog(
            "Application de cartes",
            MAPS_APPS,
            data.mapsApp,
            { actions.onSetting("mapsApp", JsonPrimitive(it)); choice = null },
            { choice = null },
        )
    }
}

@Composable
private fun RootPage(data: WorkspaceData, actions: SettingsActions, version: String, updates: NativeUpdates, openPage: (String) -> Unit, openChoice: (String) -> Unit) {
    Group("Vue du calendrier") {
        SettingRow(NeoIcons.Calendar, "Premier jour de la semaine", WEEKDAYS[data.firstDay.coerceIn(0, 6)]) { openChoice("firstDay") }
        SettingToggle(NeoIcons.Clock, "Format 24 heures", data.timeFormat24h) { actions.onSetting("timeFormat24h", JsonPrimitive(it)) }
        SettingToggle(NeoIcons.ChevronRight, "Défilement libre entre les jours", data.freeScroll) { actions.onSetting("freeScroll", JsonPrimitive(it)) }
        SettingRow(NeoIcons.Bell, "Rappel", reminderListLabel(data.reminderMinutes.map { it.toDouble() }), onClick = actions.onAppReminder)
        SettingRow(NeoIcons.Navigation, "Mode de trajet", TRAVEL_MODES.firstOrNull { it.first == data.mapsTravelMode }?.second.orEmpty()) { openChoice("travel") }
        SettingRow(NeoIcons.MapPin, "Application de cartes", MAPS_APPS.firstOrNull { it.first == data.mapsApp }?.second.orEmpty()) { openChoice("maps") }
        SettingToggle(NeoIcons.Check, "Nouveaux événements créés comme des tâches", data.defaultEventsAsTasks) { actions.onSetting("defaultEventsAsTasks", JsonPrimitive(it)) }
    }
    Group("Intégrations") {
        SettingRow(NeoIcons.Calendar, "Calendriers", data.calendars.size.toString()) { openPage("calendars") }
    }
    Group("Données") {
        SettingRow(NeoIcons.FolderOpen, "Dossier de données", actions.folderName, onClick = actions.onPickFolder)
    }
    Group("Application") {
        val context = LocalContext.current
        if (updates.pending.isNotEmpty()) SettingRow(NeoIcons.Download, "Installer la version ${updates.pending}", "", onClick = updates::install)
        SettingRow(NeoIcons.RefreshCw, "Rechercher les mises à jour", checkLabel(updates)) { updates.check() }
        if (actions.oldAppInstalled) {
            SettingRow(NeoIcons.Trash2, "Ancienne version encore installée", "Désinstaller", onClick = actions.onUninstallOldApp)
        }
        SettingRow(NeoIcons.Calendar, "Ancienne interface (WebView)", "") {
            context.startActivity(Intent(context, MainActivity::class.java))
        }
    }
    Text("v$version", color = Neo.TextFaint, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
}

@Composable
private fun CalendarsPage(data: WorkspaceData, actions: SettingsActions) {
    Group("Calendriers") {
        for (calendar in data.calendars) {
            val own = data.calendarReminderMinutes[calendar.relativePath]
            SettingRow(
                null,
                calendar.name,
                "Rappel : " + if (own == null) "réglage de l'application" else reminderListLabel(own.map { it.toDouble() }),
                dot = parseCalendarColor(calendar.color),
            ) { actions.onCalendarReminder(calendar) }
        }
        SettingRow(NeoIcons.Plus, "Ajouter un calendrier", null, onClick = actions.onAddCalendar)
    }
}

@Composable
private fun Group(title: String, content: @Composable () -> Unit) {
    Text(title, color = Neo.TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp, top = 16.dp, bottom = 6.dp))
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Neo.Surface).border(1.dp, Neo.Border, RoundedCornerShape(14.dp))) { content() }
}

@Composable
private fun SettingRow(icon: ImageVector?, label: String, value: String?, dot: androidx.compose.ui.graphics.Color? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, null, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
        if (dot != null) Box(Modifier.size(14.dp).clip(CircleShape).background(dot))
        Column(Modifier.padding(start = 14.dp).weight(1f)) {
            Text(label, color = Neo.Text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (value != null && dot != null) Text(value, color = Neo.TextFaint, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (value != null && dot == null) {
            Text(value, color = Neo.TextSecondary, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp).widthIn(max = 170.dp))
            Icon(NeoIcons.ChevronRight, null, tint = Neo.TextFaint, modifier = Modifier.padding(start = 4.dp).size(16.dp))
        }
    }
}

@Composable
private fun SettingToggle(icon: ImageVector, label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable { onChange(!checked) }.padding(start = 16.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
        Text(label, color = Neo.Text, fontSize = 15.sp, modifier = Modifier.padding(start = 14.dp).weight(1f))
        NeoSwitch(checked, onChange = onChange)
    }
}
