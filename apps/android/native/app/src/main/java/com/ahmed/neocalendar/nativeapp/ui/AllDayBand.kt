package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.layout.ALLDAY_MAX_ROWS
import com.ahmed.neocalendar.core.layout.ALLDAY_ROW_HEIGHT
import com.ahmed.neocalendar.core.layout.AllDayLaneBar
import com.ahmed.neocalendar.core.layout.EVENT_VGAP
import com.ahmed.neocalendar.core.layout.OVERLAP_COL_GAP
import com.ahmed.neocalendar.core.layout.allDayBandRows
import com.ahmed.neocalendar.core.layout.hiddenBarCountByDay
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.nativeapp.Occurrences
import kotlin.math.roundToInt

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
    modifier: Modifier = Modifier,
) {
    val lanes = occurrences.lanes
    val rows = allDayBandRows(lanes.laneCount, null, collapsed, ALLDAY_MAX_ROWS)
    val rowHeight = ALLDAY_ROW_HEIGHT.dp
    val firstDay by remember(state) { derivedStateOf { state.firstDayEpoch } }
    val byId = remember(occurrences) { occurrences.allDay.associateBy { it.id } }

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
            .drawBehind { drawLine(Neo.GridLine, Offset(0f, size.height), Offset(size.width, size.height), 1f) },
    ) {
        Box(
            Modifier
                .width(RailWidth)
                .height(rowHeight * rows.visibleRows)
                .then(if (lanes.laneCount >= 2 || collapsed) Modifier.clickable(onClick = onToggleCollapsed) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            if (lanes.laneCount >= 2 || collapsed) {
                Icon(
                    if (collapsed) NeoIcons.ChevronDown else NeoIcons.ChevronUp,
                    contentDescription = if (collapsed) "Afficher les évènements sur la journée" else "Réduire les évènements sur la journée",
                    tint = Neo.TextSecondary,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
        Box(
            Modifier
                .weight(1f)
                .height(rowHeight * rows.visibleRows)
                .clipToBounds()
                .verticalScroll(rememberScrollState(), enabled = rows.contentRows > rows.visibleRows),
        ) {
            Box(Modifier.fillMaxWidth().height(rowHeight * rows.contentRows)) {
                val visibleBars by remember(lanes, collapsed, hiddenByIndex) {
                    derivedStateOf {
                        val low = firstDay - occurrences.fromDay - 1
                        val high = firstDay - occurrences.fromDay + dayCount + 2
                        lanes.bars.filter { bar ->
                            val end = bar.startIdx + bar.span - 1
                            end >= low && bar.startIdx <= high &&
                                // Un badge « N évènements » couvre son jour : les barres dessous ne se peignent plus.
                                (hiddenByIndex.isEmpty() || (bar.startIdx..end).none { it in hiddenByIndex }) &&
                                (!collapsed || bar.lane < rows.visibleRows)
                        }
                    }
                }
                AllDayBars(state, dayCount, occurrences.fromDay, visibleBars, byId, rowHeight.value, onEventClick)
                if (hiddenByIndex.isNotEmpty()) {
                    DayColumns(state, dayCount, Modifier.fillMaxSize()) { day ->
                        val count = hiddenByIndex[(day - occurrences.fromDay).toInt()]
                        if (count != null) {
                            Box(
                                Modifier.fillMaxSize().padding(end = 4.dp).background(Neo.Background),
                                contentAlignment = Alignment.CenterStart,
                            ) {
                                Text(
                                    "$count évènements",
                                    color = Neo.TextSecondary,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    modifier = Modifier.padding(start = 6.dp),
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
    onEventClick: (DisplayEvent) -> Unit,
) {
    Layout(
        content = {
            for (bar in bars) key(bar.event.id) { AllDayBarView(byId[bar.event.id], onEventClick) }
        },
        modifier = Modifier.fillMaxSize(),
    ) { measurables, c ->
        val columnWidth = c.maxWidth.toFloat() / dayCount
        val rowPx = rowHeightDp.dp.toPx()
        val vgap = EVENT_VGAP.dp.toPx()
        val gap = OVERLAP_COL_GAP.dp.toPx()
        val placeables = measurables.mapIndexed { i, m ->
            val bar = bars[i]
            val width = maxOf(bar.span * columnWidth - gap, 8.dp.toPx())
            m.measure(Constraints.fixed(width.roundToInt(), (rowPx - vgap).roundToInt()))
        }
        layout(c.maxWidth, c.maxHeight) {
            placeables.forEachIndexed { i, p ->
                val bar = bars[i]
                val x = ((fromDay + bar.startIdx - state.origin - state.offsetDays) * columnWidth).roundToInt()
                p.place(x, (bar.lane * rowPx + vgap / 2).roundToInt())
            }
        }
    }
}

@Composable
private fun AllDayBarView(display: DisplayEvent?, onEventClick: (DisplayEvent) -> Unit) {
    val accent = remember(display?.color) { parseCalendarColor(display?.color ?: "#658ff2") }
    val fill = remember(accent) { accent.copy(alpha = 0.15f).compositeOver(Neo.Surface) }
    val shape = RoundedCornerShape(4.dp)
    Box(
        Modifier
            .fillMaxSize()
            .background(fill, shape)
            .clip(shape)
            .then(if (display != null) Modifier.clickable { onEventClick(display) } else Modifier)
            .drawBehind { drawRect(accent, size = Size(3.dp.toPx(), size.height)) }
            .padding(start = 9.dp, end = 6.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            display?.title.orEmpty(),
            color = Neo.Text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
