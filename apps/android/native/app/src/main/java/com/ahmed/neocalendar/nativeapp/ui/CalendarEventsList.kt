package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.format.formatCardDate
import com.ahmed.neocalendar.core.format.formatDatedDayWithYear
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.ics.IcsLink
import com.ahmed.neocalendar.core.lists.DateFilter
import com.ahmed.neocalendar.core.lists.NO_ICS_FEED
import com.ahmed.neocalendar.core.lists.PanelPeriod
import com.ahmed.neocalendar.core.lists.StatusFilter
import com.ahmed.neocalendar.core.lists.Timeframe
import com.ahmed.neocalendar.core.lists.calendarColorName
import com.ahmed.neocalendar.core.lists.filterPanelEvents
import com.ahmed.neocalendar.core.lists.formatPanelPeriod
import com.ahmed.neocalendar.core.lists.formatTotalMinutes
import com.ahmed.neocalendar.core.lists.panelTimeframe
import com.ahmed.neocalendar.core.lists.summarizePanelEvents
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/** Les pages du popover des filtres (`SettingsPage` de CalendarEventsPanel.tsx). */
private enum class FilterPage { Root, Status, Date, Period, IcsLinks }

/**
 * La liste des évènements d'un calendrier (appui sur sa ligne dans le tiroir) : le panneau de `CalendarEventsPanel.tsx`
 * à la largeur du tiroir. En-tête (nom, menu « ... », filtres, « + », retour), recherche, totaux, cartes. `events` est
 * null tant que la liste se calcule.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarEventsPanel(
    calendar: CalendarModel,
    events: List<DisplayEvent>?,
    feedOf: (DisplayEvent) -> String?,
    feeds: List<IcsLink>,
    isDefault: Boolean,
    timeFormat24h: Boolean,
    onBack: () -> Unit,
    onEventClick: (DisplayEvent) -> Unit,
    onAdd: () -> Unit,
    onSetDefault: () -> Unit,
    onShowOnly: () -> Unit,
    onColor: (Rect) -> Unit,
    onReminder: () -> Unit,
    onIcsLinks: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf(StatusFilter.ALL) }
    var dateFilter by rememberSaveable { mutableStateOf(DateFilter.ALL) }
    var periodStart by rememberSaveable { mutableStateOf<String?>(null) }
    var periodEnd by rememberSaveable { mutableStateOf<String?>(null) }
    var hiddenFeeds by rememberSaveable { mutableStateOf(emptySet<String>()) }
    var showTotals by rememberSaveable { mutableStateOf(false) }
    var filterPage by remember { mutableStateOf<FilterPage?>(null) }
    var moreMenu by remember { mutableStateOf(false) }
    var moreBounds by remember { mutableStateOf(Rect.Zero) }
    var headerHeightPx by remember { mutableStateOf(0) }

    val zone = remember { ZoneId.systemDefault() }
    val period = remember(periodStart, periodEnd) {
        val start = periodStart?.let(LocalDate::parse)
        val end = periodEnd?.let(LocalDate::parse)
        if (start != null && end != null) PanelPeriod(start, end) else null
    }
    val shown = remember(events, query, status, dateFilter, period, hiddenFeeds, feeds) {
        events?.let { filterPanelEvents(it, status, dateFilter, query, period, hiddenFeeds, zone, feedOf) }
    }
    val summary = remember(shown) { shown?.let(::summarizePanelEvents) }
    val now = remember(events) { Instant.now() }
    val accent = remember(calendar.color) { parseCalendarColor(calendar.color) }
    val filtering = query.isNotBlank() || status != StatusFilter.ALL || dateFilter != DateFilter.ALL

    Box(
        modifier
            .fillMaxHeight()
            .background(Neo.Mantle)
            .drawBehind { drawRect(Neo.CardEdge, topLeft = Offset(size.width - 1.dp.toPx(), 0f), size = Size(1.dp.toPx(), size.height)) }
            .pointerInput(Unit) { detectTapGestures { } },
    ) {
        Column(Modifier.fillMaxSize()) {
            // En-tête : 12 dp sous la barre d'état, 10 dp sous les boutons de 40 dp, filet bas.
            Column(
                Modifier
                    .fillMaxWidth()
                    .onSizeChanged { headerHeightPx = it.height }
                    .windowInsetsPadding(WindowInsets.statusBars),
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, end = 8.dp, top = 12.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(NeoIcons.CalendarGlyph, null, tint = accent, modifier = Modifier.size(16.dp))
                    Text(
                        calendar.name,
                        color = Neo.Text,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 8.dp).weight(1f),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                        Box {
                            PanelIconButton(NeoIcons.Ellipsis, "Plus d'options", on = moreMenu, modifier = Modifier.onGloballyPositioned { moreBounds = it.boundsInWindow() }) {
                                filterPage = null
                                moreMenu = true
                            }
                            NeoPopupMenu(moreMenu, { moreMenu = false }) {
                                MenuRow(
                                    "Couleur",
                                    swatch = accent,
                                    value = calendarColorName(calendar.color),
                                ) { moreMenu = false; onColor(moreBounds) }
                                MenuRow("Définir par défaut", icon = NeoIcons.CalendarGlyph, enabled = calendar.editable && !isDefault) {
                                    moreMenu = false
                                    onSetDefault()
                                }
                                MenuRow("N'afficher que cette vue", icon = NeoIcons.DrawerEye) { moreMenu = false; onShowOnly() }
                                MenuRow("Afficher les totaux", icon = NeoIcons.ChartColumn, checked = showTotals) { moreMenu = false; showTotals = !showTotals }
                                if (calendar.editable) {
                                    MenuRow("Rappel", icon = NeoIcons.Bell) { moreMenu = false; onReminder() }
                                    MenuRow("Liens ICS", icon = NeoIcons.Link) { moreMenu = false; onIcsLinks() }
                                }
                                MenuRow("Retirer la vue de la liste", icon = NeoIcons.ListX, danger = true) { moreMenu = false; onRemove() }
                            }
                        }
                        PanelIconButton(NeoIcons.SlidersHorizontal, "Filtres", on = filterPage != null) {
                            moreMenu = false
                            filterPage = if (filterPage == null) FilterPage.Root else null
                        }
                        PanelIconButton(NeoIcons.Plus, "Ajouter un événement", enabled = calendar.editable, onClick = onAdd)
                        PanelIconButton(NeoIcons.ChevronLeft, "Retour aux calendriers", onClick = onBack)
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Neo.Border))
            }
            SearchBar(query) { query = it }
            if (showTotals && summary != null) {
                TotalsBox(formatTotalMinutes(summary.totalMinutes), summary.taskCount, formatPanelPeriod(dateFilter, period))
            }
            when {
                shown == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neo.Accent) }
                shown.isEmpty() -> Text(
                    if (filtering) "Aucun événement correspondant" else "Aucun événement",
                    color = Neo.TextFaint,
                    fontSize = 13.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 24.dp),
                )
                else -> {
                    val bottom = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 16.dp + bottom),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(shown, key = { it.id }) { event ->
                            EventCard(event, accent, now, zone, timeFormat24h) { onEventClick(event) }
                        }
                    }
                }
            }
        }
        // Le popover des filtres : accroché sous l'en-tête, de bord à bord à 8 dp près ; un appui dehors le ferme.
        if (filterPage != null) {
            Box(Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures { filterPage = null } })
            val headerHeight = with(LocalDensity.current) { headerHeightPx.toDp() }
            FiltersPopover(
                page = filterPage!!,
                onPage = { filterPage = it },
                status = status,
                onStatus = { status = it; filterPage = FilterPage.Root },
                dateFilter = dateFilter,
                onDate = { dateFilter = it; filterPage = FilterPage.Root },
                period = period,
                onPeriod = { start, end ->
                    periodStart = start?.toString(); periodEnd = end?.toString()
                    dateFilter = if (start != null && end != null) DateFilter.PERIOD else DateFilter.ALL
                    filterPage = FilterPage.Root
                },
                feeds = feeds,
                hiddenFeeds = hiddenFeeds,
                onHiddenFeeds = { hiddenFeeds = it },
                modifier = Modifier.offset(y = headerHeight).padding(horizontal = 8.dp),
            )
        }
    }
}

@Composable
private fun PanelIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    on: Boolean = false,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .size(40.dp)
            .alpha(if (enabled) 1f else 0.3f)
            .let { if (enabled) it.pressFill(RoundedCornerShape(12.dp), Neo.Hover, on = on, onClick = onClick) else it },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, label, tint = if (on) Neo.Text else Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
}

/** `.nc-cep-search` : 32 dp, rayon 8, loupe 14 dp à gauche, croix à droite quand il y a une saisie ; texte 16 sp (le réglage des champs d'Android). */
@Composable
private fun SearchBar(value: String, onChange: (String) -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    var focused by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 8.dp), contentAlignment = Alignment.CenterStart) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(32.dp)
                .background(if (focused) Neo.Hover else Neo.Surface, shape)
                .border(1.dp, if (focused) lerp(Neo.Border, Neo.Accent, 0.65f) else Neo.Border, shape)
                .padding(horizontal = 30.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isEmpty()) Text("Rechercher un événement", color = Neo.TextFaint, fontSize = 16.sp, maxLines = 1)
            BasicTextField(
                value,
                onChange,
                singleLine = true,
                textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp),
                cursorBrush = SolidColor(Neo.Accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { }),
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            )
        }
        Icon(NeoIcons.Search, null, tint = Neo.TextFaint, modifier = Modifier.padding(start = 9.dp).size(14.dp))
        if (value.isNotEmpty()) {
            Box(
                Modifier.align(Alignment.CenterEnd).padding(end = 6.dp).size(22.dp).pressFill(RoundedCornerShape(5.dp), Neo.Hover) { onChange("") },
                contentAlignment = Alignment.Center,
            ) { Icon(NeoIcons.Close, "Effacer la recherche", tint = Neo.TextFaint, modifier = Modifier.size(12.dp)) }
        }
    }
}

/** `.nc-cep-summary` : deux mesures et la période dans un cadre arrondi dont le fond de 1 dp fait les filets. */
@Composable
private fun TotalsBox(totalTime: String, taskCount: Int, period: String) {
    val shape = RoundedCornerShape(9.dp)
    Column(
        Modifier
            .padding(start = 10.dp, end = 10.dp, top = 8.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(Neo.Border)
            .border(1.dp, Neo.Border, shape),
        verticalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(1.dp)) {
            Metric("Temps total", totalTime, Modifier.weight(1f))
            Metric("Tâches", taskCount.toString(), Modifier.weight(1f))
        }
        Row(
            Modifier.fillMaxWidth().background(Neo.Surface).padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Icon(NeoIcons.CalendarGlyph, null, tint = Neo.TextFaint, modifier = Modifier.size(14.dp))
            Text("Période", color = Neo.TextFaint, fontSize = 10.5.sp, fontWeight = FontWeight.Medium)
            Text(period, color = Neo.TextSecondary, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = androidx.compose.ui.text.style.TextAlign.End, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier) {
    Column(modifier.background(Neo.Surface).padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, color = Neo.TextFaint, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.21.sp)
        Text(value, color = Neo.Text, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * Une carte de la liste (`.nc-cep-card`) : titre avec l'icône de note, date sous la couleur du calendrier, état d'une tâche.
 * Passé : contenu à 52 %. En cours : bord et fond blancs, barre d'accent de 3 dp à gauche.
 */
@Composable
private fun EventCard(event: DisplayEvent, accent: Color, now: Instant, zone: ZoneId, timeFormat24h: Boolean, onClick: () -> Unit) {
    val timeframe = panelTimeframe(event, now)
    val shape = RoundedCornerShape(10.dp)
    val date = remember(event, timeFormat24h) {
        if (event.isSomeday) "Ajouter une date"
        else formatCardDate(event.start, event.end, event.allDay, zone, timeFormat24h, now.atZone(zone).year)
    }
    val isNow = timeframe == Timeframe.NOW
    Column(
        Modifier
            .fillMaxWidth()
            .cssShadow(1.dp, 2.dp, Color.Black.copy(alpha = 0.05f), 10.dp)
            .clip(shape)
            .background(Neo.Surface)
            .let { if (isNow) it.background(Neo.CardEdge) else it }
            .border(1.dp, if (isNow) Neo.CardEdgeStrong else Neo.CardEdge, shape)
            .pressFill(shape, Neo.BarPress, onClick = onClick)
            .drawBehind {
                if (isNow) {
                    drawRoundRect(
                        Neo.Accent,
                        topLeft = Offset(0f, 8.dp.toPx()),
                        size = Size(3.dp.toPx(), size.height - 16.dp.toPx()),
                        cornerRadius = CornerRadius(3.dp.toPx()),
                    )
                }
            }
            .padding(start = 8.dp, end = 8.dp, top = 10.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val fade = if (timeframe == Timeframe.PAST) 0.52f else 1f
        Row(Modifier.alpha(fade), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(NeoIcons.FileText, null, tint = Neo.TextFaint, modifier = Modifier.size(14.dp))
            Text(
                event.title.trim().ifEmpty { "Sans titre" },
                color = Neo.Text,
                fontSize = 14.sp,
                lineHeight = 21.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(date, color = accent, fontSize = 12.5.sp, lineHeight = 18.75.sp, fontWeight = FontWeight.Medium, maxLines = 1, modifier = Modifier.alpha(fade))
        if (event.isTask) {
            val done = event.taskStatus == "complete"
            val tint = if (done) Neo.TaskDone else Neo.TaskTodo
            Row(
                Modifier
                    .alpha(fade)
                    .background(tint.copy(alpha = 0.16f), RoundedCornerShape(6.dp))
                    .padding(start = 8.dp, end = 9.dp, top = 2.dp, bottom = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(Modifier.size(7.dp).background(tint, CircleShape))
                Text(if (done) "Terminé" else "À faire", color = Neo.Text, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

// ── Filtres ───────────────────────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FiltersPopover(
    page: FilterPage,
    onPage: (FilterPage?) -> Unit,
    status: StatusFilter,
    onStatus: (StatusFilter) -> Unit,
    dateFilter: DateFilter,
    onDate: (DateFilter) -> Unit,
    period: PanelPeriod?,
    onPeriod: (LocalDate?, LocalDate?) -> Unit,
    feeds: List<IcsLink>,
    hiddenFeeds: Set<String>,
    onHiddenFeeds: (Set<String>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(10.dp)
    var openFeedMenu by remember { mutableStateOf<String?>(null) }
    Column(
        modifier
            .fillMaxWidth()
            .shadow(14.dp, shape, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.45f))
            .background(Neo.Mantle, shape)
            .border(1.dp, Neo.Border, shape)
            .pointerInput(Unit) { detectTapGestures { } }
            .padding(4.dp),
        verticalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        val title = when (page) {
            FilterPage.Root -> "Filtres"
            FilterPage.Status -> "Statut"
            FilterPage.Date -> "Date"
            FilterPage.IcsLinks -> "Liens ICS"
            FilterPage.Period -> "Période personnalisée"
        }
        Row(Modifier.fillMaxWidth().height(30.dp).padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (page != FilterPage.Root) {
                Box(
                    Modifier.offset(x = (-5).dp).padding(end = 3.dp).size(24.dp).pressFill(RoundedCornerShape(5.dp), Neo.Hover) {
                        onPage(if (page == FilterPage.Period) FilterPage.Date else FilterPage.Root)
                    },
                    contentAlignment = Alignment.Center,
                ) { Icon(NeoIcons.ChevronLeft, "Retour", tint = Neo.TextSecondary, modifier = Modifier.size(14.dp)) }
            }
            Text(title, color = Neo.TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        when (page) {
            FilterPage.Root -> {
                FilterRow(NeoIcons.SlidersHorizontal, "Statut", statusLabel(status), chevron = true) { onPage(FilterPage.Status) }
                FilterRow(NeoIcons.CalendarGlyph, "Date", if (dateFilter == DateFilter.PERIOD) "Période" else dateLabel(dateFilter), chevron = true) { onPage(FilterPage.Date) }
                if (feeds.isNotEmpty()) {
                    val visible = feeds.count { it.id !in hiddenFeeds }
                    FilterRow(NeoIcons.Link, "Liens ICS", if (hiddenFeeds.isEmpty()) "Tous" else "$visible/${feeds.size}", chevron = true) { onPage(FilterPage.IcsLinks) }
                }
            }
            FilterPage.Status -> for (option in StatusFilter.values()) {
                FilterRow(null, statusLabel(option), null, checked = status == option) { onStatus(option) }
            }
            FilterPage.Date -> {
                for (option in listOf(DateFilter.ALL, DateFilter.SCHEDULED, DateFilter.UNSCHEDULED)) {
                    FilterRow(null, dateLabel(option), null, checked = dateFilter == option) { onDate(option) }
                }
                Box(Modifier.padding(horizontal = 5.dp, vertical = 7.dp).fillMaxWidth().height(1.dp).background(Neo.Border))
                FilterRow(null, "Période personnalisée", null, checked = dateFilter == DateFilter.PERIOD, chevron = true) { onPage(FilterPage.Period) }
            }
            FilterPage.IcsLinks -> for (feed in feeds) {
                val hidden = feed.id in hiddenFeeds
                val onlyVisible = !hidden && NO_ICS_FEED in hiddenFeeds && feeds.all { it.id == feed.id || it.id in hiddenFeeds }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 32.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        Modifier
                            .weight(1f)
                            .heightIn(min = 32.dp)
                            .pressFill(RoundedCornerShape(6.dp), Neo.Hover) { onHiddenFeeds(if (hidden) hiddenFeeds - feed.id else hiddenFeeds + feed.id) }
                            .padding(horizontal = 9.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(9.dp),
                    ) {
                        Box(Modifier.width(15.dp), contentAlignment = Alignment.Center) {
                            if (!hidden) Icon(NeoIcons.Check, null, tint = if (onlyVisible) Neo.Accent else Neo.Text, modifier = Modifier.size(14.dp))
                        }
                        Text(feed.name, color = Neo.Text, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Box(
                        Modifier.padding(end = 4.dp).size(32.dp).pressFill(RoundedCornerShape(6.dp), Neo.Hover) {
                            openFeedMenu = if (openFeedMenu == feed.id) null else feed.id
                        },
                        contentAlignment = Alignment.Center,
                    ) { Icon(NeoIcons.Ellipsis, "Plus d'options", tint = Neo.TextSecondary, modifier = Modifier.size(15.dp)) }
                }
                if (openFeedMenu == feed.id) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 32.dp)
                            .let { if (onlyVisible) it.background(Neo.Accent.copy(alpha = 0.12f), RoundedCornerShape(6.dp)) else it }
                            .pressFill(RoundedCornerShape(6.dp), Neo.Hover) {
                                // Isoler : tous les autres liens et les notes personnelles se cachent ; un second appui défait.
                                onHiddenFeeds(
                                    if (onlyVisible) emptySet()
                                    else setOf(NO_ICS_FEED) + feeds.filter { it.id != feed.id }.map { it.id },
                                )
                            }
                            .padding(start = 32.dp, end = 9.dp, top = 7.dp, bottom = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(9.dp),
                    ) {
                        val tint = if (onlyVisible) Neo.Accent else Neo.Text
                        Icon(NeoIcons.DrawerEye, null, tint = tint, modifier = Modifier.size(15.dp))
                        Text(if (onlyVisible) "Ne plus isoler" else "Afficher seulement ce lien", color = tint, fontSize = 16.sp, modifier = Modifier.weight(1f))
                        if (onlyVisible) Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(14.dp))
                    }
                }
            }
            FilterPage.Period -> PeriodEditor(period, onPeriod)
        }
    }
}

private fun statusLabel(filter: StatusFilter) = when (filter) {
    StatusFilter.ALL -> "Tous"
    StatusFilter.TODO -> "À faire"
    StatusFilter.COMPLETE -> "Terminé"
}

private fun dateLabel(filter: DateFilter) = when (filter) {
    DateFilter.ALL -> "Tous"
    DateFilter.SCHEDULED -> "Planifiés"
    DateFilter.UNSCHEDULED -> "Non planifiés"
    DateFilter.PERIOD -> "Période"
}

@Composable
private fun FilterRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector?,
    label: String,
    value: String?,
    checked: Boolean = false,
    chevron: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 32.dp)
            .pressFill(RoundedCornerShape(6.dp), Neo.Hover, onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        if (icon != null) {
            Icon(icon, null, tint = Neo.Text, modifier = Modifier.size(15.dp))
        } else {
            Box(Modifier.width(15.dp), contentAlignment = Alignment.Center) {
                if (checked) Icon(NeoIcons.Check, null, tint = Neo.Text, modifier = Modifier.size(14.dp))
            }
        }
        Text(label, color = Neo.Text, fontSize = 16.sp, lineHeight = 24.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (value != null) Text(value, color = Neo.TextSecondary, fontSize = 16.sp, lineHeight = 24.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (chevron) Icon(NeoIcons.ChevronRight, null, tint = Neo.Text, modifier = Modifier.size(14.dp))
    }
}

/** La période personnalisée : deux dates (le sélecteur du système, comme `<input type=date>`), « Effacer » et « Appliquer ». */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PeriodEditor(period: PanelPeriod?, onPeriod: (LocalDate?, LocalDate?) -> Unit) {
    val today = remember { LocalDate.now() }
    var start by remember { mutableStateOf(period?.start ?: today.withDayOfMonth(1)) }
    var end by remember { mutableStateOf(period?.end ?: today.withDayOfMonth(today.lengthOfMonth())) }
    var picking by remember { mutableStateOf<Int?>(null) }
    val valid = !end.isBefore(start)
    Column(Modifier.padding(start = 7.dp, end = 7.dp, top = 5.dp, bottom = 7.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        for ((index, pair) in listOf("De" to start, "À" to end).withIndex()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(pair.first, color = Neo.TextSecondary, fontSize = 12.sp, modifier = Modifier.width(40.dp))
                val shape = RoundedCornerShape(7.dp)
                Box(
                    Modifier
                        .weight(1f)
                        .height(32.dp)
                        .background(Neo.Surface, shape)
                        .border(1.dp, Neo.Border, shape)
                        .clickable { picking = index }
                        .padding(horizontal = 8.dp),
                    contentAlignment = Alignment.CenterStart,
                ) { Text(pair.second.let { "%02d/%02d/%d".format(it.dayOfMonth, it.monthValue, it.year) }, color = Neo.Text, fontSize = 16.sp) }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.End)) {
            Box(
                Modifier.height(30.dp).pressFill(RoundedCornerShape(6.dp), Neo.Hover) { onPeriod(null, null) }.padding(horizontal = 11.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Effacer", color = Neo.TextSecondary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
            Box(
                Modifier
                    .height(30.dp)
                    .alpha(if (valid) 1f else 0.35f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Neo.Accent)
                    .let { if (valid) it.clickable { onPeriod(start, end) } else it }
                    .padding(horizontal = 11.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Appliquer", color = Neo.OnAccent, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
        }
    }
    picking?.let { index ->
        val current = if (index == 0) start else end
        val state = rememberDatePickerState(initialSelectedDateMillis = current.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = null },
            confirmButton = {
                Text(
                    "OK",
                    color = Neo.Accent,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable {
                        state.selectedDateMillis?.let { millis ->
                            val picked = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                            if (index == 0) start = picked else end = picked
                        }
                        picking = null
                    }.padding(horizontal = 16.dp, vertical = 12.dp),
                )
            },
            dismissButton = {
                Text("Annuler", color = Neo.TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.clickable { picking = null }.padding(horizontal = 16.dp, vertical = 12.dp))
            },
            colors = DatePickerDefaults.colors(containerColor = Neo.Surface),
        ) {
            DatePicker(
                state,
                colors = DatePickerDefaults.colors(
                    containerColor = Neo.Surface,
                    titleContentColor = Neo.TextSecondary,
                    headlineContentColor = Neo.Text,
                    weekdayContentColor = Neo.TextSecondary,
                    subheadContentColor = Neo.TextSecondary,
                    navigationContentColor = Neo.Text,
                    yearContentColor = Neo.Text,
                    currentYearContentColor = Neo.Accent,
                    selectedYearContentColor = Neo.OnAccent,
                    selectedYearContainerColor = Neo.Accent,
                    dayContentColor = Neo.Text,
                    selectedDayContentColor = Neo.OnAccent,
                    selectedDayContainerColor = Neo.Accent,
                    todayContentColor = Neo.Accent,
                    todayDateBorderColor = Neo.Accent,
                ),
            )
        }
    }
}
