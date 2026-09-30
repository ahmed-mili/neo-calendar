package com.ahmed.neocalendar.nativeapp.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import com.ahmed.neocalendar.nativeapp.WorkspaceData
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale

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
    var monthOpen by rememberSaveable { mutableStateOf(false) }
    var selected by remember { mutableStateOf<DisplayEvent?>(null) }

    // Ce que la barre du haut dit de la grille : le jour le plus proche de la tête, recalculé seulement quand il change.
    val nearest by remember { derivedStateOf { grid.nearestDayEpoch } }
    val firstDay by remember { derivedStateOf { grid.firstDayEpoch } }
    val anchor = LocalDate.ofEpochDay(nearest)
    val today = LocalDate.now()

    LaunchedEffect(firstDay, dayCount, data) { viewModel.ensureWindow(firstDay - 1, firstDay + dayCount + 2) }

    BackHandler(enabled = drawer.isOpen || monthOpen) {
        if (drawer.isOpen) drawer.close(scope) else monthOpen = false
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            val visible = remember(nearest, dayCount) {
                (0 until dayCount).map { LocalDate.ofEpochDay(nearest + it).atStartOfDay(zone).toInstant() }
            }
            TopBar(
                monthName = anchor.month.getDisplayName(TextStyle.FULL_STANDALONE, Locale.getDefault()),
                weekNumber = getISOWeek(anchor.atStartOfDay(zone).toInstant(), zone),
                monthOpen = monthOpen,
                todayNumber = today.dayOfMonth,
                badge = todayBadgeState(visible, java.time.Instant.now(), zone),
                onMenu = { drawer.open(scope) },
                onMonth = { monthOpen = !monthOpen },
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
                    onEventClick = { selected = it },
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
                            Toast.makeText(context, "La création d'évènement arrive avec la fiche.", Toast.LENGTH_SHORT).show()
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
            )
        }
    }

    selected?.let { EventReadSheet(it, data.timeFormat24h) { selected = null } }
}
