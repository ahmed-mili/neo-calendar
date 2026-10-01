package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.time.temporal.TemporalAdjusters
import com.ahmed.neocalendar.nativeapp.AppLocale

/** `firstDay` compte comme `Date.getDay()` : 0 dimanche, 1 lundi ... 6 samedi. */
fun firstDayOfWeek(firstDay: Int): DayOfWeek = DayOfWeek.of(if (firstDay == 0) 7 else firstDay.coerceIn(1, 6))

fun monthTitle(month: YearMonth): String =
    month.month.getDisplayName(TextStyle.FULL_STANDALONE, AppLocale.current)
        .replaceFirstChar { it.titlecase(AppLocale.current) } + " " + month.year

/**
 * Sept colonnes, six semaines. Un appui saute à la date ; un glissé horizontal
 * change de mois. La semaine en cours est une bande continue, aujourd'hui une
 * pastille rouge posée dessus.
 */
@Composable
fun MiniCalendar(
    anchor: LocalDate,
    firstDay: Int,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
    showHeader: Boolean = true,
    cellHeight: Dp = 39.dp,
) {
    var month by remember(YearMonth.from(anchor)) { mutableStateOf(YearMonth.from(anchor)) }
    val today = LocalDate.now()
    val weekStartDay = firstDayOfWeek(firstDay)
    val gridStart = month.atDay(1).with(TemporalAdjusters.previousOrSame(weekStartDay))
    val currentWeekStart = today.with(TemporalAdjusters.previousOrSame(weekStartDay))

    // Le même écart de 3 dp entre toutes les rangées, l'en-tête des jours compris (`gap: 3px 2px`).
    Column(
        modifier.pointerInput(Unit) {
            var total = 0f
            detectHorizontalDragGestures(
                onDragStart = { total = 0f },
                onDragEnd = {
                    if (total < -60f) month = month.plusMonths(1) else if (total > 60f) month = month.minusMonths(1)
                },
            ) { _, delta -> total += delta }
        },
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        if (showHeader) {
            Row(Modifier.fillMaxWidth().height(40.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    monthTitle(month),
                    color = Neo.Text,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f).padding(start = 4.dp),
                )
                if (month != YearMonth.from(today)) {
                    Text(
                        "Aujourd'hui",
                        color = Neo.Accent,
                        fontSize = 12.sp,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { month = YearMonth.from(today); onSelect(today) }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    )
                }
                NavIcon(NeoIcons.ChevronUp, "Mois précédent") { month = month.minusMonths(1) }
                NavIcon(NeoIcons.ChevronDown, "Mois suivant") { month = month.plusMonths(1) }
            }
        }
        Row(Modifier.fillMaxWidth()) {
            for (i in 0 until 7) {
                val weekday = weekStartDay.plus(i.toLong())
                Text(
                    // Deux lettres en minuscules (« lu ma me je ve sa di »), le week-end à 75 %.
                    weekday.getDisplayName(TextStyle.SHORT, AppLocale.current).lowercase(AppLocale.current).take(2),
                    color = Neo.TextSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .weight(1f)
                        .height(27.dp)
                        .alpha(if (weekday == DayOfWeek.SATURDAY || weekday == DayOfWeek.SUNDAY) 0.75f else 1f)
                        .padding(top = 4.dp),
                )
            }
        }
        for (week in 0 until 6) {
            val weekStart = gridStart.plusDays(week * 7L)
            val isCurrentWeek = weekStart == currentWeekStart
            Row(
                Modifier
                    .fillMaxWidth()
                    .then(if (isCurrentWeek) Modifier.background(Neo.HighlightWeek, RoundedCornerShape(9.dp)) else Modifier),
            ) {
                for (d in 0 until 7) {
                    val day = weekStart.plusDays(d.toLong())
                    DayCell(day, today, anchor, inMonth = YearMonth.from(day) == month, cellHeight, Modifier.weight(1f)) { onSelect(day) }
                }
            }
        }
    }
}

@Composable
private fun NavIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, description, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp)) }
}

@Composable
private fun DayCell(
    day: LocalDate,
    today: LocalDate,
    anchor: LocalDate,
    inMonth: Boolean,
    height: Dp,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val isToday = day == today
    Box(
        modifier.height(height).clip(RoundedCornerShape(9.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        // Le jour de repère n'a pas de pastille : la semaine est la bande.
        val badge = if (isToday) Modifier.size(32.dp).background(Neo.Today, RoundedCornerShape(9.dp)) else Modifier.size(32.dp)
        Box(badge, contentAlignment = Alignment.Center) {
            Text(
                day.dayOfMonth.toString(),
                fontSize = 13.sp,
                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                color = when {
                    isToday -> Color.White
                    inMonth -> Neo.Text
                    else -> Neo.TextSecondary
                },
            )
        }
    }
}
