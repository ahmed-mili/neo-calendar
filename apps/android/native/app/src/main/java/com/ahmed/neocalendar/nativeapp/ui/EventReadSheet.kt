package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val dayFormat: DateTimeFormatter get() = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.getDefault())
private val dayShortFormat: DateTimeFormatter get() = DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault())

/** L'horaire en une ligne : « jeudi 1 octobre · 09:00 – 10:00 », ou la plage de jours. */
fun scheduleText(event: DisplayEvent, timeFormat24h: Boolean, zone: ZoneId = ZoneId.systemDefault()): String {
    val start = event.start.atZone(zone)
    if (event.allDay) {
        // La fin d'un évènement journée entière est exclusive.
        val lastDay = event.end.minusMillis(1).atZone(zone).toLocalDate()
        val first = start.toLocalDate()
        return if (lastDay <= first) "${start.format(dayFormat)} · Toute la journée"
        else "${start.format(dayShortFormat)} – ${lastDay.format(dayShortFormat)} · Toute la journée"
    }
    val end = event.end.atZone(zone)
    val from = formatClock(event.start, zone, timeFormat24h)
    val to = formatClock(event.end, zone, timeFormat24h)
    return if (start.toLocalDate() == end.toLocalDate()) "${start.format(dayFormat)} · $from – $to"
    else "${start.format(dayShortFormat)} $from – ${end.format(dayShortFormat)} $to"
}

/** La lecture minimale d'un évènement : titre, horaire, calendrier. La fiche complète est une autre étape. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventReadSheet(event: DisplayEvent, timeFormat24h: Boolean, onDismiss: () -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val schedule = remember(event, timeFormat24h) { scheduleText(event, timeFormat24h) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = Neo.Surface) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 16.dp).windowInsetsPadding(WindowInsets.navigationBars)) {
            Text(event.title, color = Neo.Text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            Text(schedule, color = Neo.TextSecondary, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(12.dp).clip(CircleShape).background(parseCalendarColor(event.color)),
                )
                Text(event.calendarName, color = Neo.Text, fontSize = 14.sp, modifier = Modifier.padding(start = 10.dp))
            }
        }
    }
}
