package com.ahmed.neocalendar.nativeapp.ui

import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.grid.DaySegment
import com.ahmed.neocalendar.core.grid.MovedSlot
import com.ahmed.neocalendar.core.grid.ResizeEdge
import com.ahmed.neocalendar.core.grid.dayShiftFromAnchor
import com.ahmed.neocalendar.core.grid.draftSlotAt
import com.ahmed.neocalendar.core.grid.movedSlot
import com.ahmed.neocalendar.core.grid.resizedSlot
import com.ahmed.neocalendar.core.grid.segmentForDay
import com.ahmed.neocalendar.core.grid.snappedMinutes
import com.ahmed.neocalendar.core.layout.OVERLAP_COL_GAP
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/*
 * Les gestes qui écrivent : appui sur un créneau vide (brouillon), appui long
 * puis glisser (déplacer), double appui puis poignées (redimensionner).
 * Ils se posent sur le corps de la grille, AU-DESSUS des colonnes : un appui
 * sans mouvement n'est pas consommé, un glissé qui dépasse le seuil avant
 * l'appui long rend la main au défilement.
 */

/** Appui long avant un déplacement (inventaire §1). */
private const val LONG_PRESS_MS = 220L

/** Deux appuis sur le même bloc plus rapprochés que cela : le double appui. */
private const val DOUBLE_TAP_MS = 340L

/** Ce que la grille demande à l'écran qui la porte ; l'écriture et la fiche vivent plus haut. */
class GridActions(
    val onOpen: (DisplayEvent) -> Unit,
    val onCreate: (LocalDateTime, LocalDateTime) -> Unit,
    val onCreateAllDay: (LocalDate) -> Unit,
    /** `onFailed` : l'écriture a échoué, le créneau dessiné en attente doit disparaître. */
    val onReschedule: (event: DisplayEvent, start: Instant, end: Instant, resize: Boolean, onFailed: () -> Unit) -> Unit,
    val onToggleTask: (DisplayEvent) -> Unit,
)

/** Un bloc posé dans la colonne d'un jour : où il est, en pixels du contenu de la colonne. */
class BlockRect(val event: DisplayEvent, val segment: DaySegment, val x: Float, val y: Float, val width: Float, val height: Float) {
    fun contains(px: Float, py: Float) = px >= x && px <= x + width && py >= y && py <= y + height
}

/** Un déplacement en cours : ce que le doigt a saisi, et où il est. */
@Stable
class MoveDrag(val event: DisplayEvent, val grabDay: Long, val grabFraction: Double, val grabContentY: Float, pointer: Offset) {
    var pointer by mutableStateOf(pointer)
}

/** Un créneau qui attend que la note écrite revienne du dossier. */
class Landing(val event: DisplayEvent, val slot: MovedSlot)

class ResizePreview(val eventId: String, val start: Instant, val end: Instant)

@Stable
class GridInteraction(val grid: GridState, val zone: ZoneId, private val scope: CoroutineScope) {
    lateinit var actions: GridActions

    /** Les blocs de chaque jour visible, posés par la mise en page. */
    val rects = HashMap<Long, List<BlockRect>>()

    var drag by mutableStateOf<MoveDrag?>(null)
        private set

    /** Le déplacement lâché, affiché en place jusqu'à la relecture du dossier. */
    var landing by mutableStateOf<Landing?>(null)
        private set

    /** Le bloc en mode redimensionnement (deux poignées). */
    var resizeId by mutableStateOf<String?>(null)
        private set
    var resizePreview by mutableStateOf<ResizePreview?>(null)
        private set
    private val usedEdges = HashSet<ResizeEdge>()
    private var resizeBase: DisplayEvent? = null

    /** Le dossier lu au moment où l'écriture est partie ; `current` : celui d'à présent. */
    var pendingData: Any? = null
    var currentData: Any? = null

    private var pendingTap: Pair<String, Long>? = null
    private var pendingJob: Job? = null

    /** L'évènement déplacé ou en attente de relecture : son bloc d'origine s'estompe. */
    val movingId: String? get() = drag?.event?.id ?: landing?.event?.id

    // ── Lecture de la position ──────────────────────────────────────────────

    private fun dayPosition(x: Float): Double = grid.offsetDays + x / grid.columnWidthPx.toDouble()

    fun hitTest(position: Offset): BlockRect? {
        val pos = dayPosition(position.x)
        val idx = floor(pos).toLong()
        val day = grid.origin + idx
        val localX = ((pos - idx) * grid.columnWidthPx).toFloat()
        val contentY = position.y + grid.clampedScrollY
        return rects[day]?.lastOrNull { it.contains(localX, contentY) }
    }

    // ── Touchers ────────────────────────────────────────────────────────────

    fun tapped(hit: BlockRect?, position: Offset) {
        if (hit != null) blockTapped(hit.event) else emptyTapped(position)
    }

    private fun emptyTapped(position: Offset) {
        if (resizeId != null) {
            leaveResizeMode()
            return
        }
        val idx = floor(dayPosition(position.x)).toLong()
        val day = LocalDate.ofEpochDay(grid.origin + idx)
        val (start, end) = draftSlotAt((position.y + grid.clampedScrollY).toDouble(), grid.hourPx.toDouble(), day)
        actions.onCreate(start, end)
    }

    private fun blockTapped(event: DisplayEvent) {
        // Seul un bloc qu'on peut redimensionner attend un éventuel second appui.
        if (!event.editable || event.allDay) {
            actions.onOpen(event)
            return
        }
        val now = SystemClock.uptimeMillis()
        val previous = pendingTap
        if (previous != null && previous.first == event.id && now - previous.second <= DOUBLE_TAP_MS) {
            pendingJob?.cancel()
            pendingTap = null
            // Le double appui est un interrupteur : il entre dans le mode, et en sort.
            if (resizeId == event.id) leaveResizeMode() else enterResizeMode(event.id)
            return
        }
        pendingJob?.cancel()
        pendingTap = event.id to now
        pendingJob = scope.launch {
            delay(DOUBLE_TAP_MS)
            pendingTap = null
            actions.onOpen(event)
        }
    }

    private fun enterResizeMode(id: String) {
        usedEdges.clear()
        resizePreview = null
        resizeId = id
    }

    private fun leaveResizeMode() {
        usedEdges.clear()
        resizeId = null
    }

    // ── Déplacer ────────────────────────────────────────────────────────────

    fun canDrag(hit: BlockRect): Boolean = hit.event.editable && !hit.event.allDay && resizeId != hit.event.id

    fun startDrag(hit: BlockRect, position: Offset) {
        grid.cancelAnimations()
        val pos = dayPosition(position.x)
        val idx = floor(pos)
        drag = MoveDrag(hit.event, grid.origin + idx.toLong(), pos - idx, position.y + grid.clampedScrollY, position)
    }

    fun dragTo(position: Offset) {
        drag?.pointer = position
    }

    /** Où le déplacement en cours atterrirait : jours visés, puis heure au quart d'heure. */
    fun slotOf(d: MoveDrag): MovedSlot {
        val pos = dayPosition(d.pointer.x)
        val idx = floor(pos)
        val shift = dayShiftFromAnchor(d.grabDay, d.grabFraction, grid.origin + idx.toLong(), pos - idx)
        val deltaY = (d.pointer.y + grid.clampedScrollY) - d.grabContentY
        return movedSlot(d.event.start, d.event.end, shift, snappedMinutes(deltaY.toDouble(), grid.hourPx.toDouble()), zone)
    }

    fun finishDrag() {
        val d = drag ?: return
        val slot = slotOf(d)
        drag = null
        if (slot.start == d.event.start && slot.end == d.event.end) return
        landing = Landing(d.event, slot)
        pendingData = currentData
        actions.onReschedule(d.event, slot.start, slot.end, false, ::clearPending)
    }

    fun cancelDrag() {
        drag = null
    }

    // ── Redimensionner ──────────────────────────────────────────────────────

    /** Une poignée tirée de `totalDy` pixels depuis sa prise ; le bord reste dans le jour de son segment. */
    fun resizeDrag(shownEvent: DisplayEvent, day: Long, edge: ResizeEdge, totalDy: Float) {
        // Le bloc dessiné porte déjà l'aperçu : le geste se mesure depuis le bloc tel qu'il était à la prise.
        val event = resizeBase ?: shownEvent.also { resizeBase = it }
        val minutes = snappedMinutes(totalDy.toDouble(), grid.hourPx.toDouble())
        var slot = resizedSlot(event.start, event.end, edge, minutes)
        val date = LocalDate.ofEpochDay(day)
        val dayStart = date.atStartOfDay(zone).toInstant()
        val dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant()
        slot = if (edge == ResizeEdge.Top) MovedSlot(maxOf(slot.start, dayStart), slot.end) else MovedSlot(slot.start, minOf(slot.end, dayEnd))
        resizePreview = ResizePreview(event.id, slot.start, slot.end)
    }

    fun resizeEnd(edge: ResizeEdge) {
        val event = resizeBase ?: return
        resizeBase = null
        val preview = resizePreview
        if (preview == null || preview.eventId != event.id) return
        if (preview.start == event.start && preview.end == event.end) {
            resizePreview = null
            return
        }
        pendingData = currentData
        actions.onReschedule(event, preview.start, preview.end, true, ::clearPending)
        // Un évènement se règle par ses deux bouts : le mode se ferme quand les deux ont été tirés.
        usedEdges += edge
        if (usedEdges.size == ResizeEdge.entries.size) leaveResizeMode()
    }

    fun resizeCancel() {
        resizeBase = null
        resizePreview = null
    }

    /** Le bloc tel qu'il se dessine : un redimensionnement en attente remplace ses heures. */
    fun shown(event: DisplayEvent): DisplayEvent {
        val preview = resizePreview
        return if (preview != null && preview.eventId == event.id) event.copy(start = preview.start, end = preview.end) else event
    }

    /** L'écriture est revenue (ou a échoué) : plus rien n'attend. */
    fun clearPending() {
        landing = null
        resizePreview = null
        pendingData = null
    }

    val hasPending: Boolean get() = landing != null || resizePreview != null
}

private sealed interface Phase {
    data object Moved : Phase
    data object Up : Phase
}

/** Attend la fin du toucher ou son départ en glissé ; un évènement déjà consommé ou un second doigt l'annule. */
private suspend fun AwaitPointerEventScope.waitForTapOrMove(down: PointerInputChange, slop: Float): Phase {
    while (true) {
        val event = awaitPointerEvent()
        val change = event.changes.firstOrNull { it.id == down.id } ?: return Phase.Moved
        if (event.changes.any { it.isConsumed } || event.changes.count { it.pressed } > 1) return Phase.Moved
        if (!change.pressed) return Phase.Up
        if ((change.position - down.position).getDistance() > slop) return Phase.Moved
    }
}

fun Modifier.gridTouch(ix: GridInteraction, haptic: HapticFeedback): Modifier = pointerInput(ix) {
    val slop = viewConfiguration.touchSlop
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = true)
        // Un doigt posé sur une grille qui glisse encore la freine : il ne vise rien.
        val gliding = ix.grid.isGliding
        val hit = if (gliding) null else ix.hitTest(down.position)
        val first = withTimeoutOrNull(LONG_PRESS_MS) { waitForTapOrMove(down, slop) }
        if (first == Phase.Moved) return@awaitEachGesture
        if (first == Phase.Up) {
            if (!gliding) ix.tapped(hit, down.position)
            return@awaitEachGesture
        }
        // Appui long.
        if (gliding) return@awaitEachGesture
        if (hit == null || !ix.canDrag(hit)) {
            if (waitForTapOrMove(down, slop) == Phase.Up) ix.tapped(hit, down.position)
            return@awaitEachGesture
        }
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        ix.startDrag(hit, down.position)
        try {
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                change.consume()
                if (!change.pressed) {
                    ix.finishDrag()
                    return@awaitEachGesture
                }
                ix.dragTo(change.position)
            }
        } finally {
            if (ix.drag != null) ix.cancelDrag()
        }
    }
}

// ── Ce qui se dessine par-dessus les colonnes ───────────────────────────────

private class Ghost(val event: DisplayEvent, val slot: MovedSlot)

/**
 * Le créneau visé par un déplacement (ou posé en attendant la relecture), un
 * bloc par jour touché. Le glissé près d'un bord fait défiler la grille.
 */
@Composable
fun MoveGhost(ix: GridInteraction, dayCount: Int, timeFormat24h: Boolean, modifier: Modifier = Modifier) {
    val grid = ix.grid
    val ghost by remember(ix) {
        derivedStateOf {
            val d = ix.drag
            if (d != null) Ghost(d.event, ix.slotOf(d)) else ix.landing?.let { Ghost(it.event, it.slot) }
        }
    }
    val dragging = ix.drag != null
    val density = LocalDensity.current

    // Près d'un bord, la grille défile sous le doigt : deux colonnes par seconde en travers, 400 dp/s en hauteur.
    LaunchedEffect(dragging) {
        if (!dragging) return@LaunchedEffect
        val edge = with(density) { 44.dp.toPx() }
        val verticalSpeed = with(density) { 400.dp.toPx() }
        var last = 0L
        while (true) {
            val now = androidx.compose.runtime.withFrameNanos { it }
            val dt = if (last == 0L) 0f else (now - last) / 1_000_000_000f
            last = now
            val d = ix.drag ?: break
            val width = grid.columnWidthPx * dayCount
            val x = d.pointer.x
            val y = d.pointer.y
            if (x < edge) grid.offsetDays -= 2f * dt
            else if (x > width - edge) grid.offsetDays += 2f * dt
            if (y < edge) grid.scrollY = (grid.clampedScrollY - verticalSpeed * dt).coerceIn(0f, grid.maxScroll)
            else if (y > grid.viewportHeightPx - edge) grid.scrollY = (grid.clampedScrollY + verticalSpeed * dt).coerceIn(0f, grid.maxScroll)
        }
    }

    val shown = ghost ?: return
    val segments = remember(shown.slot) {
        val first = shown.slot.start.atZone(ix.zone).toLocalDate()
        val lastInstant = if (shown.slot.end > shown.slot.start) shown.slot.end.minusMillis(1) else shown.slot.start
        val last = lastInstant.atZone(ix.zone).toLocalDate()
        generateSequence(first) { if (it < last) it.plusDays(1) else null }
            .mapNotNull { date -> segmentForDay(shown.slot.start, shown.slot.end, date, ix.zone)?.let { date.toEpochDay() to it } }
            .toList()
    }
    val accent = remember(shown.event.color) { parseCalendarColor(shown.event.color) }
    val time = remember(shown.slot, timeFormat24h) {
        "${formatClock(shown.slot.start, ix.zone, timeFormat24h)} – ${formatClock(shown.slot.end, ix.zone, timeFormat24h)}"
    }
    Layout(
        content = {
            for ((day, segment) in segments) key(day) { GhostBlock(shown.event.title, time, accent, segment) }
        },
        modifier = modifier.fillMaxSize().clipToBounds(),
    ) { measurables, c ->
        val columnWidth = c.maxWidth.toFloat() / dayCount
        val gap = OVERLAP_COL_GAP.dp.toPx()
        val margin = 4.dp.toPx()
        val minHeight = 14.dp.toPx()
        val placeables = measurables.mapIndexed { i, m ->
            val height = maxOf(segments[i].second.durationHours.toFloat() * grid.hourPx, minHeight)
            m.measure(Constraints.fixed(maxOf(columnWidth - gap, 8.dp.toPx()).roundToInt(), height.roundToInt()))
        }
        layout(c.maxWidth, c.maxHeight) {
            placeables.forEachIndexed { i, p ->
                val (day, segment) = segments[i]
                val x = (day - grid.origin - grid.offsetDays) * columnWidth + margin
                val y = segment.topHours.toFloat() * grid.hourPx - grid.clampedScrollY
                p.place(x.roundToInt(), y.roundToInt())
            }
        }
    }
}

@Composable
private fun GhostBlock(title: String, time: String, accent: Color, segment: DaySegment) {
    val shape = RoundedCornerShape(4.dp)
    val short = segment.durationHours * 60 <= 40
    Box(
        Modifier
            .fillMaxSize()
            .shadow(8.dp, shape)
            .background(accent.copy(alpha = 0.55f).compositeOver(Neo.Surface), shape)
            .border(1.5.dp, accent, shape)
            .padding(start = 8.dp, end = 6.dp, top = if (short) 1.dp else 4.dp),
    ) {
        Column {
            Text(title, color = Neo.Text, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = if (short) 1 else 4, overflow = TextOverflow.Ellipsis)
            if (!short) Text(time, color = Neo.Text, fontSize = 11.sp, maxLines = 1, softWrap = false)
        }
    }
}
