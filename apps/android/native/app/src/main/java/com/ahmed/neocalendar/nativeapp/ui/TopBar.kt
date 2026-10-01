package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
            Modifier.size(Neo.TouchTarget).clip(RoundedCornerShape(14.dp)).clickable(onClick = onMenu),
            contentAlignment = Alignment.Center,
        ) {
            Icon(NeoIcons.Menu, "Ouvrir les calendriers", tint = Neo.Text, modifier = Modifier.size(23.dp))
            // La pastille bleue : une mise à jour est prête à poser.
            if (updateDot) Box(Modifier.align(Alignment.TopEnd).padding(top = 9.dp, end = 9.dp).size(9.dp).clip(CircleShape).background(Neo.Accent))
        }

        Row(
            Modifier
                .height(Neo.TouchTarget)
                .clip(RoundedCornerShape(14.dp))
                .clickable(onClick = onMonth)
                .padding(horizontal = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                monthName,
                color = Neo.Text,
                fontSize = if (needsCompactMonthType(monthName)) 18.sp else 22.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(4.dp))
            Icon(
                NeoIcons.ChevronDown,
                null,
                tint = Neo.TextSecondary,
                modifier = Modifier.size(18.dp).rotate(if (monthOpen) 180f else 0f),
            )
        }
        Text(
            "Semaine $weekNumber",
            color = Neo.TextFaint,
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 8.dp).weight(1f),
        )
        Box(
            Modifier.size(Neo.TouchTarget).clip(RoundedCornerShape(14.dp)).clickable(onClick = onSearch),
            contentAlignment = Alignment.Center,
        ) { Icon(NeoIcons.Search, "Rechercher", tint = Neo.Text, modifier = Modifier.size(22.dp)) }
        Box(
            Modifier.size(Neo.TouchTarget).clickable(onClick = onToday, indication = null, interactionSource = null),
            contentAlignment = Alignment.Center,
        ) {
            val late = badge != TodayBadgeState.PRESENT
            Box(
                Modifier
                    .size(width = 32.dp, height = 30.dp)
                    .background(if (late) Neo.TodayPill else Neo.ChipNeutral, RoundedCornerShape(9.dp)),
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
