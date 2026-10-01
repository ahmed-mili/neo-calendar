package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.em
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.layout.TodayBadgeState
import com.ahmed.neocalendar.core.layout.needsCompactMonthType

/**
 * La barre du haut de l'inventaire §1 : menu, mois (qui ouvre la feuille),
 * numéro de semaine, loupe (la recherche), et la pastille du jour, qui ramène à aujourd'hui et passe
 * au rouge quand aujourd'hui n'est plus à l'écran.
 */
@Composable
fun TopBar(
    monthName: String,
    weekNumber: Int,
    monthOpen: Boolean,
    todayNumber: Int,
    badge: TodayBadgeState,
    updateDot: Boolean,
    onMenu: () -> Unit,
    onMonth: () -> Unit,
    onSearch: () -> Unit,
    onToday: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.fillMaxWidth().height(Neo.TopBarHeight).padding(horizontal = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(Neo.TouchTarget).pressFill(RoundedCornerShape(13.dp), onClick = onMenu),
            contentAlignment = Alignment.Center,
        ) {
            Icon(NeoIcons.Menu, "Ouvrir les calendriers", tint = Neo.TextSecondary, modifier = Modifier.size(23.dp))
            // La pastille bleue : une mise à jour est prête à poser.
            if (updateDot) Box(Modifier.align(Alignment.TopEnd).padding(top = 9.dp, end = 9.dp).size(9.dp).clip(CircleShape).background(Neo.Accent))
        }

        val compact = needsCompactMonthType(monthName)
        val chevron by animateFloatAsState(if (monthOpen) 180f else 0f, tween(170), label = "month-chevron")
        Row(
            Modifier
                .height(Neo.TouchTarget)
                .pressFill(RoundedCornerShape(12.dp), fill = Neo.HighlightWeek, on = monthOpen, onClick = onMonth)
                .padding(horizontal = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                monthName,
                color = Neo.Text,
                fontSize = if (compact) 24.sp else 29.sp,
                fontWeight = FontWeight(750),
                letterSpacing = if (compact) (-0.05).em else (-0.045).em,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(4.dp))
            Icon(
                NeoIcons.ChevronDown,
                null,
                tint = Neo.TextSecondary,
                modifier = Modifier.size(15.dp).rotate(chevron),
            )
        }
        Text(
            "Semaine $weekNumber",
            color = Neo.Label,
            fontSize = 13.sp,
            lineHeight = 19.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 8.dp).weight(1f),
        )
        Box(
            Modifier.size(Neo.TouchTarget).pressFill(RoundedCornerShape(13.dp), onClick = onSearch),
            contentAlignment = Alignment.Center,
        ) { Icon(NeoIcons.Search, "Rechercher", tint = Neo.TextSecondary, modifier = Modifier.size(23.dp)) }
        // La pastille mesure 32 x 30 et touche le bord (7 dp) ; sa zone de toucher de 48 x 48 déborde de 8 dp de chaque côté.
        val source = remember { MutableInteractionSource() }
        val pressed by source.collectIsPressedAsState()
        val scale by animateFloatAsState(if (pressed) 0.94f else 1f, tween(90), label = "today-scale")
        Box(Modifier.width(32.dp).height(Neo.TouchTarget), contentAlignment = Alignment.Center) {
            val late = badge != TodayBadgeState.PRESENT
            Box(
                Modifier
                    .requiredSize(Neo.TouchTarget)
                    .scale(scale)
                    .clickable(interactionSource = source, indication = null, onClick = onToday),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .size(width = 32.dp, height = 30.dp)
                        .background(
                            if (late) Neo.TodayPill else if (pressed) Neo.HighlightAnchor else Neo.ChipNeutral,
                            RoundedCornerShape(9.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        todayNumber.toString(),
                        color = if (late) Color.White else Neo.Text,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}
