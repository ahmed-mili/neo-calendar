package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.core.grid.ResizeEdge
import com.ahmed.neocalendar.core.grid.resizedSlot
import com.ahmed.neocalendar.core.grid.snappedMinutes
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId
import kotlin.math.roundToInt

/** Le côté d'une poignée (14 dp, bord 2 dp) et de sa zone tactile (44 dp). */
private val HANDLE = 14.dp
private val HANDLE_TOUCH = 44.dp

/**
 * `nc-draft-preview` : le créneau du brouillon, encadré sur la grille (bord 2 dp `#4AABE0`, fond 18 %, rayon 6,
 * `left` et `right` 2 dp) avec deux poignées rondes, en haut à 12 dp du bord gauche et en bas à 12 dp du bord droit. Une
 * poignée tirée redimensionne le brouillon au quart d'heure (`useTimeGridResize.handleDraftResizeStart`) ; l'apparition
 * se fait en fondu de 180 ms.
 */
@Composable
fun DraftPreview(
    ix: GridInteraction,
    start: LocalDateTime,
    end: LocalDateTime,
    onResize: (LocalDateTime, LocalDateTime) -> Unit,
    modifier: Modifier = Modifier,
) {
    val grid = ix.grid
    val zone = ix.zone
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val alpha by animateFloatAsState(if (shown) 1f else 0f, tween(180), label = "draft-fade")
    val day = start.toLocalDate().toEpochDay()
    val topHours = start.hour + start.minute / 60f
    val durationHours = Duration.between(start, end).toMinutes() / 60f
    val currentStart by rememberUpdatedState(start)
    val currentEnd by rememberUpdatedState(end)
    val resize = rememberUpdatedState(onResize)

    Layout(
        content = {
            Box(
                Modifier.fillMaxSize()
                    .background(Neo.DraftFill, RoundedCornerShape(6.dp))
                    .border(2.dp, Neo.Draft, RoundedCornerShape(6.dp)),
            )
            DraftHandle(ResizeEdge.Top, ix, { currentStart }, { currentEnd }, resize)
            DraftHandle(ResizeEdge.Bottom, ix, { currentStart }, { currentEnd }, resize)
        },
        modifier = modifier.fillMaxSize().clipToBounds().graphicsLayer { this.alpha = alpha },
    ) { measurables, c ->
        val columnWidth = grid.columnWidthPx.toFloat()
        val inset = 2.dp.toPx()
        val width = (columnWidth - 2 * inset).roundToInt().coerceAtLeast(1)
        val height = (durationHours * grid.hourPx).roundToInt().coerceAtLeast(1)
        val x = ((day - grid.origin - grid.offsetDays) * columnWidth + inset)
        val y = topHours * grid.hourPx - grid.clampedScrollY
        val box = measurables[0].measure(Constraints.fixed(width, height))
        val touch = HANDLE_TOUCH.roundToPx()
        val top = measurables[1].measure(Constraints.fixed(touch, touch))
        val bottom = measurables[2].measure(Constraints.fixed(touch, touch))
        // Les poignées se posent dans la boîte de remplissage : haut -8 dp / gauche 12 dp, bas -8 dp / droite 12 dp, bord 2 dp déduit.
        val border = 2.dp.toPx()
        val half = HANDLE.toPx() / 2
        val topCx = x + border + 12.dp.toPx() + half
        val topCy = y + border - 8.dp.toPx() + half
        val bottomCx = x + width - border - 12.dp.toPx() - half
        val bottomCy = y + height - border + 8.dp.toPx() - half
        layout(c.maxWidth, c.maxHeight) {
            box.place(x.roundToInt(), y.roundToInt())
            top.place((topCx - touch / 2f).roundToInt(), (topCy - touch / 2f).roundToInt())
            bottom.place((bottomCx - touch / 2f).roundToInt(), (bottomCy - touch / 2f).roundToInt())
        }
    }
}

@Composable
private fun DraftHandle(
    edge: ResizeEdge,
    ix: GridInteraction,
    start: () -> LocalDateTime,
    end: () -> LocalDateTime,
    onResize: androidx.compose.runtime.State<(LocalDateTime, LocalDateTime) -> Unit>,
) {
    Box(
        Modifier.size(HANDLE_TOUCH).pointerInput(edge) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                // La poignée garde le geste : ni la grille (défilement) ni un appui sur un créneau vide n'y touchent.
                down.consume()
                val originalStart = start()
                val originalEnd = end()
                var total = 0f
                while (true) {
                    val event = awaitPointerEvent()
                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                    change.consume()
                    total += change.position.y - change.previousPosition.y
                    val range = resizedRange(ix.zone, originalStart, originalEnd, edge, total, ix.grid.hourPx)
                    onResize.value(range[0], range[1])
                    if (!change.pressed) break
                }
            }
        },
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Box(Modifier.size(HANDLE).background(Neo.Surface, CircleShape).border(2.dp, Neo.Draft, CircleShape))
    }
}

/** Le brouillon dont un bord est tiré de `totalDy` pixels, calé au quart d'heure et gardé dans son jour. */
internal fun resizedRange(
    zone: ZoneId,
    start: LocalDateTime,
    end: LocalDateTime,
    edge: ResizeEdge,
    totalDy: Float,
    hourPx: Float,
): Array<LocalDateTime> {
    val slot = resizedSlot(start.atZone(zone).toInstant(), end.atZone(zone).toInstant(), edge, snappedMinutes(totalDy.toDouble(), hourPx.toDouble()))
    val dayStart = start.toLocalDate().atStartOfDay()
    val dayEnd = dayStart.plusDays(1)
    val newStart = slot.start.atZone(zone).toLocalDateTime().let { if (it < dayStart) dayStart else it }
    val newEnd = slot.end.atZone(zone).toLocalDateTime().let { if (it > dayEnd) dayEnd else it }
    return arrayOf(newStart, newEnd)
}
