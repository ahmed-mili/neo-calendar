package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import com.ahmed.neocalendar.nativeapp.ui.Icon
import com.ahmed.neocalendar.nativeapp.ui.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.nativeapp.AppLanguage
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
import com.ahmed.neocalendar.nativeapp.ui.pressFill
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

private val MONTHS_SHORT = listOf("janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc")
private val WEEKDAY_LETTERS = mapOf(
    DayOfWeek.MONDAY to "lu", DayOfWeek.TUESDAY to "ma", DayOfWeek.WEDNESDAY to "me", DayOfWeek.THURSDAY to "je",
    DayOfWeek.FRIDAY to "ve", DayOfWeek.SATURDAY to "sa", DayOfWeek.SUNDAY to "di",
)
private val MONTHS_SHORT_EN = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private val WEEKDAY_LETTERS_EN = mapOf(
    DayOfWeek.MONDAY to "Mo", DayOfWeek.TUESDAY to "Tu", DayOfWeek.WEDNESDAY to "We", DayOfWeek.THURSDAY to "Th",
    DayOfWeek.FRIDAY to "Fr", DayOfWeek.SATURDAY to "Sa", DayOfWeek.SUNDAY to "Su",
)

/** Les 42 jours de la grille d'un mois : six semaines, commençant le jour `firstDay` (0 = dimanche) de la semaine du 1er. */
fun monthGridDays(month: YearMonth, firstDay: Int): List<LocalDate> {
    val first = month.atDay(1)
    val offset = ((first.dayOfWeek.value % 7) - firstDay + 7) % 7
    val start = first.minusDays(offset.toLong())
    return List(42) { start.plusDays(it.toLong()) }
}

/**
 * `.nc-datepicker` : le popover de date de l'ancienne, 252 dp de large, ancré au champ. Flèches de mois, titre
 * « sept 2026 », jours en français ou en anglais selon la langue choisie (les autres mois à demi-teinte), « Retirer la date » (si la fiche peut la rendre) et
 * « Aujourd'hui ».
 */
@Composable
fun DatePopover(
    expanded: Boolean,
    selected: String,
    firstDay: Int,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
    onClear: (() -> Unit)? = null,
) {
    if (!expanded) return
    val chosen = runCatching { LocalDate.parse(selected) }.getOrNull()
    val today = LocalDate.now()
    var month by remember(selected) { mutableStateOf(YearMonth.from(chosen ?: today)) }
    Popover(expanded = true, onDismiss = onDismiss, surface = PopoverSurface(Neo.Surface, 12.dp, 10.dp, true), width = 252.dp, anchorOffset = 2.dp, centerX = true) {
        Row(Modifier.fillMaxWidth().padding(top = 1.5.dp, bottom = 7.5.dp), verticalAlignment = Alignment.CenterVertically) {
            MonthArrow(NeoIcons.ChevronLeft, "Mois précédent") { month = month.minusMonths(1) }
            Text(
                "${(if (AppLanguage.isEnglish) MONTHS_SHORT_EN else MONTHS_SHORT)[month.monthValue - 1]} ${month.year}",
                color = Neo.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
            MonthArrow(NeoIcons.ChevronRight, "Mois suivant") { month = month.plusMonths(1) }
        }
        val order = List(7) { DayOfWeek.of(((firstDay + it + 6) % 7) + 1) }
        Row(Modifier.fillMaxWidth()) {
            for (day in order) {
                Box(Modifier.weight(1f).height(24.dp), contentAlignment = Alignment.Center) {
                    Text((if (AppLanguage.isEnglish) WEEKDAY_LETTERS_EN else WEEKDAY_LETTERS).getValue(day), color = Neo.TextFaint, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
        val days = monthGridDays(month, firstDay)
        Spacer(Modifier.height(3.5.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (week in days.chunked(7)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (day in week) {
                        val isSelected = day == chosen
                        val isToday = day == today
                        val shape = RoundedCornerShape(7.dp)
                        Box(
                            Modifier.weight(1f).height(30.dp)
                                .then(if (isSelected) Modifier.background(if (isToday) Neo.Today else Neo.Accent, shape) else Modifier)
                                .pressFill(shape, Neo.Hover) { onPick(day.toString()) },
                            contentAlignment = Alignment.Center,
                        ) {
                            val out = day.month != month.month
                            Text(
                                day.dayOfMonth.toString(),
                                color = when {
                                    isSelected -> if (isToday) androidx.compose.ui.graphics.Color.White else Neo.OnAccent
                                    isToday -> Neo.Today
                                    out -> Neo.TextFaint.copy(alpha = 0.5f)
                                    else -> Neo.Text
                                },
                                fontSize = 16.sp,
                                fontWeight = if (isSelected) FontWeight.SemiBold else if (isToday) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onClear != null) {
                Text(
                    "Retirer la date", color = Neo.TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.pressFill(RoundedCornerShape(6.dp), Neo.Hover) { onClear() }.padding(horizontal = 10.dp, vertical = 8.dp),
                )
            }
            Box(Modifier.weight(1f))
            Text(
                "Aujourd'hui", color = Neo.Accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.pressFill(RoundedCornerShape(6.dp), Neo.Hover) { onPick(today.toString()) }.padding(horizontal = 10.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun MonthArrow(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Box(Modifier.size(26.dp).pressFill(RoundedCornerShape(6.dp), Neo.Hover, onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, description, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
    }
}
