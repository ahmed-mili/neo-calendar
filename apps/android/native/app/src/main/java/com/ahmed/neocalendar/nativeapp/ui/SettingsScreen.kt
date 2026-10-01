package com.ahmed.neocalendar.nativeapp.ui

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
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
import com.ahmed.neocalendar.core.appearance.AppearanceMode
import com.ahmed.neocalendar.core.appearance.THEMES
import com.ahmed.neocalendar.core.preferences.ICS_REFRESH_MINUTES
import com.ahmed.neocalendar.core.reminders.reminderListLabel
import com.ahmed.neocalendar.core.tasks.misfiledEventsOf
import com.ahmed.neocalendar.core.timezones.canonicalZoneId
import com.ahmed.neocalendar.core.timezones.timezoneAdded
import com.ahmed.neocalendar.nativeapp.AppLanguage
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoAppearance
import com.ahmed.neocalendar.nativeapp.WorkspaceData
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts
import kotlinx.serialization.json.JsonPrimitive

private val WEEKDAYS = listOf("Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi")

internal class Option(val value: String, val label: String, val icon: ImageVector? = null, val iconContent: (@Composable () -> Unit)? = null)

private val MODES = listOf(
    Option("system", "Système", NeoIcons.Smartphone), Option("light", "Clair", NeoIcons.SunMedium), Option("dark", "Sombre", NeoIcons.Moon),
)
private val LANGUAGE_OPTIONS = listOf(Option("fr", "Français"), Option("en", "English"))

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
    /** Les gestes d'une ligne de la page Calendriers : ceux du tiroir (coche, couleur, par défaut, renommer, retirer). */
    val onToggleCalendar: (CalendarEntry) -> Unit = {},
    val onSetDefaultCalendar: (CalendarEntry) -> Unit = {},
    val onCalendarColor: (CalendarEntry, androidx.compose.ui.geometry.Rect) -> Unit = { _, _ -> },
    val onRenameCalendar: (CalendarEntry) -> Unit = {},
    val onDeleteCalendar: (CalendarEntry) -> Unit = {},
    val onAddCalendar: () -> Unit,
    val onPickFolder: () -> Unit,
    val folderName: String,
    /** Les notes sont dans le stockage privé (synchronisation intégrée) : pas de « Changer de dossier ». */
    val integratedStorage: Boolean = false,
    val oldAppInstalled: Boolean = false,
    val onUninstallOldApp: () -> Unit = {},
    val onTimezoneAdd: (String) -> Unit = {},
    val onTimezoneRemove: (String) -> Unit = {},
    val onIcsDefault: (Int) -> Unit = {},
    val onApplyIcsToAll: () -> Unit = {},
    /** Reconvertit les tâches horaires en évènements ; rend le nombre de notes réécrites. */
    val onConvertMisfiled: suspend () -> Int = { 0 },
)

/** Un calendrier tel que la page « Calendriers » le montre. */
typealias CalendarEntry = com.ahmed.neocalendar.core.grid.CalendarModel

@Composable
internal fun SText(
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
 * Chaque réglage est écrit aussitôt dans le fichier partagé. Seule la ligne des coffres Obsidian reste inerte (sans effet sur téléphone, comme l'ancienne).
 */
@Composable
fun SettingsScreen(version: String, data: WorkspaceData, hiddenIds: Set<String>, actions: SettingsActions, onBack: () -> Unit) {
    val context = LocalContext.current
    var page by rememberSaveable { mutableStateOf("") }
    var choice by remember { mutableStateOf<String?>(null) }
    // Les deux questions de confirmation (« convert », « applyIcs ») et le résultat de la reconversion.
    var confirm by remember { mutableStateOf<String?>(null) }
    var converted by remember { mutableStateOf<Int?>(null) }
    val misfiled = remember(data.events) { misfiledEventsOf(data.events).size }
    val scope = rememberCoroutineScope()
    BackHandler(enabled = page.isNotEmpty()) { page = "" }

    Column(Modifier.fillMaxSize().background(Neo.Mantle)) {
        SettingsHeader(
            when (page) { "calendars" -> "Calendriers"; "folder" -> "Dossier de données"; "appearance" -> "Apparence"; "timezones" -> "Fuseaux horaires"; "vaults" -> "Coffres Obsidian"; else -> "Paramètres" },
            onBack = { if (page.isNotEmpty()) page = "" else onBack() },
        )
        // La page racine garde son défilement ; une sous-page s'ouvre toujours en haut (chaque `.nc-settings__page` a son propre défilement).
        val rootScroll = rememberScrollState()
        androidx.compose.animation.AnimatedContent(
            targetState = page,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            transitionSpec = {
                if (targetState.isNotEmpty()) {
                    // `nc-android-settings-page-in` : 220 ms, la page arrive de toute la largeur en s'opacifiant.
                    (slideInHorizontally(tween(220, easing = SETTINGS_PAGE_IN)) { it } + fadeIn(tween(220, easing = SETTINGS_PAGE_IN)))
                        .togetherWith(androidx.compose.animation.ExitTransition.None)
                        .apply { targetContentZIndex = 1f }
                } else {
                    // Le retour joue la même animation à l'envers : la sous-page repart vers la droite, la racine est dessous.
                    androidx.compose.animation.EnterTransition.None
                        .togetherWith(slideOutHorizontally(tween(220, easing = SETTINGS_PAGE_OUT)) { it } + fadeOut(tween(220, easing = SETTINGS_PAGE_OUT)))
                        .apply { targetContentZIndex = -1f }
                }
            },
            label = "settings-page",
        ) { shown ->
            val scroll = if (shown.isEmpty()) rootScroll else rememberScrollState()
            Column(
                Modifier.fillMaxSize().background(Neo.Mantle).verticalScroll(scroll).padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 26.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                when (shown) {
                    "calendars" -> CalendarsPage(data, hiddenIds, actions, { choice = it }, { confirm = "applyIcs" })
                    "timezones" -> TimezonesPage(data, actions)
                    "folder" -> FolderPage(actions)
                    "vaults" -> VaultsPage()
                    "appearance" -> AppearancePage { choice = "theme" }
                    else -> RootPage(data, actions, version, misfiled, converted, { page = it }, { choice = it }, { converted = null; confirm = "convert" })
                }
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
        "theme" -> pick(
            THEMES.map { Option(it.id, it.label, iconContent = { ThemePreview(it) }) }, NeoAppearance.themeId, "Thèmes",
        ) { NeoAppearance.setTheme(context, it) }
        "mode" -> pick(MODES, NeoAppearance.preferences.mode.key, "Mode de couleur") { NeoAppearance.setMode(context, AppearanceMode.of(it)) }
        "language" -> pick(LANGUAGE_OPTIONS, AppLanguage.code, "Langue") {
            NeoAppearance.setLanguage(context, it)
            (context as? android.app.Activity)?.recreate()
        }
        "icsDefault" -> pick(
            ICS_REFRESH_MINUTES.map { Option(it.toString(), icsFrequencyLabel(it)) }, data.icsDefaultMinutes.toString(), "Fréquence d'actualisation ICS par défaut",
        ) { actions.onIcsDefault(it.toInt()) }
        "sync" -> SyncDialog(actions.folderName, actions.integratedStorage, onPickFolder = { choice = null; actions.onPickFolder() }, onDismiss = { choice = null })
    }
    when (confirm) {
        "convert" -> ConfirmPanel(
            "Reconvertir les tâches horaires en événements",
            "$misfiled entrées ont une heure de début et une heure de fin, ce qui est la forme d'un événement et non d'une tâche. Elles perdront leur case à cocher. Les tâches sur toute la journée et celles déjà terminées ne sont pas touchées.",
            "Convertir", danger = false, onDismiss = { confirm = null },
        ) {
            confirm = null
            scope.launch { converted = actions.onConvertMisfiled() }
        }
        "applyIcs" -> ConfirmPanel(
            "Appliquer à tous les liens",
            "Appliquer cette fréquence à tous les liens ICS de tous les calendriers ? Cette action règle la fréquence de tous les liens sur cette valeur et retire leurs remplacements individuels.",
            "Appliquer à tous les liens", danger = false, onDismiss = { confirm = null },
        ) {
            confirm = null
            actions.onApplyIcsToAll()
        }
    }
}

/** `cubic-bezier(.2,.85,.25,1)` à l'arrivée d'une page, `cubic-bezier(.3,0,.6,1)` au retour (`App.css`, `nc-settings-page-in`). */
private val SETTINGS_PAGE_IN = androidx.compose.animation.core.CubicBezierEasing(0.2f, 0.85f, 0.25f, 1f)
private val SETTINGS_PAGE_OUT = androidx.compose.animation.core.CubicBezierEasing(0.3f, 0f, 0.6f, 1f)

private fun icsFrequencyLabel(minutes: Int) = if (minutes < 60) "$minutes min" else "${minutes / 60} h"

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
private fun RootPage(
    data: WorkspaceData, actions: SettingsActions, version: String, misfiled: Int, converted: Int?,
    openPage: (String) -> Unit, openChoice: (String) -> Unit, openConvert: () -> Unit,
) {
    val context = LocalContext.current
    val monthNote = "Sans « Créer un événement en cliquant un jour du mois », un clic dans le mois ouvre la vue du jour."
    Group("Vue du calendrier", note = if (converted != null) "$converted entrées reconverties en événements.\n$monthNote" else monthNote) {
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
        // Offerte seulement s'il y a quelque chose à réparer : une ligne qui dit « 0 » invite à l'appuyer pour rien.
        if (misfiled > 0) row(NeoIcons.Check, "Reconvertir les tâches horaires en événements", misfiled.toString(), onClick = openConvert)
    }
    Group("Apparence") {
        row(NeoIcons.Palette, "Thème", NeoAppearance.theme.label) { openPage("appearance") }
        row(NeoIcons.Moon, "Mode de couleur", MODES.label(NeoAppearance.preferences.mode.key)) { openChoice("mode") }
        row(NeoIcons.Languages, "Langue", LANGUAGE_OPTIONS.label(AppLanguage.code)) { openChoice("language") }
    }
    Group("Intégrations") {
        row(NeoIcons.CalendarDays, "Calendriers", data.calendars.size.toString()) { openPage("calendars") }
        row(NeoIcons.Globe, "Fuseaux horaires", if (data.secondaryTimezones.isEmpty()) "Aucun" else data.secondaryTimezones.size.toString()) { openPage("timezones") }
    }
    Group("Données") {
        row(NeoIcons.FolderOpen, "Dossier de données", actions.folderName) { openPage("folder") }
        // Coffres Obsidian : la page de l'ancienne s'ouvre, mais ajouter un dossier est sans effet sur téléphone.
        row(NeoIcons.Library, "Coffres Obsidian", "Aucun dossier") { openPage("vaults") }
        row(NeoIcons.RefreshCw, "Synchronisation", null) { openChoice("sync") }
    }
    // Seule l'ancienne version (autre paquet) y figure, et seulement tant qu'elle est installée.
    if (actions.oldAppInstalled) Group("Application") {
        row(NeoIcons.Trash2, "Ancienne version encore installée", "Désinstaller", chevron = false, onClick = actions.onUninstallOldApp)
    }
    SText(version, Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 8.dp), color = Neo.TextFaint, size = 12f, align = TextAlign.Center)
}

@Composable
private fun VaultsPage() {
    Group(null, note = "Ajoutez le dossier qui contient vos coffres Obsidian. Ceux qui s'y trouvent directement et possèdent un dossier .obsidian sont détectés.") {
        row(null, "Ajouter un dossier", null, chevron = false, onClick = null)
    }
}

private fun List<Option>.label(value: String) = firstOrNull { it.value == value }?.label.orEmpty()

@Composable
private fun CalendarsPage(data: WorkspaceData, hiddenIds: Set<String>, actions: SettingsActions, openChoice: (String) -> Unit, openApply: () -> Unit) {
    Group(null, note = "Chaque sous-dossier direct du dossier de données est un calendrier. Il peut être une note complète, un abonnement ICS, ou détecté automatiquement.") {
        row(NeoIcons.Plus, "Ajouter un calendrier", null, onClick = actions.onAddCalendar)
    }
    if (data.calendars.isNotEmpty()) {
        Group("Calendriers") {
            for (calendar in data.calendars) {
                custom { shape ->
                    CalendarItemRow(shape, calendar, calendar.id in hiddenIds, calendar.relativePath == data.defaultCalendarPath, actions)
                }
            }
        }
    }
    Group("Liens ICS", note = "Cette action règle la fréquence de tous les liens sur cette valeur et retire leurs remplacements individuels.") {
        row(NeoIcons.RefreshCw, "Fréquence d'actualisation ICS par défaut", icsFrequencyLabel(data.icsDefaultMinutes)) { openChoice("icsDefault") }
        if (data.icsLinks.isNotEmpty()) row(NeoIcons.RefreshCw, "Appliquer à tous les liens", null, chevron = false, onClick = openApply)
    }
}

/**
 * Une ligne de la page Calendriers (`.nc-settings__calendar-item`) : le type (note complète ou automatique), la coche d'affichage,
 * la couleur, le nom (un appui en fait le calendrier par défaut, un double appui le renomme), « Par défaut » et la corbeille.
 * Le rappel du calendrier se règle, comme dans l'ancienne, par le menu de sa ligne dans le tiroir.
 */
@Composable
private fun CalendarItemRow(shape: Shape, calendar: CalendarEntry, hidden: Boolean, isDefault: Boolean, actions: SettingsActions) {
    // Un calendrier de chemin vide est le dossier de notes lui-même : ni renommé ni retiré.
    val isFolder = calendar.relativePath.isNotEmpty()
    var swatchBounds by remember { mutableStateOf(androidx.compose.ui.geometry.Rect.Zero) }
    Row(
        Modifier.fillMaxWidth().background(Neo.SettingRow, shape).border(1.dp, Neo.Border, shape).padding(horizontal = 16.dp, vertical = 10.8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(if (calendar.editable) NeoIcons.FileText else NeoIcons.Flag, null, tint = Neo.SettingsValue, modifier = Modifier.size(15.dp))
        // La coche : 28 x 20, pleine à l'accent quand le calendrier est affiché.
        Box(
            Modifier.size(28.dp, 20.dp).clip(CircleShape).background(if (hidden) Neo.BorderStrong else Neo.Accent)
                .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) { actions.onToggleCalendar(calendar) },
            contentAlignment = Alignment.Center,
        ) { if (!hidden) Icon(NeoIcons.Check, if (hidden) "Afficher ${calendar.name}" else "Masquer ${calendar.name}", tint = Neo.OnAccent, modifier = Modifier.size(14.dp)) }
        Box(
            Modifier.size(18.dp).onGloballyPositioned { swatchBounds = it.boundsInWindow() }.clip(RoundedCornerShape(5.dp))
                .background(parseCalendarColor(calendar.color))
                .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) { actions.onCalendarColor(calendar, swatchBounds) },
        )
        SText(
            calendar.name,
            Modifier.weight(1f).combinedClickable(
                indication = null, interactionSource = remember { MutableInteractionSource() },
                onClick = { if (calendar.editable) actions.onSetDefaultCalendar(calendar) },
                onDoubleClick = { if (isFolder && calendar.editable) actions.onRenameCalendar(calendar) },
                // Sur un écran tactile le double appui est malaisé : l'appui long renomme aussi.
                onLongClick = { if (isFolder && calendar.editable) actions.onRenameCalendar(calendar) },
            ).padding(vertical = 5.dp),
            size = 16f, weight = 600, maxLines = 1,
        )
        if (isDefault) SText("Par défaut", color = Neo.TextFaint, size = 11f, maxLines = 1)
        if (isFolder) {
            Box(
                Modifier.size(32.dp).border(1.dp, Neo.Border, RoundedCornerShape(8.dp)).pressFill(RoundedCornerShape(8.dp), Neo.Hover) { actions.onDeleteCalendar(calendar) },
                contentAlignment = Alignment.Center,
            ) { Icon(NeoIcons.Trash2, "Supprimer ${calendar.name}", tint = Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
        }
    }
}

/**
 * Les fuseaux horaires (`renderTimezones`) : un champ et son « + » (Entrée aussi), la liste des fuseaux ajoutés avec leur croix.
 * Un nom inconnu n'est pas ajouté (l'ancienne l'écrivait tel quel et en tirait une colonne illisible) et le dit.
 */
@Composable
private fun TimezonesPage(data: WorkspaceData, actions: SettingsActions) {
    var text by remember { mutableStateOf("") }
    var unknown by remember { mutableStateOf(false) }
    fun add() {
        if (timezoneAdded(data.secondaryTimezones, text) != null) {
            actions.onTimezoneAdd(text)
            text = ""
            unknown = false
        } else {
            unknown = text.isNotBlank() && canonicalZoneId(text) == null
        }
    }
    Group(null, note = "Une colonne d'heures supplémentaire apparaît dans les vues semaine, jour et trois jours.") {
        custom { shape -> ZoneFieldRow(shape, text, { text = it; unknown = false }, ::add) }
    }
    if (unknown) SText("Ce fuseau est inconnu. Écrivez un nom comme Europe/Paris ou America/New_York.", Modifier.padding(horizontal = 4.dp), color = Neo.Danger, size = 13f, lineHeight = 18.85f)
    if (data.secondaryTimezones.isNotEmpty()) {
        Group("Fuseaux ajoutés") {
            for (zone in data.secondaryTimezones) custom { shape -> ZoneRow(shape, zone) { actions.onTimezoneRemove(zone) } }
        }
    }
}

/** `.nc-set-row--field` : le champ prend la largeur (38 dp, rayon 10, fond du champ à 70 %), le bouton « + » de 38 dp le ferme. */
@Composable
private fun ZoneFieldRow(shape: Shape, value: String, onChange: (String) -> Unit, onAdd: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val inputShape = RoundedCornerShape(10.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).background(Neo.SettingRow, shape).padding(start = 16.dp, end = 14.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .weight(1f)
                .height(38.dp)
                .background(Neo.FieldFill.copy(alpha = 0.7f), inputShape)
                .border(1.dp, if (focused) Neo.Accent else Neo.Border.copy(alpha = Neo.Border.alpha * 0.8f), inputShape)
                .padding(horizontal = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isEmpty()) SText("ex. America/New_York", color = Neo.TextFaint, maxLines = 1)
            BasicTextField(
                value = value, onValueChange = onChange, singleLine = true,
                textStyle = TextStyle(color = Neo.Text, fontSize = 15.sp, fontFamily = NeoFonts.inter),
                cursorBrush = SolidColor(Neo.Accent),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onAdd() }),
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }
                    .semantics { contentDescription = "Fuseau horaire à ajouter" },
            )
        }
        Box(
            Modifier.size(38.dp).pressFill(RoundedCornerShape(10.dp), Neo.Hover, onClick = onAdd).semantics { contentDescription = "Ajouter un fuseau horaire"; role = Role.Button },
            contentAlignment = Alignment.Center,
        ) { Icon(NeoIcons.Plus, null, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp)) }
    }
}

/** Une ligne de la liste : le nom du fuseau (retrait de la colonne d'icône vide : 16 + 12) et la croix de 38 dp. */
@Composable
private fun ZoneRow(shape: Shape, zone: String, onRemove: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).background(Neo.SettingRow, shape).padding(start = 28.dp, end = 14.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SText(zone, Modifier.weight(1f), lineHeight = 19.5f)
        Box(
            Modifier.size(38.dp).pressFill(RoundedCornerShape(10.dp), Neo.Hover, onClick = onRemove).semantics { contentDescription = "Retirer $zone"; role = Role.Button },
            contentAlignment = Alignment.Center,
        ) { Icon(NeoIcons.Close, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
    }
}

@Composable
private fun FolderPage(actions: SettingsActions) {
    if (actions.integratedStorage) {
        Group(null, note = "Vos notes sont dans le stockage privé de Neo Calendar, que les autres applications ne peuvent pas lire.\nElles se synchronisent avec la synchronisation intégrée (Réglages, Synchronisation).") {
            text(actions.folderName)
        }
        return
    }
    Group(null, note = "Neo Calendar range ses fichiers de calendrier dans ce dossier. Chaque sous-dossier direct est un calendrier.") {
        text(actions.folderName)
        row(NeoIcons.FolderOpen, "Changer de dossier", null, chevron = false, onClick = actions.onPickFolder)
    }
}

/** Ce qu'un groupe contient : le groupe en dessine les lignes, chacune avec son rayon (14 en haut du premier, 14 en bas du dernier, 4 ailleurs). */
internal class GroupBuilder {
    val rows = mutableListOf<@Composable (Shape) -> Unit>()

    /** Une ligne ; sans `onClick` elle est inerte (ni fond d'appui, ni chevron). Un `dot` fait la ligne d'un calendrier. */
    fun row(
        icon: ImageVector?, label: String, value: String?, dot: Color? = null, chevron: Boolean = true,
        iconContent: (@Composable () -> Unit)? = null, iconWidth: Int = 22, valueSize: Float = 15f, disabled: Boolean = false, onClick: (() -> Unit)?,
    ) {
        rows += { shape ->
            val base = Modifier.fillMaxWidth().heightIn(min = 52.dp).background(Neo.SettingRow, shape)
            Row(
                (if (onClick != null && !disabled) base.pressFill(shape, Neo.Hover, onClick = onClick) else base.clip(shape))
                    .let { if (disabled) it.alpha(0.5f) else it }
                    .padding(start = 16.dp, end = 14.dp, top = 9.dp, bottom = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (iconContent != null) Box(Modifier.width(iconWidth.dp), contentAlignment = Alignment.Center) { iconContent() }
                else if (icon != null) Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                    Icon(icon, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp))
                } else if (dot == null) Spacer(Modifier.width(0.dp)) // la colonne d'icône est vide mais garde son espacement (grille de l'ancienne)
                if (dot != null) {
                    Box(Modifier.size(14.dp).clip(CircleShape).background(dot))
                    Column(Modifier.weight(1f)) {
                        SText(label, lineHeight = 19.5f, maxLines = 1)
                        if (value != null) SText(value, color = Neo.TextFaint, size = 12f, maxLines = 1)
                    }
                } else {
                    SText(label, Modifier.weight(1f), lineHeight = 19.5f)
                    // La grille de l'ancienne a quatre colonnes (`auto 1fr auto auto`, gap 12) : une colonne vide garde son espacement.
                    if (!value.isNullOrEmpty()) SText(value, Modifier.widthIn(max = 200.dp), color = Neo.SettingsValue, size = valueSize, maxLines = 1, align = TextAlign.End)
                    else Spacer(Modifier.width(0.dp))
                }
                // Le chevron de l'ancienne (`navigates`) : toutes les lignes qui mènent quelque part, y compris celles qui ne mènent encore à rien.
                if (chevron) {
                    Icon(NeoIcons.ChevronRight, null, tint = Neo.SettingsNote, modifier = Modifier.size(18.dp))
                } else if (dot == null) Spacer(Modifier.width(0.dp))
            }
        }
    }

    /** Une ligne dont le contenu est dessiné par l'appelant (curseur, champ de texte) : il reçoit la forme de la ligne. */
    fun custom(content: @Composable (Shape) -> Unit) {
        rows += content
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
                Spacer(Modifier.width(0.dp))
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
internal fun Group(title: String?, note: String? = null, content: GroupBuilder.() -> Unit) {
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
        // Une ligne par paragraphe : chacune se traduit à part.
        if (note != null) for (line in note.lines()) SText(line, Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp), color = Neo.SettingsNote, size = 13f, lineHeight = 18.85f)
    }
}

private val SwitchEasing = CubicBezierEasing(0.2f, 0.85f, 0.25f, 1f)

/** `.nc-set-switch` : piste 44 x 26, bouton 20 posé à 3, décalé de 18 une fois activé ; 160 ms. */
@Composable
internal fun SettingsSwitch(checked: Boolean) {
    val knobX by animateDpAsState(if (checked) 21.dp else 3.dp, tween(160, easing = SwitchEasing), label = "switch-knob")
    val track by animateColorAsState(if (checked) Neo.Accent else Color(0x32C6D0F5), tween(160), label = "switch-track")
    val knob by animateColorAsState(if (checked) Color.White else Neo.Text, tween(160), label = "switch-knob-color")
    Box(Modifier.size(width = 44.dp, height = 26.dp).clip(CircleShape).background(track)) {
        Box(Modifier.offset(x = knobX, y = 3.dp).size(20.dp).clip(CircleShape).background(knob))
    }
}

/** `nc-choice-dialog` : la carte de 300 dp, un titre, des options de 40 dp ; la choisie en accent avec sa coche de 16. */
@Composable
internal fun ChoiceDialog(title: String, options: List<Option>, selected: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    ChoiceCard(title, onDismiss) {
        for (option in options) {
            val on = option.value == selected
            val shape = RoundedCornerShape(6.dp)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).pressFill(shape, Neo.Hover) { onPick(option.value) }.padding(horizontal = 10.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (option.iconContent != null) Box(Modifier.width(24.dp), contentAlignment = Alignment.Center) { option.iconContent.invoke() }
                else if (option.icon != null) Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                    Icon(option.icon, null, tint = if (on) Neo.Accent else Neo.TextSecondary, modifier = Modifier.size(19.dp))
                }
                // Sans icône le libellé garde sa place (la colonne d'icône vide et son interstice de 10), comme la grille de l'ancienne.
                SText(option.label, Modifier.weight(1f).padding(start = if (option.icon == null && option.iconContent == null) 10.dp else 0.dp), color = if (on) Neo.Accent else Neo.Text, size = 14f, maxLines = 1)
                if (on) Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** La Synchronisation : un dialogue de texte (dossier, note, trois méthodes) ; `.nc-choice-dialog .nc-set-row` : 52 dp, 16 sp, valeur sous le nom. */
@Composable
private fun SyncDialog(folderName: String, integratedStorage: Boolean, onPickFolder: () -> Unit, onDismiss: () -> Unit) {
    ChoiceCard("Synchronisation", onDismiss) {
        val shape = RoundedCornerShape(12.dp)
        // En stockage privé il n'y a pas de dossier à choisir : la ligne n'est pas proposée.
        if (!integratedStorage) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 52.dp).pressFill(shape, Neo.Hover, onClick = onPickFolder).padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { Icon(NeoIcons.FolderOpen, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp)) }
                Column(Modifier.weight(1f)) {
                    SText("Dossier de données", size = 16f, lineHeight = 22.4f)
                    SText(folderName, color = Neo.TextSecondary, size = 16f, lineHeight = 22.4f, maxLines = 1)
                }
                Icon(NeoIcons.ChevronRight, null, tint = Neo.SettingsNote, modifier = Modifier.size(18.dp))
            }
        }
        SText(
            "Neo Calendar range ses données dans le dossier que vous choisissez. La synchronisation est assurée par l'outil que vous retenez.",
            Modifier.padding(horizontal = 16.dp, vertical = 8.dp), color = Neo.SettingsNote, size = 13f, lineHeight = 18.85f,
        )
        SText("Méthodes possibles", Modifier.padding(start = 16.dp, top = 6.dp, bottom = 4.dp), color = Neo.SettingsValue, size = 13f, weight = 500)
        for ((name, how) in listOf("Syncthing" to "Recommandé", "Stockage en ligne" to "OneDrive, Google Drive, Dropbox", "Transfert manuel" to "Par USB")) {
            Column(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 32.dp, end = 16.dp, top = 8.dp, bottom = 8.dp), verticalArrangement = Arrangement.Center) {
                SText(name, size = 16f, lineHeight = 22.4f)
                SText(how, color = Neo.TextSecondary, size = 16f, lineHeight = 22.4f)
            }
        }
    }
}
