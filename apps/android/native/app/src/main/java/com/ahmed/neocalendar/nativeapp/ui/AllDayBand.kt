package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.withTimeoutOrNull
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.layout.ALLDAY_MAX_ROWS
import com.ahmed.neocalendar.core.layout.AllDayLaneBar
import com.ahmed.neocalendar.core.layout.EVENT_VGAP
import com.ahmed.neocalendar.core.layout.OVERLAP_COL_GAP
import com.ahmed.neocalendar.core.layout.allDayBandRows
import com.ahmed.neocalendar.core.layout.hiddenBarCountByDay
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.nativeapp.Occurrences
import kotlin.math.floor
import kotlin.math.roundToInt

/** Un pas de 30 dp (barre de 26 et 4 d'écart) : `CalendarGrid.css:443`, `mobile.css:2749`. */
private val ROW_HEIGHT = 30.dp

/**
 * La bande des évènements « toute la journée » : des barres rangées en lignes
 * (le noyau les place), une ligne vide en plus pour en ajouter, repliable à une
 * ligne. Repliée, un jour qui cache des barres annonce leur nombre.
 */
@Composable
fun AllDayBand(
    state: GridState,
    dayCount: Int,
    occurrences: Occurrences,
    collapsed: Boolean,
    onToggleCollapsed: () -> Unit,
    onEventClick: (DisplayEvent) -> Unit,
    onToggleTask: (DisplayEvent) -> Unit,
    onCreateAllDay: (java.time.LocalDate) -> Unit,
    railWidth: androidx.compose.ui.unit.Dp,
    /** Les gestes qui déplacent : une barre saisie à l'appui long suit le doigt jusque dans la grille. */
    ix: GridInteraction,
    modifier: Modifier = Modifier,
) {
    val lanes = occurrences.lanes
    val rows = allDayBandRows(lanes.laneCount, null, collapsed, ALLDAY_MAX_ROWS)
    val rowHeight = ROW_HEIGHT
    val firstDay by remember(state) { derivedStateOf { state.firstDayEpoch } }
    val byId = remember(occurrences) { occurrences.allDay.associateBy { it.id } }
    val bandScroll = rememberScrollState()
    val haptic = LocalHapticFeedback.current

    // Les jours où le repli cache des barres, avec le total du jour ; indexés comme les barres (depuis `fromDay`).
    val hiddenByIndex = remember(lanes, firstDay, dayCount, collapsed) {
        if (!collapsed) emptyMap()
        else {
            val first = (firstDay - occurrences.fromDay).toInt()
            hiddenBarCountByDay(lanes.bars, first - 1, first + dayCount + 1, rows.visibleRows)
        }
    }

    Row(
        modifier
            .fillMaxWidth()
            // Le filet bas de la bande : `rgba(108,112,134,.28)`.
            .drawBehind { drawLine(Neo.Border, Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), 1f) },
    ) {
        // La gouttière : son bord droit de 1 px, et le bouton de repli de 22 x 22 (rayon 6) près de ce bord.
        Box(
            Modifier
                .width(railWidth)
                .height(rowHeight * rows.visibleRows)
                .drawBehind { drawLine(Neo.AllDayGutterBorder, Offset(size.width - 0.5f, 0f), Offset(size.width - 0.5f, size.height), 1f) }
                .padding(end = 5.dp),
            contentAlignment = Alignment.CenterEnd,
        ) {
            if (lanes.laneCount >= 2 || collapsed) {
                val label = if (collapsed) "Développer les événements sur la journée" else "Réduire les événements sur la journée"
                Box(
                    Modifier
                        .size(22.dp)
                        .pressFill(RoundedCornerShape(6.dp), onClick = onToggleCollapsed)
                        .semantics {
                            contentDescription = label
                            role = Role.Button
                        },
                    contentAlignment = Alignment.Center,
                ) { AllDayChevrons(collapsed) }
            }
        }
        Box(
            Modifier
                .weight(1f)
                .height(rowHeight * rows.visibleRows)
                .clipToBounds()
                // Le bord gauche de chaque cellule de jour : `rgba(105,109,134,.24)`.
                .drawBehind {
                    val columnWidth = size.width / dayCount
                    val first = floor(state.offsetDays).toInt()
                    for (i in first..first + dayCount + 1) {
                        val x = (i - state.offsetDays) * columnWidth
                        if (x in 0f..size.width) drawLine(Neo.AllDayCellBorder, Offset(x + 0.5f, 0f), Offset(x + 0.5f, size.height), 1f)
                    }
                }
                .onSizeChanged { ix.bandHeightPx = it.height.toFloat() }
                .pointerInput(state, ix, lanes, collapsed, hiddenByIndex, rows) {
                    val slop = viewConfiguration.touchSlop
                    val rowPx = ROW_HEIGHT.toPx()
                    // La barre sous le doigt (position dans la bande, défilement de la bande compris), si elle est visible.
                    fun barAt(position: Offset): DisplayEvent? {
                        val columnWidth = state.columnWidthPx
                        val x = position.x
                        val y = position.y + bandScroll.value
                        return lanes.bars.lastOrNull { bar ->
                            val left = (occurrences.fromDay + bar.startIdx - state.origin - state.offsetDays) * columnWidth
                            val covered = (bar.startIdx..bar.startIdx + bar.span - 1)
                            x >= left && x <= left + bar.span * columnWidth &&
                                y >= bar.lane * rowPx && y < (bar.lane + 1) * rowPx &&
                                (!collapsed || bar.lane < rows.visibleRows) && covered.none { it in hiddenByIndex }
                        }?.let { byId[it.event.id] }
                    }
                    awaitEachGesture {
                        // La barre (`clickable`) consomme déjà l'appui : sans `requireUnconsumed` le geste la voit quand même.
                        val down = awaitFirstDown(requireUnconsumed = false)
                        val gliding = state.isGliding
                        val hit = if (gliding) null else barAt(down.position)
                        fun createHere() {
                            val day = state.origin + floor(state.offsetDays + down.position.x / state.columnWidthPx).toLong()
                            onCreateAllDay(java.time.LocalDate.ofEpochDay(day))
                        }
                        val first = withTimeoutOrNull(LONG_PRESS_MS) { waitForTapOrMove(down, slop) }
                        if (first == Phase.Moved) return@awaitEachGesture
                        if (first == Phase.Up) {
                            // Un appui sur une barre est celui de la barre ; sur le vide, il crée.
                            if (!gliding && hit == null) createHere()
                            return@awaitEachGesture
                        }
                        // Appui long : une barre qu'on peut déplacer la saisit, sinon le geste reste un appui.
                        if (gliding) return@awaitEachGesture
                        if (hit == null || !hit.editable) {
                            if (waitForTapOrMove(down, slop) == Phase.Up && hit == null) createHere()
                            return@awaitEachGesture
                        }
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        // Le doigt se mesure depuis le haut du corps de la grille : la bande est juste au-dessus, donc négatif.
                        fun inBody(position: Offset) = Offset(position.x, position.y - size.height)
                        ix.startBandDrag(hit, inBody(down.position))
                        try {
                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                                change.consume()
                                if (!change.pressed) {
                                    ix.finishDrag()
                                    return@awaitEachGesture
                                }
                                ix.dragTo(inBody(change.position))
                            }
                        } finally {
                            if (ix.drag != null) ix.cancelDrag()
                        }
                    }
                }
                .verticalScroll(bandScroll, enabled = rows.contentRows > rows.visibleRows),
        ) {
            Box(Modifier.fillMaxWidth().height(rowHeight * rows.contentRows)) {
                val visibleBars by remember(lanes, collapsed, hiddenByIndex) {
                    derivedStateOf {
                        val low = firstDay - occurrences.fromDay - 1
                        val high = firstDay - occurrences.fromDay + dayCount + 2
                        lanes.bars.filter { bar ->
                            val end = bar.startIdx + bar.span - 1
                            end >= low && bar.startIdx <= high &&
                                // Un badge « N événements » couvre son jour : les barres dessous ne se peignent plus.
                                (hiddenByIndex.isEmpty() || (bar.startIdx..end).none { it in hiddenByIndex }) &&
                                (!collapsed || bar.lane < rows.visibleRows)
                        }
                    }
                }
                AllDayBars(state, dayCount, occurrences.fromDay, visibleBars, byId, rowHeight.value, ix.movingId, onEventClick, onToggleTask)
                ix.allDayPreview?.let { DropPreview(state, it, ix.zone, rowHeight.value) }
                if (hiddenByIndex.isNotEmpty()) {
                    // Le badge couvre la seule rangée visible (le contenu, lui, garde toutes ses rangées sous le repli).
                    DayColumns(state, dayCount, Modifier.fillMaxWidth().height(rowHeight)) { day ->
                        val count = hiddenByIndex[(day - occurrences.fromDay).toInt()]
                        if (count != null) {
                            // Le badge couvre la case du jour, texte centré ; un appui déplie toute la bande.
                            Box(
                                Modifier
                                    .fillMaxSize()
                                    .pressFill(RoundedCornerShape(0.dp), fill = Neo.Hover, onClick = onToggleCollapsed),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "$count événements",
                                    color = Neo.TextSecondary,
                                    fontSize = 11.sp,
                                    lineHeight = 11.sp,
                                    maxLines = 1,
                                    softWrap = false,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AllDayBars(
    state: GridState,
    dayCount: Int,
    fromDay: Long,
    bars: List<AllDayLaneBar>,
    byId: Map<String, DisplayEvent>,
    rowHeightDp: Float,
    movingId: String?,
    onEventClick: (DisplayEvent) -> Unit,
    onToggleTask: (DisplayEvent) -> Unit,
) {
    Layout(
        content = {
            for (bar in bars) key(bar.event.id) { AllDayBarView(byId[bar.event.id], bar.event.id == movingId, onEventClick, onToggleTask) }
        },
        modifier = Modifier.fillMaxSize(),
    ) { measurables, c ->
        val columnWidth = c.maxWidth.toFloat() / dayCount
        val rowPx = rowHeightDp.dp.toPx()
        val vgap = EVENT_VGAP.dp.toPx()
        val gap = (OVERLAP_COL_GAP + 1).dp.toPx()
        val margin = 5.dp.toPx()
        val placeables = measurables.mapIndexed { i, m ->
            val bar = bars[i]
            val width = maxOf(bar.span * columnWidth - gap, 8.dp.toPx())
            m.measure(Constraints.fixed(width.roundToInt(), (rowPx - vgap).roundToInt()))
        }
        layout(c.maxWidth, c.maxHeight) {
            placeables.forEachIndexed { i, p ->
                val bar = bars[i]
                val x = ((fromDay + bar.startIdx - state.origin - state.offsetDays) * columnWidth + margin).roundToInt()
                p.place(x, (bar.lane * rowPx + vgap / 2).roundToInt())
            }
        }
    }
}

@Composable
private fun AllDayBarView(display: DisplayEvent?, dimmed: Boolean, onEventClick: (DisplayEvent) -> Unit, onToggleTask: (DisplayEvent) -> Unit) {
    val accent = remember(display?.color) { parseCalendarColor(display?.color ?: "#658ff2") }
    val surface = Neo.Surface
    val fill = remember(accent, surface) { accent.copy(alpha = 0.15f).compositeOver(surface) }
    val shape = RoundedCornerShape(4.dp)
    // `nc-allday-bar-in` : la barre apparaît en 0,22 s (`cubic-bezier(.215,.61,.355,1)`).
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) { appear.animateTo(1f, tween(220, easing = CubicBezierEasing(0.215f, 0.61f, 0.355f, 1f))) }
    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = appear.value * (if (dimmed) PENDING_DIM else 1f) }
            .cssShadow(offsetY = 5.dp, blur = 14.dp, color = Color.Black.copy(alpha = 0.18f), radius = 4.dp)
            .background(fill, shape)
            .clip(shape)
            .then(if (display != null) Modifier.clickable { onEventClick(display) } else Modifier)
            .drawBehind { drawRect(accent, size = Size(4.dp.toPx(), size.height)) }
            .padding(start = 11.dp, end = 7.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (display != null && display.isTask) {
                val done = display.taskStatus == "complete"
                TaskCheck(done, if (done) Neo.TextSecondary else Neo.Text, display.editable) { onToggleTask(display) }
            }
            Text(
                display?.title.orEmpty(),
                color = Neo.Text,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textDecoration = if (display?.isTask == true && display.taskStatus == "complete") TextDecoration.LineThrough else null,
            )
        }
    }
}

/**
 * La barre visée par un déplacement qui monte sur la bande (ou en attente de relecture après un lâcher sur elle) : sur la
 * première ligne, un jour par colonne couverte, aux couleurs du bloc fantôme de la grille.
 */
@Composable
private fun DropPreview(state: GridState, slot: com.ahmed.neocalendar.core.grid.DropSlot, zone: java.time.ZoneId, rowHeightDp: Float) {
    val first = slot.start.atZone(zone).toLocalDate().toEpochDay()
    val last = slot.end.atZone(zone).toLocalDate().toEpochDay() - 1
    val span = (last - first + 1).coerceAtLeast(1)
    val density = androidx.compose.ui.platform.LocalDensity.current
    val shape = RoundedCornerShape(4.dp)
    Box(
        Modifier
            .offset {
                val x = (first - state.origin - state.offsetDays) * state.columnWidthPx + 5.dp.toPx()
                androidx.compose.ui.unit.IntOffset(x.roundToInt(), with(density) { (EVENT_VGAP.dp / 2).roundToPx() })
            }
            .width(with(density) { (span * state.columnWidthPx - (OVERLAP_COL_GAP + 1).dp.toPx()).coerceAtLeast(8.dp.toPx()).toDp() })
            .height(rowHeightDp.dp - EVENT_VGAP.dp)
            .background(Neo.Accent.copy(alpha = 0.35f).compositeOver(Neo.Surface), shape)
            .border(1.5.dp, Neo.Accent, shape),
    )
}

/**
 * Les deux chevrons du bouton de repli (`AllDayCollapseChevrons`, `Icons.tsx:257`) : dessinés pointant vers le haut,
 * celui qui doit regarder ailleurs fait un demi-tour sur son propre centre en 0,22 s, et ils s'écartent d'un pas à
 * l'ouverture.
 */
@Composable
private fun AllDayChevrons(collapsed: Boolean) {
    val open by animateFloatAsState(
        if (collapsed) 0f else 1f,
        tween(220, easing = CubicBezierEasing(0.215f, 0.61f, 0.355f, 1f)),
        label = "allday-chevrons",
    )
    val color = Neo.TextFaint
    Canvas(Modifier.size(14.dp)) {
        val unit = size.width / 24f
        val stroke = Stroke(2.6f * unit, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun caret(topY: Float, centerY: Float, turn: Float, shift: Float) {
            withTransform({
                translate(0f, shift * unit)
                rotate(turn, Offset(12f * unit, centerY * unit))
            }) {
                val path = Path().apply {
                    moveTo(7f * unit, (topY + 4.5f) * unit)
                    lineTo(12f * unit, topY * unit)
                    lineTo(17f * unit, (topY + 4.5f) * unit)
                }
                drawPath(path, color, style = stroke)
            }
        }
        // Replié : les chevrons regardent vers l'extérieur ; déplié : l'un vers l'autre.
        caret(5f, 7.25f, 180f * open, -1f + 2f * open)
        caret(14.5f, 16.75f, 180f * (1f - open), 1f - 2f * open)
    }
}
