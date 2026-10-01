package com.ahmed.neocalendar.nativeapp.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.produceState
import androidx.compose.ui.input.pointer.pointerInput
import com.ahmed.neocalendar.core.lists.calendarPanelEvents
import com.ahmed.neocalendar.core.lists.displayEventOfNote
import com.ahmed.neocalendar.core.lists.searchCorpus
import com.ahmed.neocalendar.core.tasks.TaskItem
import com.ahmed.neocalendar.core.tasks.buildDesktopTaskGroups
import com.ahmed.neocalendar.core.tasks.collectTasks
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.BuildConfig
import com.ahmed.neocalendar.core.layout.getISOWeek
import com.ahmed.neocalendar.core.layout.todayBadgeState
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.nativeapp.NativeViewModel
import com.ahmed.neocalendar.nativeapp.ScreenState
import com.ahmed.neocalendar.nativeapp.WRITE_IGNORED
import com.ahmed.neocalendar.nativeapp.WorkspaceData
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.TextStyle
import com.ahmed.neocalendar.nativeapp.AppLocale

/** Un écran plein écran posé sur la grille et le tiroir : liste d'un calendrier, tâches, recherche. */
private sealed interface Overlay {
    data class Calendar(val id: String) : Overlay
    data class Tasks(val complete: Boolean) : Overlay
    data object Search : Overlay
    data object Settings : Overlay
}

private fun Overlay?.encode(): String = when (this) {
    null -> ""
    is Overlay.Calendar -> "cal:$id"
    is Overlay.Tasks -> if (complete) "tasks:complete" else "tasks:todo"
    Overlay.Search -> "search"
    Overlay.Settings -> "settings"
}

private fun decodeOverlay(key: String): Overlay? = when {
    key.startsWith("cal:") -> Overlay.Calendar(key.removePrefix("cal:"))
    key == "tasks:todo" -> Overlay.Tasks(false)
    key == "tasks:complete" -> Overlay.Tasks(true)
    key == "search" -> Overlay.Search
    key == "settings" -> Overlay.Settings
    else -> null
}

/** Un dialogue sur un calendrier (ou sur le rappel général), ouvert depuis le tiroir ou les Réglages. */
private sealed interface CalendarDialog {
    data object Add : CalendarDialog
    data object AppReminder : CalendarDialog
    data class Color(val calendar: com.ahmed.neocalendar.core.grid.CalendarModel) : CalendarDialog
    data class Rename(val calendar: com.ahmed.neocalendar.core.grid.CalendarModel) : CalendarDialog
    data class Reminder(val calendar: com.ahmed.neocalendar.core.grid.CalendarModel) : CalendarDialog
    data class Delete(val calendar: com.ahmed.neocalendar.core.grid.CalendarModel) : CalendarDialog
    data class IcsLinks(val calendar: com.ahmed.neocalendar.core.grid.CalendarModel) : CalendarDialog
}

/** Le sélecteur de dossier : la même demande que `pickDirectory` de la WebView (lecture, écriture, permission durable). */
private class PickTree : androidx.activity.result.contract.ActivityResultContract<Unit, android.content.Intent?>() {
    override fun createIntent(context: android.content.Context, input: Unit) =
        android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
            android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                android.content.Intent.FLAG_GRANT_PREFIX_URI_PERMISSION,
        )

    override fun parseResult(resultCode: Int, intent: android.content.Intent?) =
        if (resultCode == android.app.Activity.RESULT_OK) intent else null
}

/** L'écran de l'application : l'état du dossier, puis la grille quand il est lu. */
@Composable
fun NativeApp(viewModel: NativeViewModel) {
    NeoTheme {
        val screen by viewModel.screen.collectAsState()
        Box(Modifier.fillMaxSize().background(Neo.Background)) {
            when (val s = screen) {
                ScreenState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Neo.Accent)
                }
                is ScreenState.Failed -> FailedScreen(s.message) { viewModel.reload(force = true) }
                is ScreenState.Ready -> MainScreen(viewModel, s.data)
            }
        }
    }
}

@Composable
private fun FailedScreen(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        Text(message, color = Neo.Text, fontSize = 15.sp, textAlign = TextAlign.Center)
        Box(
            Modifier
                .padding(top = 24.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Neo.Accent)
                .clickable(onClick = onRetry)
                .padding(horizontal = 24.dp, vertical = 14.dp),
        ) { Text("Réessayer", color = Neo.Background, fontSize = 14.sp) }
    }
}

@Composable
private fun MainScreen(viewModel: NativeViewModel, data: WorkspaceData) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val zone = remember { ZoneId.systemDefault() }
    val grid = androidx.compose.runtime.saveable.rememberSaveable(saver = GridState.Saver) {
        GridState(LocalDate.now().toEpochDay())
    }
    val drawer = remember { DrawerState() }
    val dayCount by viewModel.dayCount.collectAsState()
    val occurrences by viewModel.occurrences.collectAsState()
    val allDayCollapsed by viewModel.allDayCollapsed.collectAsState()
    val hidden by viewModel.hidden.collectAsState()
    val reloadError by viewModel.reloadError.collectAsState()
    val icsUi by viewModel.icsUi.collectAsState()
    var monthOpen by rememberSaveable { mutableStateOf(false) }
    var calendarDialog by remember { mutableStateOf<CalendarDialog?>(null) }
    val pickTree = androidx.activity.compose.rememberLauncherForActivityResult(PickTree()) { result ->
        if (result != null) viewModel.onTreePicked(result)
    }
    LaunchedEffect(Unit) { viewModel.notices.collect { Toast.makeText(context, it, Toast.LENGTH_LONG).show() } }
    // Une écriture qui échoue le dit ; une écriture ignorée (une autre était en cours) ne dit rien.
    val report = { error: String? -> if (error != null && error != WRITE_IGNORED) Toast.makeText(context, error, Toast.LENGTH_LONG).show() }
    var sheet by remember { mutableStateOf<SheetTarget?>(null) }
    var overlayKey by rememberSaveable { mutableStateOf("") }
    val overlay = remember(overlayKey) { decodeOverlay(overlayKey) }
    val calendarsById = remember(data) { data.calendars.associateBy { it.id } }
    val notesById = remember(data) { data.events.associateBy { it.id } }
    // Les tâches se lisent dans les notes brutes (une tâche en retard est hors de la fenêtre de la grille) ; masquer un calendrier les masque aussi.
    val taskGroups = remember(data, hidden) { buildDesktopTaskGroups(collectTasks(data.events, calendarsById, hidden)) }
    val openTask = { task: TaskItem ->
        val note = notesById[task.id]
        if (note != null) sheet = SheetTarget.Existing(note, note.id)
    }
    // Un appui sur un bloc ou une carte : la note qu'il montre (la série, pour un jour d'une série).
    val openEvent = { event: DisplayEvent ->
        val note = resolveStored(notesById, event.id)
        if (note != null) sheet = SheetTarget.Existing(note, event.id)
    }

    // Les gestes de la grille qui écrivent : un brouillon sur un créneau vide, un déplacement, un redimensionnement, une case cochée.
    val noteGone = "Cette note n'existe plus. Rechargez et recommencez."
    val gridActions = remember(notesById, data) {
        GridActions(
            onOpen = openEvent,
            onCreate = { start, end ->
                if (data.calendars.none { it.editable }) {
                    Toast.makeText(context, "Créez d'abord un dossier de calendrier avant d'ajouter des évènements.", Toast.LENGTH_LONG).show()
                } else {
                    sheet = SheetTarget.Draft(start, end, allDay = false)
                }
            },
            onCreateAllDay = { date ->
                if (data.calendars.none { it.editable }) {
                    Toast.makeText(context, "Créez d'abord un dossier de calendrier avant d'ajouter des évènements.", Toast.LENGTH_LONG).show()
                } else {
                    sheet = SheetTarget.Draft(date.atStartOfDay(), date.plusDays(1).atStartOfDay(), allDay = true)
                }
            },
            onReschedule = { event, start, end, resize, onFailed ->
                val note = resolveStored(notesById, event.id)
                if (note == null) {
                    onFailed()
                    Toast.makeText(context, noteGone, Toast.LENGTH_LONG).show()
                } else {
                    scope.launch {
                        viewModel.rescheduleEvent(note, event.id, start, end, resize)?.let {
                            onFailed()
                            if (it != WRITE_IGNORED) Toast.makeText(context, it, Toast.LENGTH_LONG).show()
                        }
                    }
                }
            },
            onToggleTask = { event ->
                val note = resolveStored(notesById, event.id)
                if (note == null) {
                    Toast.makeText(context, noteGone, Toast.LENGTH_LONG).show()
                } else {
                    scope.launch {
                        viewModel.setTaskDone(note, event.id, event.taskStatus != "complete")?.let {
                            if (it != WRITE_IGNORED) Toast.makeText(context, it, Toast.LENGTH_LONG).show()
                        }
                    }
                }
            },
        )
    }

    // Ce que la barre du haut dit de la grille : le jour le plus proche de la tête, recalculé seulement quand il change.
    val nearest by remember { derivedStateOf { grid.nearestDayEpoch } }
    val firstDay by remember { derivedStateOf { grid.firstDayEpoch } }
    val anchor = LocalDate.ofEpochDay(nearest)
    val today = LocalDate.now()

    LaunchedEffect(firstDay, dayCount, data) { viewModel.ensureWindow(firstDay - 1, firstDay + dayCount + 2) }

    BackHandler(enabled = drawer.isOpen || monthOpen) {
        if (drawer.isOpen) drawer.close(scope) else monthOpen = false
    }
    // Déclaré après : le plus récent passe en premier, la liste se ferme avant le tiroir qu'elle recouvre.
    BackHandler(enabled = overlay != null) { overlayKey = "" }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            val visible = remember(nearest, dayCount) {
                (0 until dayCount).map { LocalDate.ofEpochDay(nearest + it).atStartOfDay(zone).toInstant() }
            }
            TopBar(
                monthName = anchor.month.getDisplayName(TextStyle.FULL_STANDALONE, AppLocale.current)
                    .replaceFirstChar { it.titlecase(AppLocale.current) },
                weekNumber = getISOWeek(anchor.atStartOfDay(zone).toInstant(), zone),
                monthOpen = monthOpen,
                todayNumber = today.dayOfMonth,
                badge = todayBadgeState(visible, java.time.Instant.now(), zone),
                onMenu = { drawer.open(scope) },
                onMonth = { monthOpen = !monthOpen },
                onSearch = { monthOpen = false; overlayKey = Overlay.Search.encode() },
                onToday = { grid.goTo(scope, LocalDate.now()) },
            )
            Box(Modifier.weight(1f).fillMaxWidth()) {
                TimeGridArea(
                    state = grid,
                    dayCount = dayCount,
                    freeScroll = data.freeScroll,
                    timeFormat24h = data.timeFormat24h,
                    occurrences = occurrences,
                    allDayCollapsed = allDayCollapsed,
                    onToggleAllDayCollapsed = { viewModel.setAllDayCollapsed(!allDayCollapsed) },
                    actions = gridActions,
                    dataVersion = data,
                )
                reloadError?.let {
                    Text(
                        it,
                        color = Neo.Text,
                        fontSize = 12.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Neo.Today.copy(alpha = 0.85f))
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(16.dp)
                        .shadow(8.dp, RoundedCornerShape(18.dp))
                        .size(56.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(Neo.Accent)
                        .clickable {
                            if (data.calendars.none { it.editable }) {
                                Toast.makeText(context, "Créez d'abord un dossier de calendrier avant d'ajouter des évènements.", Toast.LENGTH_LONG).show()
                            } else {
                                sheet = newDraft()
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) { Icon(NeoIcons.Plus, "Nouvel évènement", tint = Neo.Background, modifier = Modifier.size(26.dp)) }
            }
        }

        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            Box(Modifier.padding(top = Neo.TopBarHeight)) {
                MonthSheet(
                    visible = monthOpen,
                    anchor = anchor,
                    firstDay = data.firstDay,
                    onSelect = { date ->
                        grid.goTo(scope, date)
                        monthOpen = false
                    },
                    onDismiss = { monthOpen = false },
                )
            }
        }

        NeoDrawer(
            drawer,
            scope,
            edgeTopPadding = WindowInsets.safeDrawing.asPaddingValues().calculateTopPadding() + Neo.TopBarHeight,
        ) {
            DrawerContent(
                version = BuildConfig.VERSION_NAME,
                dayCount = dayCount,
                onDayCount = viewModel::setDayCount,
                anchor = anchor,
                firstDay = data.firstDay,
                onSelectDate = { date ->
                    grid.goTo(scope, date)
                    drawer.close(scope)
                },
                calendars = data.calendars,
                hiddenIds = hidden,
                defaultCalendarPath = data.defaultCalendarPath,
                onToggleCalendar = viewModel::toggleCalendar,
                onOpenCalendar = { overlayKey = Overlay.Calendar(it.id).encode() },
                todoCount = taskGroups.todo.size,
                completeCount = taskGroups.complete.size,
                onOpenTasks = { overlayKey = Overlay.Tasks(it).encode() },
                actions = DrawerActions(
                    onSettings = { overlayKey = Overlay.Settings.encode() },
                    onAddCalendar = { calendarDialog = CalendarDialog.Add },
                    onSetDefault = { viewModel.setDefaultCalendar(it.relativePath) },
                    onColor = { calendarDialog = CalendarDialog.Color(it) },
                    onRename = { calendarDialog = CalendarDialog.Rename(it) },
                    onReminder = { calendarDialog = CalendarDialog.Reminder(it) },
                    onIcsLinks = { calendarDialog = CalendarDialog.IcsLinks(it) },
                    onDelete = { calendarDialog = CalendarDialog.Delete(it) },
                    onReorder = viewModel::setCalendarOrder,
                ),
            )
        }

        // Garde la dernière liste ouverte le temps de sa sortie : sans elle l'écran se viderait avant de glisser.
        val lastOverlay = remember { arrayOfNulls<Overlay>(1) }
        if (overlay != null) lastOverlay[0] = overlay
        AnimatedVisibility(
            visible = overlay != null,
            enter = slideInHorizontally(tween(260)) { it / 5 } + fadeIn(tween(260)),
            exit = slideOutHorizontally(tween(220)) { it / 5 } + fadeOut(tween(220)),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Neo.Background)
                    .pointerInput(Unit) { detectTapGestures { } }
                    .windowInsetsPadding(WindowInsets.safeDrawing),
            ) {
                when (val shown = overlay ?: lastOverlay[0]) {
                    is Overlay.Calendar -> {
                        val calendar = calendarsById[shown.id]
                        if (calendar == null) LaunchedEffect(shown, data) { overlayKey = "" }
                        else {
                            val events by produceState<List<DisplayEvent>?>(null, data, calendar) {
                                value = withContext(Dispatchers.Default) {
                                    calendarPanelEvents(data.events, calendar, zone, java.time.Instant.now())
                                }
                            }
                            CalendarEventsList(calendar, events, data.timeFormat24h, { overlayKey = "" }, openEvent)
                        }
                    }
                    is Overlay.Tasks -> TasksList(
                        complete = shown.complete,
                        tasks = if (shown.complete) taskGroups.complete else taskGroups.todo,
                        today = today,
                        onBack = { overlayKey = "" },
                        onTaskClick = openTask,
                    )
                    Overlay.Search -> {
                        val searching = overlay == Overlay.Search
                        val corpus by produceState<List<DisplayEvent>?>(null, data, searching) {
                            value = if (!searching) null
                            else withContext(Dispatchers.Default) {
                                searchCorpus(data.events, calendarsById, anchor, zone, java.time.Instant.now())
                            }
                        }
                        SearchScreen(corpus, data.timeFormat24h, { overlayKey = "" }, openEvent)
                    }
                    Overlay.Settings -> SettingsScreen(
                        version = BuildConfig.VERSION_NAME,
                        data = data,
                        actions = SettingsActions(
                            onSetting = viewModel::setPreference,
                            onAppReminder = { calendarDialog = CalendarDialog.AppReminder },
                            onCalendarReminder = { calendarDialog = CalendarDialog.Reminder(it) },
                            onAddCalendar = { calendarDialog = CalendarDialog.Add },
                            onPickFolder = { pickTree.launch(Unit) },
                            folderName = viewModel.treeName(),
                        ),
                        onBack = { overlayKey = "" },
                    )
                    null -> Unit
                }
            }
        }
    }

    when (val dialog = calendarDialog) {
        null -> Unit
        CalendarDialog.Add -> CalendarNameDialog(
            "Nouveau calendrier", "", "Créer", data.calendars.map { it.name }.toSet(),
            { name -> calendarDialog = null; scope.launch { report(viewModel.createCalendar(name)) } },
            { calendarDialog = null },
        )
        is CalendarDialog.Rename -> CalendarNameDialog(
            "Renommer le calendrier", dialog.calendar.name, "Renommer", data.calendars.map { it.name }.toSet() - dialog.calendar.name,
            { name -> calendarDialog = null; scope.launch { report(viewModel.renameCalendar(dialog.calendar.relativePath, name)) } },
            { calendarDialog = null },
        )
        is CalendarDialog.Color -> CalendarColorDialog(
            dialog.calendar.color,
            { hex -> calendarDialog = null; viewModel.setCalendarColor(dialog.calendar.relativePath, hex) },
            { calendarDialog = null },
        )
        is CalendarDialog.Delete -> ConfirmDeleteCalendarDialog(
            dialog.calendar.name,
            { calendarDialog = null; scope.launch { report(viewModel.deleteCalendar(dialog.calendar.relativePath)) } },
            { calendarDialog = null },
        )
        is CalendarDialog.Reminder -> ReminderDialog(
            "Rappel : ${dialog.calendar.name}",
            data.calendarReminderMinutes[dialog.calendar.relativePath],
            data.reminderMinutes,
            { viewModel.setCalendarReminder(dialog.calendar.relativePath, it) },
            { calendarDialog = null },
        )
        is CalendarDialog.IcsLinks -> IcsLinksDialog(
            dialog.calendar.name,
            data.icsLinks.filter { it.calendarPath == dialog.calendar.relativePath },
            icsUi,
            data.icsDefaultMinutes,
            { name, url -> viewModel.addIcsLink(dialog.calendar.relativePath, name, url) },
            viewModel::editIcsLink,
            viewModel::removeIcsLink,
            viewModel::refreshIcsLink,
            { calendarDialog = null },
        )
        CalendarDialog.AppReminder -> ReminderDialog(
            "Rappel",
            data.reminderMinutes,
            null,
            { viewModel.setReminders(it.orEmpty()) },
            { calendarDialog = null },
        )
    }

    sheet?.let { EventSheet(it, data, viewModel) { sheet = null } }
}

/** La note d'un évènement affiché : directement, ou la série dont c'est un jour (`<série>_<jour>`). */
private fun resolveStored(notesById: Map<String, com.ahmed.neocalendar.core.notes.StoredEvent>, displayId: String) =
    notesById[displayId]
        ?: com.ahmed.neocalendar.core.recurrence.parseOccurrenceId(displayId)
            ?.let { notesById[it.first] }
            // L'identifiant d'une note peut lui-même finir comme une date : seule une série a des jours.
            ?.takeIf { com.ahmed.neocalendar.core.recurrence.isSeries(it.event) }

/** Le bouton + : la prochaine demi-heure, trente minutes, dans le calendrier par défaut. */
private fun newDraft(): SheetTarget.Draft {
    val now = java.time.LocalDateTime.now().withSecond(0).withNano(0)
    val start = now.withMinute(0).plusMinutes(((now.minute + 29) / 30 * 30).toLong())
    return SheetTarget.Draft(start, start.plusMinutes(30), allDay = false)
}
