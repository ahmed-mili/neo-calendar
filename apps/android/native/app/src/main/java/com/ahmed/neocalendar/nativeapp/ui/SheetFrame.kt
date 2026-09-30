package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** Les trois ancrages de la fiche : bas (l'en-tête), moitié, plein. */
enum class SheetAnchor { Low, Half, Full }

/**
 * Une feuille de bas d'écran à trois ancrages. On la tire par la poignée et l'en-tête ;
 * tirée sous l'ancrage bas, ou un appui sur le voile, elle demande à se fermer.
 * Elle se pose au-dessus du clavier (sa hauteur se mesure dans ce qui reste) et sous la barre d'état.
 */
@Composable
fun SheetFrame(
    initial: SheetAnchor,
    onDismissRequest: () -> Unit,
    header: @Composable () -> Unit,
    body: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val containerPx = constraints.maxHeight.toFloat()
        val statusTop = WindowInsets.statusBars.getTop(density).toFloat()
        val imeBottom = WindowInsets.ime.getBottom(density).toFloat()
        val availablePx = (containerPx - statusTop - imeBottom).coerceAtLeast(0f)
        val lowPx = with(density) { 176.dp.toPx() }.coerceAtMost(availablePx)
        val halfPx = (availablePx * 0.56f).coerceAtLeast(lowPx)
        var anchor by rememberSaveable { mutableStateOf(initial) }
        fun px(target: SheetAnchor) = when (target) {
            SheetAnchor.Low -> lowPx
            SheetAnchor.Half -> halfPx
            SheetAnchor.Full -> availablePx
        }
        val height = remember { Animatable(0f) }

        // Arrive depuis le bas, se recale quand le clavier change la place disponible.
        LaunchedEffect(anchor, availablePx) { height.animateTo(px(anchor), tween(260)) }

        fun dismiss() = scope.launch {
            height.animateTo(0f, tween(200))
            onDismissRequest()
        }

        val fraction = if (availablePx > 0f) (height.value / availablePx).coerceIn(0f, 1f) else 0f
        Box(
            Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f * fraction))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onDismissRequest() },
        )

        val dragState = rememberDraggableState { delta ->
            scope.launch { height.snapTo((height.value - delta).coerceIn(0f, availablePx)) }
        }
        val dragHandle = Modifier.draggable(
            state = dragState,
            orientation = Orientation.Vertical,
            onDragStopped = { velocity ->
                // Où l'on arriverait en lâchant : la position, poussée par la vitesse.
                val projected = height.value - velocity * 0.18f
                when {
                    projected < lowPx * 0.62f -> onDismissRequest()
                    else -> {
                        val target = SheetAnchor.entries.minByOrNull { kotlin.math.abs(px(it) - projected) } ?: anchor
                        anchor = target
                        scope.launch { height.animateTo(px(target), tween(220)) }
                    }
                }
            },
        )

        Column(
            Modifier.align(Alignment.BottomCenter)
                .padding(bottom = with(density) { imeBottom.toDp() })
                .fillMaxWidth()
                .height(with(density) { height.value.toDp() })
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .background(Neo.Surface)
                .pointerInput(Unit) { detectTapGestures { } },
        ) {
            Box(Modifier.fillMaxWidth().then(dragHandle)) {
                Column {
                    Box(
                        Modifier.align(Alignment.CenterHorizontally).padding(top = 10.dp, bottom = 4.dp)
                            .width(36.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Neo.TextFaint),
                    )
                    header()
                }
            }
            Column(
                Modifier.weight(1f).fillMaxWidth()
                    .then(if (imeBottom > 0f) Modifier else Modifier.windowInsetsPadding(WindowInsets.navigationBars)),
            ) { body() }
        }
    }
}
