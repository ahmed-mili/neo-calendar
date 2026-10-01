package com.ahmed.neocalendar.nativeapp.ui

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.MainActivity
import com.ahmed.neocalendar.core.reminders.reminderListLabel
import com.ahmed.neocalendar.nativeapp.WorkspaceData
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts
import kotlinx.serialization.json.JsonPrimitive

private val WEEKDAYS = listOf("Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi")

private class Option(val value: String, val label: String, val icon: ImageVector? = null)

private val DESKTOP_VIEWS = listOf(
    Option("day", "Jour", NeoIcons.Square), Option("week", "Semaine", NeoIcons.Columns3),
    Option("month", "Mois", NeoIcons.CalendarRange), Option("list", "Liste", NeoIcons.List),
)
private val MOBILE_VIEWS = listOf(
    Option("day", "Jour", NeoIcons.Square), Option("3days", "3 jours", NeoIcons.Columns3), Option("list", "Liste", NeoIcons.List),
)
private val TRAVEL_MODES = listOf(
    Option("auto", "Automatique"), Option("transit", "Transports en commun"), Option("driving", "Voiture"),
    Option("walking", "À pied"), Option("bicycling", "Vélo"),
)
private val MAPS_APPS = listOf(
    Option("ask", "Demander à chaque fois"), Option("google", "Google Maps"), Option("citymapper", "Citymapper"),
    Option("moovit", "Moovit"), Option("waze", "Waze"),
)

/** Les actions que les Réglages demandent à l'écran qui les héberge. */
class SettingsActions(
    val onSetting: (key: String, value: JsonPrimitive) -> Unit,
    val onInitialView: (which: String, value: String) -> Unit,
    val onAppReminder: () -> Unit,
    val onCalendarReminder: (CalendarEntry) -> Unit,
    val onAddCalendar: () -> Unit,
    val onPickFolder: () -> Unit,
    val folderName: String,
    val oldAppInstalled: Boolean = false,
    val onUninstallOldApp: () -> Unit = {},
)

/** Un calendrier tel que la page « Calendriers » le montre. */
typealias CalendarEntry = com.ahmed.neocalendar.core.grid.CalendarModel

@Composable
private fun SText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Neo.Text,
    size: Float = 15f,
    weight: Int = 400,
    maxLines: Int = Int.MAX_VALUE,
    lineHeight: Float? = null,
    align: TextAlign? = null,
) {
    Text(
        text, modifier, color = color, fontSize = size.sp, fontWeight = FontWeight(weight), fontFamily = NeoFonts.inter,
        maxLines = maxLines, overflow = TextOverflow.Ellipsis, textAlign = align,
        lineHeight = lineHeight?.sp ?: TextUnit.Unspecified,
    )
}

/**
 * Les Réglages (§16) : pages posées sur `Mantle`, en-tête de l'ancienne, groupes de lignes séparées, dialogues de choix.
 * Chaque réglage est écrit aussitôt dans le fichier partagé. Les trois lignes de l'Apparence (thème, mode, langue),
 * les fuseaux horaires et les coffres Obsidian restent inertes jusqu'aux lots 5b et 6.
 */
@Composable
fun SettingsScreen(version: String, data: WorkspaceData, actions: SettingsActions, onBack: () -> Unit) {
    var page by rememberSaveable { mutableStateOf("") }
    var choice by remember { mutableStateOf<String?>(null) }
    BackHandler(enabled = page.isNotEmpty()) { page = "" }

    Column(Modifier.fillMaxSize().background(Neo.Mantle)) {
        SettingsHeader(
            when (page) { "calendars" -> "Calendriers"; "folder" -> "Dossier de données"; else -> "Paramètres" },
            onBack = { if (page.isNotEmpty()) page = "" else onBack() },
        )
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 26.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            when (page) {
                "calendars" -> CalendarsPage(data, actions)
                "folder" -> FolderPage(actions)
                else -> RootPage(data, actions, version, { page = it }, { choice = it })
            }
        }
    }

    @Composable
    fun pick(options: List<Option>, selected: String, title: String, onPick: (String) -> Unit) =
        ChoiceDialog(title, options, selected, { onPick(it); choice = null }, { choice = null })
    when (choice) {
        "desktopView" -> pick(DESKTOP_VIEWS, data.initialDesktop, "Vue initiale sur ordinateur") { actions.onInitialView("desktop", it) }
        "mobileView" -> pick(MOBILE_VIEWS, data.initialMobile, "Vue initiale sur téléphone") { actions.onInitialView("mobile", it) }
        "firstDay" -> pick(WEEKDAYS.mapIndexed { i, d -> Option(i.toString(), d) }, data.firstDay.toString(), "Premier jour de la semaine") {
            actions.onSetting("firstDay", JsonPrimitive(it.toInt()))
        }
        "travel" -> pick(TRAVEL_MODES, data.mapsTravelMode, "Mode de trajet") { actions.onSetting("mapsTravelMode", JsonPrimitive(it)) }
        "maps" -> pick(MAPS_APPS, data.mapsApp, "Application de cartes") { actions.onSetting("mapsApp", JsonPrimitive(it)) }
        "sync" -> SyncDialog(actions.folderName, onPickFolder = { choice = null; actions.onPickFolder() }, onDismiss = { choice = null })
    }
}

/** `.nc-settings__header` : filet bas, flèche Lucide dans un rond de 48, titre 19 / 650. */
@Composable
private fun SettingsHeader(title: String, onBack: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .drawBehind { drawRect(Color(0x16C6D0F5), Offset(0f, size.height - 1.dp.toPx()), Size(size.width, 1.dp.toPx())) }
            .padding(start = 18.dp, end = 8.dp, top = 8.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(Neo.TouchTarget).pressFill(CircleShape, Neo.Hover, onClick = onBack), contentAlignment = Alignment.Center) {
            Icon(NeoIcons.ArrowLeft, "Retour", tint = Neo.Text, modifier = Modifier.size(24.dp))
        }
        SText(title, Modifier.padding(start = 6.dp).weight(1f), size = 19f, weight = 650, maxLines = 1)
    }
}

@Composable
private fun RootPage(data: WorkspaceData, actions: SettingsActions, version: String, openPage: (String) -> Unit, openChoice: (String) -> Unit) {
    val context = LocalContext.current
    Group("Vue du calendrier", note = "Sans « Créer un événement en cliquant un jour du mois », un clic dans le mois ouvre la vue du jour.") {
        row(NeoIcons.Monitor, "Vue initiale sur ordinateur", DESKTOP_VIEWS.label(data.initialDesktop)) { openChoice("desktopView") }
        row(NeoIcons.Smartphone, "Vue initiale sur téléphone", MOBILE_VIEWS.label(data.initialMobile)) { openChoice("mobileView") }
        row(NeoIcons.CalendarRange, "Premier jour de la semaine", WEEKDAYS[data.firstDay.coerceIn(0, 6)]) { openChoice("firstDay") }
        toggle(NeoIcons.Timer, "Format 24 heures", data.timeFormat24h) { actions.onSetting("timeFormat24h", JsonPrimitive(it)) }
        toggle(NeoIcons.CalendarClock, "Créer un événement en cliquant un jour du mois", data.clickToCreateFromMonth) {
            actions.onSetting("clickToCreateEventFromMonthView", JsonPrimitive(it))
        }
        toggle(NeoIcons.Columns2, "Défilement libre entre les jours", data.freeScroll) { actions.onSetting("freeScroll", JsonPrimitive(it)) }
        row(NeoIcons.Bell, "Rappel", reminderListLabel(data.reminderMinutes.map { it.toDouble() }), onClick = actions.onAppReminder)
        row(NeoIcons.Route, "Mode de trajet", TRAVEL_MODES.label(data.mapsTravelMode)) { openChoice("travel") }
        row(NeoIcons.Map, "Application de cartes", MAPS_APPS.label(data.mapsApp)) { openChoice("maps") }
        toggle(NeoIcons.Check, "Nouveaux événements créés comme des tâches", data.defaultEventsAsTasks) {
            actions.onSetting("defaultEventsAsTasks", JsonPrimitive(it))
        }
    }
    // Thème, mode de couleur et langue : lot 5b. Les lignes sont là, leur page pas encore.
    Group("Apparence") {
        row(NeoIcons.Palette, "Thème", "Catppuccin", onClick = null)
        row(NeoIcons.Moon, "Mode de couleur", "Sombre", onClick = null)
        row(NeoIcons.Languages, "Langue", "Français", onClick = null)
    }
    Group("Intégrations") {
        row(NeoIcons.CalendarDays, "Calendriers", data.calendars.size.toString()) { openPage("calendars") }
        // Fuseaux horaires : lot 6.
        row(NeoIcons.Globe, "Fuseaux horaires", if (data.secondaryTimezones.isEmpty()) "Aucun" else data.secondaryTimezones.size.toString(), onClick = null)
    }
    Group("Données") {
        row(NeoIcons.FolderOpen, "Dossier de données", actions.folderName) { openPage("folder") }
        // Coffres Obsidian : sans effet sur téléphone, comme l'ancienne.
        row(NeoIcons.Library, "Coffres Obsidian", "Aucun dossier", onClick = null)
        row(NeoIcons.RefreshCw, "Synchronisation", null) { openChoice("sync") }
    }
    // Hors de l'ancienne, gardé tant que les deux interfaces cohabitent.
    Group("Application") {
        if (actions.oldAppInstalled) row(NeoIcons.Trash2, "Ancienne version encore installée", "Désinstaller", onClick = actions.onUninstallOldApp)
        row(NeoIcons.Calendar, "Ancienne interface (WebView)", null) { context.startActivity(Intent(context, MainActivity::class.java)) }
    }
    SText(version, Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 8.dp), color = Neo.TextFaint, size = 12f, align = TextAlign.Center)
}

private fun List<Option>.label(value: String) = firstOrNull { it.value == value }?.label.orEmpty()

@Composable
private fun CalendarsPage(data: WorkspaceData, actions: SettingsActions) {
    Group(null, note = "Chaque sous-dossier direct du dossier de données est un calendrier. Il peut être une note complète, un abonnement ICS, ou détecté automatiquement.") {
        row(NeoIcons.Plus, "Ajouter un calendrier", null, onClick = actions.onAddCalendar)
    }
    if (data.calendars.isNotEmpty()) {
        Group("Calendriers") {
            for (calendar in data.calendars) {
                val own = data.calendarReminderMinutes[calendar.relativePath]
                row(
                    null, calendar.name,
                    "Rappel : " + if (own == null) "réglage de l'application" else reminderListLabel(own.map { it.toDouble() }),
                    dot = parseCalendarColor(calendar.color),
                ) { actions.onCalendarReminder(calendar) }
            }
        }
    }
}

@Composable
private fun FolderPage(actions: SettingsActions) {
    Group(null, note = "Neo Calendar range ses fichiers de calendrier dans ce dossier. Chaque sous-dossier direct est un calendrier.") {
        text(actions.folderName)
        row(NeoIcons.FolderOpen, "Changer de dossier", null, onClick = actions.onPickFolder)
    }
}

/** Ce qu'un groupe contient : le groupe en dessine les lignes, chacune avec son rayon (14 en haut du premier, 14 en bas du dernier, 4 ailleurs). */
private class GroupBuilder {
    val rows = mutableListOf<@Composable (Shape) -> Unit>()

    /** Une ligne ; sans `onClick` elle est inerte (ni fond d'appui, ni chevron). Un `dot` fait la ligne d'un calendrier. */
    fun row(icon: ImageVector?, label: String, value: String?, dot: Color? = null, onClick: (() -> Unit)?) {
        rows += { shape ->
            val base = Modifier.fillMaxWidth().heightIn(min = 52.dp).background(Neo.SettingRow, shape)
            Row(
                (if (onClick != null) base.pressFill(shape, Neo.Hover, onClick = onClick) else base.clip(shape))
                    .padding(start = 16.dp, end = 14.dp, top = 9.dp, bottom = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (icon != null) Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                    Icon(icon, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp))
                }
                if (dot != null) {
                    Box(Modifier.size(14.dp).clip(CircleShape).background(dot))
                    Column(Modifier.weight(1f)) {
                        SText(label, lineHeight = 19.5f, maxLines = 1)
                        if (value != null) SText(value, color = Neo.TextFaint, size = 12f, maxLines = 1)
                    }
                } else {
                    SText(label, Modifier.weight(1f), lineHeight = 19.5f)
                    if (!value.isNullOrEmpty()) SText(value, Modifier.widthIn(max = 200.dp), color = Neo.SettingsValue, maxLines = 1, align = TextAlign.End)
                }
                // Le chevron annonce une page ou un dialogue ; « Ajouter » et « Changer de dossier » agissent sur place.
                if (onClick != null && (dot != null || value != null)) {
                    Icon(NeoIcons.ChevronRight, null, tint = Neo.SettingsNote, modifier = Modifier.size(18.dp))
                }
            }
        }
    }

    fun toggle(icon: ImageVector, label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
        rows += { shape ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 52.dp).background(Neo.SettingRow, shape)
                    .pressFill(shape, Neo.Hover) { onChange(!checked) }
                    .padding(start = 16.dp, end = 14.dp, top = 9.dp, bottom = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp)) }
                SText(label, Modifier.weight(1f), lineHeight = 19.5f)
                SettingsSwitch(checked)
            }
        }
    }

    /** Une ligne de texte seul (le chemin du dossier, en petit). */
    fun text(value: String) {
        rows += { shape ->
            Box(Modifier.fillMaxWidth().background(Neo.SettingRow, shape).padding(horizontal = 16.dp, vertical = 14.dp)) {
                SText(value, color = Neo.TextFaint, size = 12f, lineHeight = 16f)
            }
        }
    }
}

/** Les groupes de l'ancienne : titre 13 / 500, lignes séparées de 2 dp, fond `SettingRow`, note de 13 dessous. */
@Composable
private fun Group(title: String?, note: String? = null, content: GroupBuilder.() -> Unit) {
    val rows = GroupBuilder().apply(content).rows
    Column {
        if (title != null) SText(title, Modifier.padding(start = 4.dp, bottom = 8.dp), color = Neo.SettingsValue, size = 13f, weight = 500)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            rows.forEachIndexed { index, row ->
                val top = if (index == 0) 14.dp else 4.dp
                val bottom = if (index == rows.lastIndex) 14.dp else 4.dp
                row(RoundedCornerShape(topStart = top, topEnd = top, bottomStart = bottom, bottomEnd = bottom))
            }
        }
        if (note != null) SText(note, Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp), color = Neo.SettingsNote, size = 13f, lineHeight = 18.85f)
    }
}

private val SwitchEasing = CubicBezierEasing(0.2f, 0.85f, 0.25f, 1f)

/** `.nc-set-switch` : piste 44 x 26, bouton 20 posé à 3, décalé de 18 une fois activé ; 160 ms. */
@Composable
private fun SettingsSwitch(checked: Boolean) {
    val knobX by animateDpAsState(if (checked) 21.dp else 3.dp, tween(160, easing = SwitchEasing), label = "switch-knob")
    val track by animateColorAsState(if (checked) Neo.Accent else Color(0x32C6D0F5), tween(160), label = "switch-track")
    val knob by animateColorAsState(if (checked) Color.White else Neo.Text, tween(160), label = "switch-knob-color")
    Box(Modifier.size(width = 44.dp, height = 26.dp).clip(CircleShape).background(track)) {
        Box(Modifier.offset(x = knobX, y = 3.dp).size(20.dp).clip(CircleShape).background(knob))
    }
}

/** `nc-choice-dialog` : la carte de 300 dp, un titre, des options de 40 dp ; la choisie en accent avec sa coche de 16. */
@Composable
private fun ChoiceDialog(title: String, options: List<Option>, selected: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    ChoiceCard(title, onDismiss) {
        for (option in options) {
            val on = option.value == selected
            val shape = RoundedCornerShape(6.dp)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).pressFill(shape, Neo.Hover) { onPick(option.value) }.padding(horizontal = 10.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (option.icon != null) Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                    Icon(option.icon, null, tint = if (on) Neo.Accent else Neo.TextSecondary, modifier = Modifier.size(19.dp))
                }
                SText(option.label, Modifier.weight(1f), color = if (on) Neo.Accent else Neo.Text, size = 14f, maxLines = 1)
                if (on) Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** La Synchronisation : un dialogue de texte (dossier, note, trois méthodes), comme `nc-choice-dialog` sur l'ancienne. */
@Composable
private fun SyncDialog(folderName: String, onPickFolder: () -> Unit, onDismiss: () -> Unit) {
    ChoiceCard("Synchronisation", onDismiss) {
        val shape = RoundedCornerShape(6.dp)
        Row(
            Modifier.fillMaxWidth().pressFill(shape, Neo.Hover, onClick = onPickFolder).padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { Icon(NeoIcons.FolderOpen, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp)) }
            Column(Modifier.weight(1f)) {
                SText("Dossier de données", lineHeight = 19.5f)
                SText(folderName, color = Neo.SettingsValue, maxLines = 1)
            }
            Icon(NeoIcons.ChevronRight, null, tint = Neo.SettingsNote, modifier = Modifier.size(18.dp))
        }
        SText(
            "Neo Calendar range ses données dans le dossier que vous choisissez. La synchronisation est assurée par l'outil que vous retenez.",
            Modifier.padding(horizontal = 10.dp, vertical = 8.dp), color = Neo.SettingsNote, size = 13f, lineHeight = 18.85f,
        )
        SText("Méthodes possibles", Modifier.padding(start = 10.dp, top = 6.dp, bottom = 4.dp), color = Neo.SettingsValue, size = 13f, weight = 500)
        for ((name, how) in listOf("Syncthing" to "Recommandé", "Stockage en ligne" to "OneDrive, Google Drive, Dropbox", "Transfert manuel" to "Par USB")) {
            Column(Modifier.fillMaxWidth().padding(start = 44.dp, end = 10.dp, top = 8.dp, bottom = 8.dp)) {
                SText(name, lineHeight = 19.5f)
                SText(how, color = Neo.SettingsValue, lineHeight = 19.5f)
            }
        }
    }
}
