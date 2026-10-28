package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.LocalDate

/**
 * La feuille du mois : le mini-calendrier sans son en-tête (le mois est le
 * bouton qui l'ouvre). Elle est posée dans le flux de l'écran, sur son verre,
 * sous la barre du haut, et repousse la grille ; elle n'est composée que
 * ouverte. Seuls le titre du mois, le retour et un jour la ferment : un appui
 * sur la grille ne la ferme pas. Les jours affichés par la grille y sont
 * surlignés (`highlightCount` jours à partir de [anchor]).
 */
@Composable
fun MonthSheet(
    visible: Boolean,
    anchor: LocalDate,
    firstDay: Int,
    highlightCount: Int,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible,
        modifier = modifier,
        enter = expandVertically(tween(170)) + fadeIn(tween(170)),
        exit = shrinkVertically(tween(120)) + fadeOut(tween(120)),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .padding(start = 12.dp, end = 12.dp, top = 2.dp, bottom = 13.dp),
        ) {
            MiniCalendar(
                anchor, firstDay, onSelect,
                showHeader = false,
                highlightFirst = anchor,
                highlightCount = highlightCount,
            )
        }
    }
}
