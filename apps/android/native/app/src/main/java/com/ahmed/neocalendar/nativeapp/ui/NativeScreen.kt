package com.ahmed.neocalendar.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.width
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
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
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
import com.ahmed.neocalendar.nativeapp.ui.theme.WallpaperLayer
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.BuildConfig
import com.ahmed.neocalendar.nativeapp.NativeUpdates
import com.ahmed.neocalendar.core.layout.getISOWeek
import com.ahmed.neocalendar.core.layout.todayBadgeState
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.nativeapp.NativeRoute
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
    data class Color(val calendar: com.ahmed.neocalendar.core.grid.CalendarModel, val anchor: androidx.compose.ui.geometry.Rect) : CalendarDialog
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
fun NativeApp(viewModel: NativeViewModel, updates: NativeUpdates) {
    NeoTheme {
        val screen by viewModel.screen.collectAsState()
        Box(Modifier.fillMaxSize().background(Neo.Background)) {
            WallpaperLayer(reloadKey = screen::class)
            when (val s = screen) {
                ScreenState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Neo.Accent)
                }
                is ScreenState.Failed -> {
                    val pick = androidx.activity.compose.rememberLauncherForActivityResult(PickTree()) { result ->
                        if (result != null) viewModel.onTreePicked(result)
                    }
                    FailedScreen(s.message, onPick = { pick.launch(Unit) }) { viewModel.reload(force = true) }
                }
                is ScreenState.Ready -> MainScreen(viewModel, s.data, updates)
            }
            NoticeHost()
        }
    }
}

@Composable
private fun FailedScreen(message: String, onPick: () -> Unit, onRetry: () -> Unit) {
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
        ) { Text("Réessayer", color = Neo.OnAccent, fontSize = 14.sp) }
        Box(
            Modifier
                .padding(top = 12.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Neo.Hover)
                .clickable(onClick = onPick)
                .padding(horizontal = 24.dp, vertical = 14.dp),
        ) { Text("Choisir le dossier de notes", color = Neo.Text, fontSize = 14.sp) }
    }
}

@Composable
private fun MainScreen(viewModel: NativeViewModel, data: WorkspaceData, updates: NativeUpdates) {
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
    val solo by viewModel.solo.collectAsState()
    val reloadError by viewModel.reloadError.collectAsState()
    val icsUi by viewModel.icsUi.collectAsState()
    var monthOpen by rememberSaveable { mutableStateOf(false) }
    var calendarDialog by remember { mutableStateOf<CalendarDialog?>(null) }
    val pickTree = androidx.activity.compose.rememberLauncherForActivityResult(PickTree()) { result ->
        if (result != null) viewModel.onTreePicked(result)
    }
    LaunchedEffect(reloadError) { reloadError?.let { Notices.fail(it) } }
    LaunchedEffect(Unit) { viewModel.notices.collect { Notices.show(it) } }
    // Une écriture qui échoue le dit ; une écriture ignorée (une autre était en cours) ne dit rien.
    val report = { error: String? -> if (error != null && error != WRITE_IGNORED) Notices.fail(error) }
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

    // Une notification, une ligne du widget ou son « + » : la fiche ou le brouillon, dès que le dossier est lu.
    val route by viewModel.route.collectAsState()
    LaunchedEffect(route, data) {
        when (val wanted = route) {
            null -> Unit
            is NativeRoute.Event -> {
                val note = resolveStored(notesById, wanted.id)
                if (note != null) sheet = SheetTarget.Existing(note, wanted.id)
                else Notices.show("Cette note n'existe plus.")
            }
            NativeRoute.NewEvent ->
                if (data.calendars.none { it.editable }) {
                    Notices.show("Créez d'abord un dossier de calendrier avant d'ajouter des événements.")
                } else {
                    sheet = newDraft()
                }
        }
        if (route != null) viewModel.routeHandled()
    }

    // Les gestes de la grille qui écrivent : un brouillon sur un créneau vide, un déplacement, un redimensionnement, une case cochée.
    val noteGone = "Cette note n'existe plus. Rechargez et recommencez."
    val gridActions = remember(notesById, data) {
        GridActions(
            onOpen = openEvent,
            onCreate = { start, end ->
                if (data.calendars.none { it.editable }) {
                    Notices.show("Créez d'abord un dossier de calendrier avant d'ajouter des événements.")
                } else {
                    sheet = SheetTarget.Draft(start, end, allDay = false)
                }
            },
            onCreateAllDay = { date ->
                if (data.calendars.none { it.editable }) {
                    Notices.show("Créez d'abord un dossier de calendrier avant d'ajouter des événements.")
                } else {
                    sheet = SheetTarget.Draft(date.atStartOfDay(), date.plusDays(1).atStartOfDay(), allDay = true)
                }
            },
            onReschedule = { event, start, end, resize, onFailed ->
                val note = resolveStored(notesById, event.id)
                if (note == null) {
                    onFailed()
                    Notices.show(noteGone)
                } else {
                    scope.launch {
                        viewModel.rescheduleEvent(note, event.id, start, end, resize)?.let {
                            onFailed()
                            if (it != WRITE_IGNORED) Notices.fail(it)
                        }
                    }
                }
            },
            onToggleTask = { event ->
                val note = resolveStored(notesById, event.id)
                if (note == null) {
                    Notices.show(noteGone)
                } else {
                    scope.launch {
                        viewModel.setTaskDone(note, event.id, event.taskStatus != "complete")?.let {
                            if (it != WRITE_IGNORED) Notices.fail(it)
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
        // Le bas n'est pas réservé : la grille défile sous la barre de navigation et garde son inset en marge basse, comme l'ancienne.
        val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        // La recherche cache le calendrier (il s'efface sous elle, `nc-android-search-in`) : il ne reste que le fond d'écran sous sa surface.
        val gridAlpha by animateFloatAsState(if (overlay is Overlay.Search) 0f else 1f, tween(180), label = "grid-under-search")
        Column(
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = gridAlpha }
                .neoGlass()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Top)),
        ) {
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
                updateDot = updates.pending.isNotEmpty(),
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
                    bottomInset = bottomInset,
                )
                // Le bouton + : 56 x 56, rayon 16, à `max(18 ; inset + 14)` du bord droit et du bas (`CalendarLayout.css:53`).
                val fabSource = remember { MutableInteractionSource() }
                val fabPressed by fabSource.collectIsPressedAsState()
                // Échelle 0,94 en 90 ms à l'appui, retour en 260 ms (`cubic-bezier(.2,.9,.3,1)`).
                val fabScale by animateFloatAsState(
                    if (fabPressed) 0.94f else 1f,
                    if (fabPressed) tween(90) else tween(260, easing = CubicBezierEasing(0.2f, 0.9f, 0.3f, 1f)),
                    label = "fab-scale",
                )
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 18.dp, bottom = maxOf(18.dp, bottomInset + 14.dp))
                        .size(56.dp)
                        .scale(fabScale)
                        .cssShadow(offsetY = 12.dp, blur = 28.dp, color = Neo.Accent.copy(alpha = 0.3f), radius = 16.dp)
                        .cssShadow(offsetY = 5.dp, blur = 14.dp, color = Color.Black.copy(alpha = 0.34f), radius = 16.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Neo.Accent)
                        .clickable(interactionSource = fabSource, indication = null) {
                            if (data.calendars.none { it.editable }) {
                                Notices.show("Créez d'abord un dossier de calendrier avant d'ajouter des événements.")
                            } else {
                                sheet = newDraft()
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) { Icon(NeoIcons.Plus, "Nouvel événement", tint = Neo.OnAccent, modifier = Modifier.size(24.dp)) }
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
                updates = updates,
                dayCount = dayCount,
                onDayCount = { viewModel.setDayCount(it); drawer.close(scope) },
                calendars = data.calendars,
                hiddenIds = hidden,
                soloId = solo?.first,
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
                    onColor = { calendar, anchor -> calendarDialog = CalendarDialog.Color(calendar, anchor) },
                    onRename = { calendarDialog = CalendarDialog.Rename(it) },
                    onReminder = { calendarDialog = CalendarDialog.Reminder(it) },
                    onIcsLinks = { calendarDialog = CalendarDialog.IcsLinks(it) },
                    onDelete = { calendarDialog = CalendarDialog.Delete(it) },
                    onReorder = viewModel::setCalendarOrder,
                    onShowOnly = { viewModel.showOnly(it.id) },
                ),
            )
        }

        // Garde le dernier écran ouvert le temps de sa sortie : sans lui l'écran se viderait avant de glisser.
        val lastOverlay = remember { arrayOfNulls<Overlay>(1) }
        if (overlay != null) lastOverlay[0] = overlay
        val shown = overlay ?: lastOverlay[0]

        // La liste d'un calendrier : un panneau de la largeur du tiroir qui se pose dessus, venu de la gauche en 260 ms
        // (`translate3d(-100%)`, `cubic-bezier(.2,0,0,1)`), sous un voile noir à 42 % qui le referme d'un appui (`mobile.css:4474`).
        val panelEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
        AnimatedVisibility(visible = overlay is Overlay.Calendar, enter = fadeIn(tween(260, easing = panelEasing)), exit = fadeOut(tween(260, easing = panelEasing))) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.42f)).clickable(indication = null, interactionSource = null) { overlayKey = "" })
        }
        AnimatedVisibility(
            visible = overlay is Overlay.Calendar,
            enter = slideInHorizontally(tween(260, easing = panelEasing)) { -it },
            exit = slideOutHorizontally(tween(260, easing = panelEasing)) { -it },
        ) {
            val calendar = (shown as? Overlay.Calendar)?.let { calendarsById[it.id] }
            if (calendar == null) {
                LaunchedEffect(shown, data) { if (overlay is Overlay.Calendar) overlayKey = "" }
            } else {
                val events by produceState<List<DisplayEvent>?>(null, data, calendar) {
                    value = withContext(Dispatchers.Default) {
                        // Un calendrier de jours fériés n'a pas de notes : ses jours sont calculés, du plus récent au plus ancien.
                        if (calendar.editable) calendarPanelEvents(data.events, calendar, zone, java.time.Instant.now())
                        else data.holidays.filter { it.calendarId == calendar.id }.sortedByDescending { it.start }
                    }
                }
                val feeds = remember(data, calendar) { data.icsLinks.filter { it.calendarPath == calendar.relativePath } }
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    CalendarEventsPanel(
                        calendar = calendar,
                        events = events,
                        feedOf = { event -> resolveStored(notesById, event.id)?.icsFeedId },
                        feeds = feeds,
                        isDefault = calendar.relativePath == data.defaultCalendarPath,
                        timeFormat24h = data.timeFormat24h,
                        onBack = { overlayKey = "" },
                        onEventClick = openEvent,
                        onAdd = { scope.launch { report(viewModel.createUnscheduledTask(calendar.relativePath)) } },
                        onSetDefault = { viewModel.setDefaultCalendar(calendar.relativePath) },
                        onShowOnly = { viewModel.showOnly(calendar.id) },
                        onColor = { anchor -> calendarDialog = CalendarDialog.Color(calendar, anchor) },
                        onReminder = { calendarDialog = CalendarDialog.Reminder(calendar) },
                        onIcsLinks = { calendarDialog = CalendarDialog.IcsLinks(calendar) },
                        onRemove = { calendarDialog = CalendarDialog.Delete(calendar) },
                        modifier = Modifier.width(minOf(360.dp, maxWidth * 0.88f)),
                    )
                }
            }
        }

        // Les listes de tâches : une fenêtre centrée sur son voile.
        (overlay as? Overlay.Tasks)?.let { tasksOverlay ->
            TasksList(
                complete = tasksOverlay.complete,
                tasks = if (tasksOverlay.complete) taskGroups.complete else taskGroups.todo,
                tasksById = remember(taskGroups) { (taskGroups.todo + taskGroups.complete).associateBy { it.id } },
                today = today,
                onDismiss = { overlayKey = "" },
                onTaskClick = { task -> overlayKey = ""; openTask(task) },
                onToggleTask = { task, done ->
                    val note = notesById[task.id]
                    if (note == null) {
                        Notices.show(noteGone)
                    } else {
                        scope.launch { viewModel.setTaskDone(note, task.id, done)?.let { if (it != WRITE_IGNORED) Notices.fail(it) } }
                    }
                },
            )
        }

        // La recherche : la surface à 78 % sur le fond d'écran, arrivée en 260 ms (`nc-android-search-in` : fondu et 12 dp de descente).
        val searchEasing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
        val searchShift = with(androidx.compose.ui.platform.LocalDensity.current) { 12.dp.roundToPx() }
        AnimatedVisibility(
            visible = overlay is Overlay.Search,
            enter = fadeIn(tween(260, easing = searchEasing)) + slideInVertically(tween(260, easing = searchEasing)) { -searchShift },
            exit = fadeOut(tween(260, easing = searchEasing)) + slideOutVertically(tween(260, easing = searchEasing)) { -searchShift },
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Neo.Surface.copy(alpha = 0.78f))
                    .pointerInput(Unit) { detectTapGestures { } }
                    .windowInsetsPadding(WindowInsets.safeDrawing),
            ) {
                val searching = overlay == Overlay.Search
                val corpus by produceState<List<DisplayEvent>?>(null, data, searching) {
                    value = if (!searching) null
                    else withContext(Dispatchers.Default) {
                        val month = anchor.withDayOfMonth(1)
                        val from = month.minusMonths(2).atStartOfDay(zone).toInstant()
                        val to = month.plusMonths(3).atStartOfDay(zone).toInstant()
                        searchCorpus(data.events, calendarsById, anchor, zone, java.time.Instant.now()) +
                            data.holidays.filter { it.start >= from && it.start < to }
                    }
                }
                SearchScreen(corpus, data.timeFormat24h, { overlayKey = "" }, openEvent)
            }
        }

        // Les Réglages : plein écran, glissés de 1/5 depuis la droite.
        AnimatedVisibility(
            visible = overlay is Overlay.Settings,
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
                SettingsScreen(
                    version = BuildConfig.VERSION_NAME,
                    updates = updates,
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
            }
        }
    }

    when (val dialog = calendarDialog) {
        null -> Unit
        CalendarDialog.Add -> AddCalendarSheet(
            rootName = viewModel.treeName(),
            takenNames = data.calendars.map { it.name }.toSet(),
            onCreate = { request ->
                when (request) {
                    is AddCalendarRequest.Notes -> viewModel.createCalendarWithLink(request.name, request.icsUrl)
                    is AddCalendarRequest.Holidays -> viewModel.addHolidayCalendar(request.name, request.color)
                }
            },
            onDismiss = { calendarDialog = null },
        )
        is CalendarDialog.Rename -> CalendarNameDialog(
            "Renommer le calendrier", dialog.calendar.name, "Renommer", data.calendars.map { it.name }.toSet() - dialog.calendar.name,
            { name -> calendarDialog = null; scope.launch { report(viewModel.renameCalendar(dialog.calendar.relativePath, name)) } },
            { calendarDialog = null },
        )
        is CalendarDialog.Color -> CalendarColorPicker(
            dialog.calendar.color,
            dialog.anchor,
            { hex -> viewModel.setCalendarColor(dialog.calendar.relativePath, hex) },
            { calendarDialog = null },
        )
        is CalendarDialog.Delete -> ConfirmDeleteCalendarDialog(
            dialog.calendar.name,
            !dialog.calendar.editable,
            {
                calendarDialog = null
                scope.launch {
                    report(
                        if (dialog.calendar.editable) viewModel.deleteCalendar(dialog.calendar.relativePath)
                        else viewModel.removeHolidayCalendar(dialog.calendar.relativePath),
                    )
                }
            },
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

/** Le bouton + (comme la WebView) : maintenant, sans arrondi, trente minutes, dans le calendrier par défaut. */
private fun newDraft(): SheetTarget.Draft {
    val start = java.time.LocalDateTime.now().withSecond(0).withNano(0)
    return SheetTarget.Draft(start, start.plusMinutes(30), allDay = false)
}
