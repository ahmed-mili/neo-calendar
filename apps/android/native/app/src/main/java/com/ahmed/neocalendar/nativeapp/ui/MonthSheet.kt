package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import java.time.LocalDate

/**
 * La feuille du mois, sous la barre du haut : le mini-calendrier sans son
 * en-tête (le mois est le bouton qui l'ouvre). Un appui sur un jour y saute et
 * referme ; un appui à côté referme.
 */
@Composable
fun MonthSheet(
    visible: Boolean,
    anchor: LocalDate,
    firstDay: Int,
    onSelect: (LocalDate) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier.fillMaxSize()) {
        AnimatedVisibility(visible, enter = fadeIn(tween(120)), exit = fadeOut(tween(120))) {
            Box(Modifier.fillMaxSize().clickable(indication = null, interactionSource = null, onClick = onDismiss))
        }
        AnimatedVisibility(
            visible,
            enter = slideInVertically(tween(170)) { -it / 8 } + fadeIn(tween(170)),
            exit = slideOutVertically(tween(120)) { -it / 8 } + fadeOut(tween(120)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .cssShadow(offsetY = 18.dp, blur = 34.dp, color = Color.Black.copy(alpha = 0.28f))
                    .background(Neo.Surface)
                    .drawBehind { drawLine(Neo.BarPress, Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), 1f) }
                    .padding(start = 12.dp, end = 12.dp, top = 2.dp, bottom = 13.dp),
            ) {
                MiniCalendar(anchor, firstDay, onSelect, showHeader = false)
            }
        }
    }
}
