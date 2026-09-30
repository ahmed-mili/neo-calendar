package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.AnimationState
import androidx.compose.animation.core.DecayAnimationSpec
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDecay
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitTouchSlopOrCancellation
import androidx.compose.foundation.gestures.drag
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import com.ahmed.neocalendar.core.grid.nearestDay
import com.ahmed.neocalendar.core.grid.snapTargetDay
import com.ahmed.neocalendar.core.layout.MAX_HOUR_HEIGHT
import com.ahmed.neocalendar.core.layout.MIN_HOUR_HEIGHT
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Les pixels d'un jour de 24 heures, pour le défilement vertical. */
private const val HOURS = 24

/**
 * Où regarde la grille : le jour en tête (fractionnaire pendant un glissé), le
 * défilement vertical et la hauteur d'heure. Les positions sont des états
 * lus seulement à la mise en page et au dessin : glisser ne recompose rien.
 *
 * La position horizontale est comptée en jours depuis `origin`, pour garder les
 * flottants petits (un numéro de jour epoch ferait perdre le pixel).
 */
@Stable
class GridState(
    val origin: Long,
    offsetDays: Float = 0f,
    scrollY: Float = -1f,
    hourHeightDp: Float = Neo.HOUR_HEIGHT_REST,
) {
    var offsetDays by mutableFloatStateOf(offsetDays)
    var scrollY by mutableFloatStateOf(scrollY)
    var hourHeightDp by mutableFloatStateOf(hourHeightDp)

    /** Posés par la mise en page. */
    var density = 1f
    var columnWidthPx = 1f
    var viewportHeightPx by mutableFloatStateOf(0f)

    /** L'heure qu'il est, rafraîchie chaque minute : la ligne de l'heure actuelle la lit. */
    var nowMillis by mutableLongStateOf(System.currentTimeMillis())

    private var horizontalJob: Job? = null
    private var verticalJob: Job? = null

    val hourPx: Float get() = hourHeightDp * density
    val maxScroll: Float get() = maxOf(0f, HOURS * hourPx - viewportHeightPx)
    val clampedScrollY: Float get() = scrollY.coerceIn(0f, maxScroll)

    /** Le jour (epoch) le plus proche de la tête de grille : celui que disent le mois et la semaine. */
    val nearestDayEpoch: Long get() = origin + nearestDay(offsetDays.toDouble())
    val firstDayEpoch: Long get() = origin + floor(offsetDays).toLong()

    /** Un élan ou un calage est en cours : un appui posé dessus est un frein, pas une visée. */
    val isGliding: Boolean get() = horizontalJob?.isActive == true || verticalJob?.isActive == true

    fun cancelAnimations() {
        horizontalJob?.cancel()
        verticalJob?.cancel()
    }

    fun dragX(deltaPx: Float) {
        offsetDays -= deltaPx / columnWidthPx
    }

    fun dragY(deltaPx: Float) {
        scrollY = (clampedScrollY - deltaPx).coerceIn(0f, maxScroll)
    }

    /** Pincer : la hauteur d'heure suit l'écart des doigts, et l'heure sous leur milieu ne bouge pas. */
    fun zoom(factor: Float, centroidY: Float) {
        val oldPx = hourPx
        val newDp = (hourHeightDp * factor).coerceIn(MIN_HOUR_HEIGHT.toFloat(), MAX_HOUR_HEIGHT.toFloat())
        if (newDp == hourHeightDp) return
        val hourUnderFingers = (clampedScrollY + centroidY) / oldPx
        hourHeightDp = newDp
        scrollY = (hourUnderFingers * hourPx - centroidY).coerceIn(0f, maxScroll)
    }

    /** Se pose à l'heure qui précède maintenant d'une heure, une fois la hauteur de la vue connue. */
    fun initialScrollIfNeeded(hourOfDay: Float) {
        if (scrollY >= 0f || viewportHeightPx <= 0f) return
        scrollY = ((hourOfDay - 1f) * hourPx).coerceIn(0f, maxScroll)
    }

    /** Au lâcher hors défilement libre : un jour exactement, dans le sens du geste. */
    fun settleToDay(scope: CoroutineScope, startIdx: Long, startOffset: Float, velocityPxPerSec: Float) {
        val velocityDays = -velocityPxPerSec / columnWidthPx
        val target = snapTargetDay(startIdx, (offsetDays - startOffset).toDouble(), velocityDays.toDouble())
        animateOffsetTo(scope, target.toFloat(), velocityDays)
    }

    fun flingFree(scope: CoroutineScope, velocityPxPerSec: Float, decay: DecayAnimationSpec<Float>) {
        horizontalJob?.cancel()
        horizontalJob = scope.launch {
            val state = AnimationState(initialValue = offsetDays * columnWidthPx, initialVelocity = -velocityPxPerSec)
            state.animateDecay(decay) { offsetDays = value / columnWidthPx }
        }
    }

    fun flingY(scope: CoroutineScope, velocityPxPerSec: Float, decay: DecayAnimationSpec<Float>) {
        verticalJob?.cancel()
        verticalJob = scope.launch {
            val state = AnimationState(initialValue = clampedScrollY, initialVelocity = -velocityPxPerSec)
            state.animateDecay(decay) {
                val clamped = value.coerceIn(0f, maxScroll)
                scrollY = clamped
                if (clamped != value) cancelAnimation()
            }
        }
    }

    fun animateOffsetTo(scope: CoroutineScope, targetIdx: Float, velocityDays: Float = 0f) {
        horizontalJob?.cancel()
        horizontalJob = scope.launch {
            animate(
                initialValue = offsetDays,
                targetValue = targetIdx,
                initialVelocity = velocityDays,
                animationSpec = tween(durationMillis = 260, easing = FastOutSlowInEasing),
            ) { value, _ -> offsetDays = value }
        }
    }

    /** Va à un jour : glisse si c'est proche, saute sinon (une animation sur des mois n'apprend rien). */
    fun goTo(scope: CoroutineScope, day: LocalDate) {
        val idx = (day.toEpochDay() - origin).toFloat()
        horizontalJob?.cancel()
        if (abs(idx - offsetDays) <= 10f) animateOffsetTo(scope, idx) else offsetDays = idx
    }

    companion object {
        val Saver: Saver<GridState, Any> = listSaver(
            save = { listOf(it.origin, it.offsetDays, it.scrollY, it.hourHeightDp) },
            restore = { GridState(it[0] as Long, it[1] as Float, it[2] as Float, it[3] as Float) },
        )
    }
}

/**
 * Le glissé de la grille. Le premier mouvement qui dépasse le seuil choisit
 * l'axe et le garde jusqu'au lâcher. Horizontal : un jour exactement, ou
 * défilement libre (les préférences). Vertical : défilement avec élan.
 *
 * Un appui sans mouvement n'est pas consommé : les évènements le reçoivent.
 */
fun Modifier.gridDrag(
    state: GridState,
    scope: CoroutineScope,
    freeScroll: Boolean,
    vertical: Boolean,
    decay: DecayAnimationSpec<Float>,
): Modifier = pointerInput(state, freeScroll, vertical) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        state.cancelAnimations()
        val startOffset = state.offsetDays
        val startIdx = nearestDay(startOffset.toDouble())
        var overSlop = Offset.Zero
        var ignored = false
        val slop = awaitTouchSlopOrCancellation(down.id) { change, over ->
            overSlop = over
            if (abs(over.x) > abs(over.y) || vertical) change.consume() else ignored = true
        }
        if (slop == null || ignored) return@awaitEachGesture
        val horizontal = abs(overSlop.x) > abs(overSlop.y)
        val tracker = VelocityTracker()
        tracker.addPosition(slop.uptimeMillis, slop.position)
        if (horizontal) state.dragX(overSlop.x) else state.dragY(overSlop.y)
        val released = drag(slop.id) { change ->
            tracker.addPosition(change.uptimeMillis, change.position)
            val delta = change.positionChange()
            if (horizontal) state.dragX(delta.x) else state.dragY(delta.y)
            change.consume()
        }
        val velocity = if (released) tracker.calculateVelocity() else null
        if (horizontal) {
            if (freeScroll) {
                if (velocity != null) state.flingFree(scope, velocity.x, decay)
            } else {
                state.settleToDay(scope, startIdx, startOffset, velocity?.x ?: 0f)
            }
        } else if (velocity != null) {
            state.flingY(scope, velocity.y, decay)
        }
    }
}

/**
 * Deux doigts changent la hauteur d'heure. Lu avant les enfants : dès que le
 * second doigt se pose, les événements sont consommés et le glissé à un doigt
 * s'annule de lui-même.
 */
fun Modifier.gridPinch(state: GridState): Modifier = pointerInput(state) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        var lastSpan = 0f
        do {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            val pressed = event.changes.filter { it.pressed }
            if (pressed.size >= 2) {
                val a = pressed[0].position
                val b = pressed[1].position
                val span = hypot(a.x - b.x, a.y - b.y)
                if (lastSpan > 0f && span > 0f) state.zoom(span / lastSpan, (a.y + b.y) / 2f)
                lastSpan = span
                event.changes.forEach { it.consume() }
            } else {
                lastSpan = 0f
            }
        } while (event.changes.any { it.pressed })
    }
}
