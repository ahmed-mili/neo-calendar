package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.format.weekdayShort
import com.ahmed.neocalendar.core.grid.DaySegment
import com.ahmed.neocalendar.core.grid.segmentForDay
import com.ahmed.neocalendar.core.layout.EVENT_VGAP
import com.ahmed.neocalendar.core.layout.GridEvent
import com.ahmed.neocalendar.core.layout.OVERLAP_COL_GAP
import com.ahmed.neocalendar.core.layout.computeOverlapGroups
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import com.ahmed.neocalendar.nativeapp.AppLocale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

val RailWidth = 48.dp
val HeaderHeight = 48.dp
private const val MIN_BLOCK_DP = 14

/**
 * Compose seulement les colonnes qui se voient (plus une de marge de chaque
 * côté) et les place d'après la position de la grille : glisser relance la
 * mise en place, jamais la composition.
 */
@Composable
fun DayColumns(
    state: GridState,
    dayCount: Int,
    modifier: Modifier = Modifier,
    scrolls: Boolean = false,
    contentHeightPx: (maxHeight: Int) -> Int = { it },
    content: @Composable (day: Long) -> Unit,
) {
    val first by remember(state) { derivedStateOf { state.origin + floor(state.offsetDays).toLong() - 1 } }
    Layout(
        content = {
            for (day in first..(first + dayCount + 2)) key(day) { Box(Modifier.layoutId(day)) { content(day) } }
        },
        modifier = modifier.clipToBounds(),
    ) { measurables, c ->
        val columnWidth = c.maxWidth.toFloat() / dayCount
        state.columnWidthPx = columnWidth
        if (scrolls) state.viewportHeightPx = c.maxHeight.toFloat()
        val height = contentHeightPx(c.maxHeight)
        val placeables = measurables.map {
            it.measure(Constraints.fixed(ceil(columnWidth).toInt(), height))
        }
        layout(c.maxWidth, c.maxHeight) {
            val scrollY = if (scrolls) state.clampedScrollY.roundToInt() else 0
            for (i in measurables.indices) {
                val day = measurables[i].layoutId as Long
                val x = ((day - state.origin - state.offsetDays) * columnWidth).roundToInt()
                placeables[i].place(x, -scrollY)
            }
        }
    }
}

/** La grille entière : en-têtes, bande journée entière, puis heures et colonnes. */
@Composable
fun TimeGridArea(
    state: GridState,
    dayCount: Int,
    freeScroll: Boolean,
    timeFormat24h: Boolean,
    occurrences: com.ahmed.neocalendar.nativeapp.Occurrences,
    allDayCollapsed: Boolean,
    onToggleAllDayCollapsed: () -> Unit,
    actions: GridActions,
    dataVersion: Any,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    state.density = density.density
    val scope = rememberCoroutineScope()
    val decay = rememberSplineBasedDecay<Float>()
    val zone = remember { ZoneId.systemDefault() }
    val haptic = LocalHapticFeedback.current
    val ix = remember(state) { GridInteraction(state, zone, scope) }
    ix.actions = actions
    ix.currentData = dataVersion

    // Une écriture part : son résultat (déplacement, redimensionnement) reste dessiné jusqu'à ce que le dossier relu l'ait remplacé.
    LaunchedEffect(occurrences) {
        if (ix.pendingData != null && ix.pendingData !== dataVersion) ix.clearPending()
    }
    LaunchedEffect(ix.hasPending) {
        if (ix.hasPending) {
            delay(4_000)
            ix.clearPending()
        }
    }

    // La ligne de l'heure actuelle avance à la minute juste.
    LaunchedEffect(state) {
        while (true) {
            val now = System.currentTimeMillis()
            state.nowMillis = now
            delay(60_000 - now % 60_000 + 50)
        }
    }

    Column(modifier.fillMaxSize()) {
        // Les en-têtes et la bande journée entière suivent le glissé horizontal, pas le vertical.
        Row(
            Modifier
                .fillMaxWidth()
                .height(HeaderHeight)
                .gridDrag(state, scope, freeScroll, vertical = false, decay = decay),
        ) {
            Box(Modifier.width(RailWidth))
            DayColumns(state, dayCount, Modifier.weight(1f).fillMaxHeight()) { day -> DayHeader(day, state) }
        }
        AllDayBand(
            state = state,
            dayCount = dayCount,
            occurrences = occurrences,
            collapsed = allDayCollapsed,
            onToggleCollapsed = onToggleAllDayCollapsed,
            onEventClick = actions.onOpen,
            onToggleTask = actions.onToggleTask,
            onCreateAllDay = actions.onCreateAllDay,
            modifier = Modifier.gridDrag(state, scope, freeScroll, vertical = false, decay = decay),
        )
        Row(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .gridPinch(state)
                .gridDrag(state, scope, freeScroll, vertical = true, decay = decay),
        ) {
            HourRail(state, timeFormat24h)
            Box(Modifier.weight(1f).fillMaxHeight().gridTouch(ix, haptic)) {
                GridBackground(state, dayCount, zone)
                DayColumns(
                    state,
                    dayCount,
                    Modifier.fillMaxSize(),
                    scrolls = true,
                    contentHeightPx = { (24 * state.hourPx).roundToInt() },
                ) { day ->
                    val events = occurrences.timed[day]
                    if (!events.isNullOrEmpty()) {
                        DayEvents(day, events, ix, timeFormat24h, zone)
                    }
                }
                MoveGhost(ix, dayCount, timeFormat24h)
            }
        }
        LaunchedEffect(state.viewportHeightPx) { state.initialScrollIfNeeded(hourNow(zone)) }
    }
}

private fun hourNow(zone: ZoneId): Float {
    val now = java.time.ZonedDateTime.now(zone)
    return now.hour + now.minute / 60f
}

@Composable
private fun DayHeader(day: Long, state: GridState) {
    val date = LocalDate.ofEpochDay(day)
    val today = LocalDate.now()
    val isToday = date == today
    val weekday = remember(day) { weekdayShort(date) }
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            weekday,
            color = if (isToday) Neo.Today else Neo.TextSecondary,
            fontSize = 11.sp,
            maxLines = 1,
        )
        Box(
            Modifier
                .padding(top = 2.dp)
                .then(
                    if (isToday) Modifier.background(Neo.Today, RoundedCornerShape(9.dp)).padding(horizontal = 7.dp, vertical = 1.dp)
                    else Modifier.padding(horizontal = 7.dp, vertical = 1.dp),
                ),
        ) {
            Text(
                date.dayOfMonth.toString(),
                color = if (isToday) Color.White else Neo.Text,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}

/** Le format d'heure de l'axe : « 09:00 » en 24 h, « 9 AM » sinon. */
private fun hourLabel(hour: Int, timeFormat24h: Boolean): String =
    if (timeFormat24h) "%02d:00".format(AppLocale.current, hour)
    else when {
        hour == 0 -> "12 AM"
        hour < 12 -> "$hour AM"
        hour == 12 -> "12 PM"
        else -> "${hour - 12} PM"
    }

@Composable
private fun HourRail(state: GridState, timeFormat24h: Boolean) {
    val measurer = rememberTextMeasurer()
    val style = remember { TextStyle(color = Neo.TextSecondary, fontSize = 11.sp, textAlign = TextAlign.End) }
    val labels = remember(timeFormat24h) { (0..23).map { hourLabel(it, timeFormat24h) } }
    Canvas(Modifier.width(RailWidth).fillMaxHeight().clipToBounds()) {
        val hourPx = state.hourPx
        val scroll = state.clampedScrollY
        val widthPx = size.width
        val pad = 6.dp.toPx()
        for (h in 1..23) {
            val y = h * hourPx - scroll
            // L'étiquette est centrée sur sa ligne ; on saute ce qui sort de la vue.
            if (y < -20.dp.toPx() || y > size.height + 20.dp.toPx()) continue
            val layout = measurer.measure(labels[h], style, maxLines = 1)
            drawText(layout, topLeft = Offset(widthPx - pad - layout.size.width, y - layout.size.height / 2f))
        }
    }
}

/** Les lignes d'heure, les séparateurs de jours, la teinte d'aujourd'hui et la ligne de l'heure actuelle. */
@Composable
private fun GridBackground(state: GridState, dayCount: Int, zone: ZoneId) {
    Canvas(Modifier.fillMaxSize()) {
        val hourPx = state.hourPx
        val scroll = state.clampedScrollY
        val columnWidth = size.width / dayCount
        val offset = state.offsetDays
        val hairline = 1f
        val todayIdx = LocalDate.now(zone).toEpochDay() - state.origin

        // Aujourd'hui : un voile léger sur sa colonne.
        val todayX = (todayIdx - offset) * columnWidth
        if (todayX + columnWidth > 0f && todayX < size.width) {
            drawRect(Color(0x0DFFFFFF), Offset(todayX, 0f), Size(columnWidth, size.height))
        }
        for (h in 0..24) {
            val y = h * hourPx - scroll
            if (y < -1f || y > size.height + 1f) continue
            drawLine(Neo.GridLine, Offset(0f, y), Offset(size.width, y), hairline)
        }
        val firstIdx = floor(offset).toInt()
        for (i in firstIdx..firstIdx + dayCount + 1) {
            val x = (i - offset) * columnWidth
            if (x < 0f || x > size.width) continue
            drawLine(Neo.GridLine, Offset(x, 0f), Offset(x, size.height), hairline)
        }

        // L'heure actuelle : un filet pâle sur toute la largeur, un trait vif sur la colonne d'aujourd'hui.
        val now = Instant.ofEpochMilli(state.nowMillis).atZone(zone)
        val nowHours = now.hour + now.minute / 60f
        val y = nowHours * hourPx - scroll
        if (y in 0f..size.height) {
            drawLine(Neo.Today.copy(alpha = 0.3f), Offset(0f, y), Offset(size.width, y), hairline)
            if (todayX + columnWidth > 0f && todayX < size.width) {
                drawLine(Neo.Today, Offset(todayX, y), Offset(todayX + columnWidth, y), 2.dp.toPx())
                drawCircle(Neo.Today, 4.dp.toPx(), Offset(todayX, y))
            }
        }
    }
}

/** Un évènement placé dans sa colonne de chevauchement, pour un jour. */
private class Placed(val event: DisplayEvent, val segment: DaySegment, val column: Int, val total: Int)

private fun placeDay(day: Long, events: List<DisplayEvent>, zone: ZoneId): List<Placed> {
    val date = LocalDate.ofEpochDay(day)
    val dayStart = date.atStartOfDay(zone).toInstant()
    val nextStart = date.plusDays(1).atStartOfDay(zone).toInstant()
    val segments = HashMap<String, DaySegment>()
    val grid = ArrayList<GridEvent>()
    val byId = HashMap<String, DisplayEvent>()
    for (e in events) {
        val segment = segmentForDay(e.start, e.end, date, zone) ?: continue
        segments[e.id] = segment
        byId[e.id] = e
        // Les chevauchements se jugent sur la part du jour, pas sur l'évènement entier.
        grid += GridEvent(e.id, maxOf(e.start, dayStart), minOf(if (e.end > e.start) e.end else e.start, nextStart))
    }
    return computeOverlapGroups(grid).flatMap { group ->
        group.events.map { Placed(byId.getValue(it.event.id), segments.getValue(it.event.id), it.column, it.totalColumns) }
    }
}

@Composable
private fun DayEvents(
    day: Long,
    source: List<DisplayEvent>,
    ix: GridInteraction,
    timeFormat24h: Boolean,
    zone: ZoneId,
) {
    val state = ix.grid
    // Un redimensionnement en attente remplace les heures de son bloc, le temps de la relecture.
    val preview = ix.resizePreview
    val events = remember(source, preview) { if (preview == null) source else source.map { ix.shown(it) } }
    val placed = remember(day, events) { placeDay(day, events, zone) }
    val movingId = ix.movingId
    val resizeId = ix.resizeId
    DisposableEffect(day) { onDispose { ix.rects.remove(day) } }
    Layout(
        content = {
            for (p in placed) key(p.event.id) {
                EventBlock(
                    event = p.event,
                    segment = p.segment,
                    timeFormat24h = timeFormat24h,
                    zone = zone,
                    dimmed = p.event.id == movingId,
                    resizing = p.event.id == resizeId && p.event.editable,
                    onToggleTask = ix.actions.onToggleTask,
                    onHandleDrag = { edge, total -> ix.resizeDrag(p.event, day, edge, total) },
                    onHandleEnd = { edge -> ix.resizeEnd(edge) },
                    onHandleCancel = ix::resizeCancel,
                    onOpen = ix.actions.onOpen,
                )
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) { measurables, c ->
        val hourPx = state.hourPx
        val gap = OVERLAP_COL_GAP.dp.toPx()
        val vgap = EVENT_VGAP.dp.toPx()
        val margin = 4.dp.toPx()
        val minHeight = MIN_BLOCK_DP.dp.toPx()
        val rects = placed.map { p ->
            val slot = c.maxWidth.toFloat() / p.total
            val width = maxOf(slot - gap, 8.dp.toPx())
            val top = p.segment.topHours.toFloat() * hourPx + vgap / 2
            val height = maxOf(p.segment.durationHours.toFloat() * hourPx - vgap, minHeight)
            arrayOf(p.column * slot + margin, top, width, height)
        }
        // Les gestes retrouvent le bloc sous le doigt dans ces rectangles.
        ix.rects[day] = placed.mapIndexed { i, p -> BlockRect(p.event, p.segment, rects[i][0], rects[i][1], rects[i][2], rects[i][3]) }
        val placeables = measurables.mapIndexed { i, m ->
            val r = rects[i]
            m.measure(Constraints.fixed(r[2].roundToInt(), r[3].roundToInt()))
        }
        layout(c.maxWidth, c.maxHeight) {
            placeables.forEachIndexed { i, p -> p.place(rects[i][0].roundToInt(), rects[i][1].roundToInt()) }
        }
    }
}

fun formatClock(instant: Instant, zone: ZoneId, timeFormat24h: Boolean): String =
    com.ahmed.neocalendar.core.format.formatClock(instant, zone, timeFormat24h)
