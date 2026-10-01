package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.core.sheet.HandleGlyph
import com.ahmed.neocalendar.core.sheet.SheetStop
import com.ahmed.neocalendar.core.sheet.handleGlyphFor
import com.ahmed.neocalendar.core.sheet.nextStopOnTap
import com.ahmed.neocalendar.core.sheet.offsetForStop
import com.ahmed.neocalendar.core.sheet.restOffsetFor
import com.ahmed.neocalendar.core.sheet.settleSheet
import com.ahmed.neocalendar.core.sheet.sheetHeightFor
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** `transition: transform 300ms cubic-bezier(0.05, 0.7, 0.1, 1)` : le mouvement de la feuille de l'ancienne. */
private val SheetEasing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
private const val SETTLE_MS = 300

/** `rubberBand` de useSheetDrag.ts : au-delà d'un ancrage la feuille suit de moins en moins (jamais jusqu'à `dimension`). */
private fun rubberBand(overshoot: Float, dimension: Float, factor: Float = 0.55f): Float =
    if (overshoot <= 0f || dimension <= 0f) 0f else (1f - 1f / ((overshoot * factor) / dimension + 1f)) * dimension

/**
 * Où se tient la feuille : une translation en dp (0 = pleine, `height` = hors de l'écran) et l'ancrage où elle repose.
 * Comme `useSheetDrag.ts`, la feuille garde une seule hauteur et ne fait que glisser.
 */
@Stable
class SheetState(initial: SheetStop, val draft: Boolean, private val scope: CoroutineScope) {
    var stop by mutableStateOf(initial)
        private set
    internal val offset = Animatable(100_000f)
    internal var height by mutableStateOf(0f)
    private var placed = false
    private var closing = false

    val rest: Float get() = restOffsetFor(height, draft)

    internal fun place(newHeight: Float) {
        val changed = height != newHeight
        height = newHeight
        if (newHeight <= 0f) return
        scope.launch {
            if (!placed) {
                // Elle arrive du bas : la première pose part hors de l'écran.
                placed = true
                offset.snapTo(newHeight)
                offset.animateTo(offsetForStop(stop, rest, newHeight), tween(SETTLE_MS, easing = SheetEasing))
            } else if (changed && !closing) {
                // Le clavier ou la rotation changent la place : on se recale sans mouvement.
                offset.snapTo(offsetForStop(stop, rest, newHeight))
            }
        }
    }

    /** Glisse jusqu'à un ancrage ouvert. */
    fun glideTo(target: SheetStop) {
        if (target == SheetStop.Closed || height <= 0f) return
        stop = target
        scope.launch { offset.animateTo(offsetForStop(target, rest, height), tween(SETTLE_MS, easing = SheetEasing)) }
    }

    /** Un appui sur la poignée : un cran plus haut (`nextAnchorOnTap`). */
    fun tapHandle() = glideTo(nextStopOnTap(stop))

    /** Sort par le bas, puis dit que c'est fait. */
    fun slideOut(then: () -> Unit) {
        if (closing) return
        closing = true
        scope.launch {
            offset.animateTo(height, tween(SETTLE_MS, easing = SheetEasing))
            then()
        }
    }

    /** Un geste a arrêté la feuille par le bas : elle revient là où elle était (une question reste à poser). */
    fun comeBack() {
        closing = false
        glideTo(stop)
    }

    internal fun dragBy(delta: Float) {
        if (height <= 0f) return
        scope.launch {
            val raw = offset.value + delta
            offset.snapTo(if (raw < 0f) -rubberBand(-raw, height) else if (raw > height) height + rubberBand(raw - height, height) else raw)
        }
    }

    /** Lâchée à `velocity` dp/ms (positive vers le bas) : l'ancrage se décide, ou la feuille s'en va. */
    internal fun release(velocity: Float, onSwipedAway: () -> Unit) {
        val target = settleSheet(offset.value, rest, height, velocity)
        if (target == SheetStop.Closed) {
            closing = true
            scope.launch {
                offset.animateTo(height, tween(SETTLE_MS, easing = SheetEasing))
                onSwipedAway()
            }
        } else {
            glideTo(target)
        }
    }
}

@Composable
fun rememberSheetState(initial: SheetStop, draft: Boolean): SheetState {
    val scope = rememberCoroutineScope()
    return remember { SheetState(initial, draft, scope) }
}

/**
 * La feuille de bas d'écran de l'ancienne (`.nc-event-popup` sur Android) : trois ancrages ouverts (plein, moitié, bas),
 * une poignée de 96x30 qui se tire et se touche, un en-tête qui se tire aussi, et le corps dont un glissé vers le bas, à
 * son sommet, tire la feuille. Rien ne voile ni ne bloque la grille derrière : un appui dessus est géré plus haut.
 */
@Composable
fun SheetFrame(
    state: SheetState,
    onSwipedAway: () -> Unit,
    header: @Composable () -> Unit,
    body: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    val swiped by androidx.compose.runtime.rememberUpdatedState(onSwipedAway)
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val containerDp = with(density) { constraints.maxHeight.toDp().value }
        val statusDp = with(density) { WindowInsets.statusBars.getTop(density).toDp().value }
        val imeBottom = with(density) { WindowInsets.ime.getBottom(density).toDp() }
        val availableDp = (containerDp - imeBottom.value).coerceAtLeast(0f)
        // Brouillon : 780 dp au plus. Fiche : sous la barre d'état, à 14 dp.
        val heightDp = sheetHeightFor(availableDp, statusDp, state.draft)
        LaunchedEffect(heightDp) { state.place(heightDp) }

        val borderColor = if (state.draft) Color(0x1CFFFFFF) else Neo.Border
        val shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
        val dragState = rememberDraggableState { deltaPx -> state.dragBy(deltaPx / density.density) }
        val dragHandle = Modifier.draggable(
            state = dragState,
            orientation = Orientation.Vertical,
            onDragStopped = { velocityPxPerSecond -> state.release(velocityPxPerSecond / density.density / 1000f) { swiped() } },
        )
        val fromBody = remember(state) {
            object : NestedScrollConnection {
                private var dragging = false
                override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                    // Déjà descendue par le corps : un glissé vers le haut la remonte avant de faire défiler le contenu.
                    if (dragging && available.y < 0f && state.offset.value > offsetForStop(state.stop, state.rest, state.height)) {
                        state.dragBy(available.y / density.density)
                        return Offset(0f, available.y)
                    }
                    return Offset.Zero
                }

                override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                    // `dragsSheetFromBody` : le contenu a rendu ce qu'il ne pouvait plus défiler, donc il est en haut.
                    if (source == NestedScrollSource.UserInput && available.y > 0f) {
                        dragging = true
                        state.dragBy(available.y / density.density)
                        return Offset(0f, available.y)
                    }
                    return Offset.Zero
                }

                override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
                    if (!dragging) return Velocity.Zero
                    dragging = false
                    state.release(available.y / density.density / 1000f) { swiped() }
                    return available
                }
            }
        }

        // Sous la feuille, derrière le clavier : la fenêtre de l'ancienne se redimensionnait, son fond uni restait visible là où le clavier est translucide.
        if (imeBottom.value > 0f) Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(imeBottom).background(Neo.Surface))
        Column(
            Modifier.align(Alignment.BottomCenter)
                .padding(bottom = imeBottom)
                .fillMaxWidth()
                .height(heightDp.dp)
                .offset { IntOffset(0, with(density) { state.offset.value.dp.roundToPx() }) }
                .let {
                    if (state.draft) it.cssShadow((-22).dp, 58.dp, Color(0x7A000000), 22.dp)
                    else it.cssShadow(4.dp, 12.dp, Color(0x3D000000), 22.dp)
                }
                .clip(shape)
                .background(Neo.Surface)
                .border(1.dp, borderColor, shape)
                .pointerInput(Unit) { detectTapGestures { } },
        ) {
            Box(Modifier.fillMaxWidth().then(dragHandle)) {
                header()
                SheetHandle(handleGlyphFor(state.stop), Modifier.align(Alignment.TopCenter)) { state.tapHandle() }
            }
            Column(
                Modifier.weight(1f).fillMaxWidth().nestedScroll(fromBody)
                    // Le bas de la feuille est hors de l'écran tant qu'elle n'est pas pleine : le corps défile dans ce qui se voit.
                    .layout { measurable, c ->
                        val hidden = with(density) { state.offset.value.coerceAtLeast(0f).dp.roundToPx() }
                        val h = (c.maxHeight - hidden).coerceAtLeast(0)
                        val placeable = measurable.measure(c.copy(minHeight = h, maxHeight = h))
                        layout(c.maxWidth, c.maxHeight) { placeable.place(0, 0) }
                    }
                    .then(if (imeBottom.value > 0f) Modifier else Modifier.windowInsetsPadding(WindowInsets.navigationBars)),
            ) { body() }
        }
    }
}

/**
 * La poignée : un bouton de 96x30 (rayon `0 0 12 12`) en haut au centre, qui dessine ce qu'un appui fera. Chevron vers le
 * haut à l'ancrage bas, trait au milieu, chevron vers le bas en plein (`SheetHandleGlyph`, 24x20, trait 2,5).
 */
@Composable
private fun SheetHandle(glyph: HandleGlyph, modifier: Modifier, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val tint = if (pressed) Neo.TextSecondary else Neo.TextFaint.copy(alpha = 0.72f)
    Box(
        modifier.size(96.dp, 30.dp).clip(RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp))
            .clickable(interactionSource = source, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(24.dp, 20.dp).let { if (glyph == HandleGlyph.Bar) it.alpha(0.72f) else it }) {
            val path = Path().apply {
                when (glyph) {
                    HandleGlyph.Up -> { moveTo(4.dp.toPx(), 13.dp.toPx()); lineTo(12.dp.toPx(), 7.dp.toPx()); lineTo(20.dp.toPx(), 13.dp.toPx()) }
                    HandleGlyph.Down -> { moveTo(4.dp.toPx(), 7.dp.toPx()); lineTo(12.dp.toPx(), 13.dp.toPx()); lineTo(20.dp.toPx(), 7.dp.toPx()) }
                    HandleGlyph.Bar -> { moveTo(4.dp.toPx(), 10.dp.toPx()); lineTo(20.dp.toPx(), 10.dp.toPx()) }
                }
            }
            drawPath(path, tint, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}
