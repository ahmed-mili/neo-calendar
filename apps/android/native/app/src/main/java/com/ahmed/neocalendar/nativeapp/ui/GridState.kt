package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.AnimationState
import androidx.compose.animation.core.DecayAnimationSpec
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDecay
import androidx.compose.animation.core.calculateTargetValue
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.OverscrollEffect
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
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.unit.Velocity
import com.ahmed.neocalendar.core.grid.nearestDay
import com.ahmed.neocalendar.core.grid.SNAP_VELOCITY_DAYS_PER_SECOND
import com.ahmed.neocalendar.core.grid.flingTargetDay
import com.ahmed.neocalendar.core.grid.glideDurationMs
import com.ahmed.neocalendar.core.grid.glideProgress
import com.ahmed.neocalendar.core.grid.glideSlope
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

    /** Sous minuit : 10 dp et l'inset bas, comme le `padding-bottom` de la zone défilante de l'ancienne. */
    var bottomPadPx by mutableFloatStateOf(0f)

    /** L'heure qu'il est, rafraîchie chaque minute : la ligne de l'heure actuelle la lit. */
    var nowMillis by mutableLongStateOf(System.currentTimeMillis())

    private var horizontalJob: Job? = null
    private var verticalJob: Job? = null

    val hourPx: Float get() = hourHeightDp * density
    val maxScroll: Float get() = maxOf(0f, HOURS * hourPx + bottomPadPx - viewportHeightPx)
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

    /**
     * Au premier affichage, `h` heures avant maintenant, `h = clamp(heures visibles x 0,68 ; 3,5 ; 6)` (6 h sur un
     * téléphone, `TimeGrid.tsx:591`), une fois la hauteur de la vue connue.
     */
    fun initialScrollIfNeeded(hourOfDay: Float) {
        if (scrollY >= 0f || viewportHeightPx <= 0f) return
        val visibleHours = viewportHeightPx / hourPx
        val before = (visibleHours * 0.68f).coerceIn(3.5f, 6f)
        scrollY = ((hourOfDay - before) * hourPx).coerceIn(0f, maxScroll)
    }

    /** Vitesse (jours/s) de la glisse à élan en cours, 0 hors glisse. Le glissé la reprend au DOWN. */
    private var glideVelocityDays = 0f

    /** À appeler au DOWN avant `cancelAnimations()` : l'élan que le doigt va peut-être prolonger. */
    fun takeCarriedVelocity(): Float {
        val v = if (horizontalJob?.isActive == true) glideVelocityDays else 0f
        glideVelocityDays = 0f
        return v
    }

    /**
     * Au lâcher hors défilement libre : l'élan du doigt (plus celui d'une glisse reprise, s'il va dans le même sens)
     * est projeté par la décroissance du défilement ; la grille glisse jusqu'à un jour entier, jusqu'à
     * `FLING_MAX_DAYS` plus loin, sans rebond. Trop lent, c'est l'ancien calage sur le jour voisin.
     */
    fun settleToDay(
        scope: CoroutineScope,
        startIdx: Long,
        startOffset: Float,
        velocityPxPerSec: Float,
        decay: DecayAnimationSpec<Float>,
        carriedDaysPerSec: Float,
    ) {
        var v = -velocityPxPerSec / columnWidthPx
        val keepsMomentum = carriedDaysPerSec != 0f && (carriedDaysPerSec > 0f) == (v > 0f) &&
            abs(v) >= SNAP_VELOCITY_DAYS_PER_SECOND
        if (keepsMomentum) v += carriedDaysPerSec
        // La décroissance est réglée pour des pixels : on projette en pixels puis on revient en jours.
        val projected = decay.calculateTargetValue(offsetDays * columnWidthPx, v * columnWidthPx) / columnWidthPx
        val target = flingTargetDay(startIdx, offsetDays.toDouble(), projected.toDouble(), v.toDouble()).toFloat()
        if (abs(v) >= SNAP_VELOCITY_DAYS_PER_SECOND) glideTo(scope, target, v)
        else animateOffsetTo(scope, target)
    }

    /** Doigt levé sans élan ou geste interrompu : jamais entre deux jours. */
    fun settleToNearest(scope: CoroutineScope) {
        if (abs(offsetDays - Math.round(offsetDays)) <= 0.001f) return
        animateOffsetTo(scope, nearestDay(offsetDays.toDouble()).toFloat())
    }

    /** Glisse vers `target` en gardant la vitesse de départ, et s'y pose à vitesse nulle (pas de rebond). */
    private fun glideTo(scope: CoroutineScope, target: Float, velocityDays: Float) {
        horizontalJob?.cancel()
        glideVelocityDays = 0f
        val start = offsetDays
        val d = target - start
        val durationMs = glideDurationMs(d.toDouble(), velocityDays.toDouble())
        if (abs(d) < 0.001f || durationMs < 16) {
            offsetDays = target
            return
        }
        val seconds = durationMs / 1000.0
        val m0 = velocityDays * seconds / d
        horizontalJob = scope.launch {
            try {
                animate(0f, 1f, animationSpec = tween(durationMillis = durationMs, easing = LinearEasing)) { s, _ ->
                    offsetDays = start + d * glideProgress(s.toDouble(), m0).toFloat()
                    glideVelocityDays = (d / seconds * glideSlope(s.toDouble(), m0)).toFloat()
                }
                offsetDays = target
            } finally {
                glideVelocityDays = 0f
            }
        }
    }

    fun flingFree(scope: CoroutineScope, velocityPxPerSec: Float, decay: DecayAnimationSpec<Float>) {
        horizontalJob?.cancel()
        horizontalJob = scope.launch {
            val state = AnimationState(initialValue = offsetDays * columnWidthPx, initialVelocity = -velocityPxPerSec)
            state.animateDecay(decay) { offsetDays = value / columnWidthPx }
        }
    }

    /**
     * L'élan vertical. À une borne il s'arrête ; ce qui lui reste de vitesse part dans l'effet de débordement
     * (l'étirement Android), qui rebondit avec. Sans doigt levé avec vitesse, `velocityPxPerSec` vaut 0 : l'effet
     * est quand même prévenu, il lui faut le lâcher pour se relâcher.
     */
    fun flingY(scope: CoroutineScope, velocityPxPerSec: Float, decay: DecayAnimationSpec<Float>, overscroll: OverscrollEffect?) {
        verticalJob?.cancel()
        verticalJob = scope.launch {
            // Rend la part de vitesse (du doigt) que le défilement a consommée.
            val fling: suspend (Velocity) -> Velocity = { available ->
                var left = 0f
                val anim = AnimationState(initialValue = clampedScrollY, initialVelocity = -available.y)
                anim.animateDecay(decay) {
                    val clamped = value.coerceIn(0f, maxScroll)
                    scrollY = clamped
                    if (clamped != value) {
                        left = velocity
                        cancelAnimation()
                    }
                }
                Velocity(0f, available.y + left)
            }
            if (overscroll == null) fling(Velocity(0f, velocityPxPerSec)) else overscroll.applyToFling(Velocity(0f, velocityPxPerSec), fling)
        }
    }

    /** Un delta de doigt vertical, passé par l'effet de débordement : ce que la grille ne peut plus défiler l'étire. */
    fun pullY(deltaPx: Float, overscroll: OverscrollEffect?) {
        if (overscroll == null) {
            dragY(deltaPx)
            return
        }
        overscroll.applyToScroll(Offset(0f, deltaPx), NestedScrollSource.UserInput) { d ->
            val before = clampedScrollY
            dragY(d.y)
            Offset(0f, before - clampedScrollY)
        }
    }

    fun animateOffsetTo(scope: CoroutineScope, targetIdx: Float, velocityDays: Float = 0f) {
        horizontalJob?.cancel()
        glideVelocityDays = 0f
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
 * l'axe et le garde jusqu'au lâcher. Horizontal : un lancer garde l'élan du
 * doigt, parcourt plusieurs jours selon sa force et se pose sur un jour entier
 * sans rebond ; un lancer enchaîné reprend l'élan de la glisse en cours ; ou
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
    overscroll: OverscrollEffect? = null,
): Modifier = pointerInput(state, freeScroll, vertical, overscroll) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        // L'élan se lit avant l'arrêt net : un lancer enchaîné s'y ajoute.
        val carried = state.takeCarriedVelocity()
        state.cancelAnimations()
        val startOffset = state.offsetDays
        val startIdx = nearestDay(startOffset.toDouble())
        var overSlop = Offset.Zero
        var ignored = false
        val slop = awaitTouchSlopOrCancellation(down.id) { change, over ->
            overSlop = over
            if (abs(over.x) > abs(over.y) || vertical) change.consume() else ignored = true
        }
        if (slop == null || ignored) {
            // Un doigt posé sur une glisse ne la laisse pas entre deux jours.
            if (!freeScroll) state.settleToNearest(scope)
            return@awaitEachGesture
        }
        val horizontal = abs(overSlop.x) > abs(overSlop.y)
        val tracker = VelocityTracker()
        tracker.addPosition(slop.uptimeMillis, slop.position)
        // Une glisse horizontale interrompue par un geste vertical se pose sur son jour.
        if (!horizontal && !freeScroll) state.settleToNearest(scope)
        if (horizontal) state.dragX(overSlop.x) else state.pullY(overSlop.y, overscroll)
        val released = drag(slop.id) { change ->
            tracker.addPosition(change.uptimeMillis, change.position)
            val delta = change.positionChange()
            if (horizontal) state.dragX(delta.x) else state.pullY(delta.y, overscroll)
            change.consume()
        }
        val velocity = if (released) tracker.calculateVelocity() else null
        if (horizontal) {
            if (freeScroll) {
                if (velocity != null) state.flingFree(scope, velocity.x, decay)
            } else {
                state.settleToDay(scope, startIdx, startOffset, velocity?.x ?: 0f, decay, carried)
            }
        } else {
            state.flingY(scope, velocity?.y ?: 0f, decay, overscroll)
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
