package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.format.formatCardDate
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.lists.Timeframe
import com.ahmed.neocalendar.core.lists.filterPanelEvents
import com.ahmed.neocalendar.core.lists.panelTimeframe
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Instant
import java.time.ZoneId

/**
 * La liste des évènements d'un calendrier (appui sur sa ligne dans le tiroir) :
 * tout ce qu'il contient, y compris le passé lointain et les sans-date,
 * cherchable. `events` est null tant que la liste se calcule.
 */
@Composable
fun CalendarEventsList(
    calendar: CalendarModel,
    events: List<DisplayEvent>?,
    timeFormat24h: Boolean,
    onBack: () -> Unit,
    onEventClick: (DisplayEvent) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val shown = remember(events, query) { events?.let { filterPanelEvents(it, query) } }
    val now = remember(events) { Instant.now() }
    val zone = remember { ZoneId.systemDefault() }
    val accent = remember(calendar.color) { parseCalendarColor(calendar.color) }

    Column(Modifier.fillMaxSize()) {
        ListHeader(calendar.name, onBack, dot = accent)
        ListSearchField(query, { query = it }, "Rechercher un évènement", Modifier.padding(horizontal = 16.dp))
        when {
            shown == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Neo.Accent)
            }
            shown.isEmpty() -> EmptyNote(if (query.isNotBlank()) "Aucun évènement correspondant" else "Aucun évènement")
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(shown) { event ->
                    EventCard(event, accent, now, zone, timeFormat24h) { onEventClick(event) }
                }
            }
        }
    }
}

/** Une carte de la liste : titre, date sous la couleur du calendrier, état d'une tâche. */
@Composable
private fun EventCard(
    event: DisplayEvent,
    accent: androidx.compose.ui.graphics.Color,
    now: Instant,
    zone: ZoneId,
    timeFormat24h: Boolean,
    onClick: () -> Unit,
) {
    val timeframe = panelTimeframe(event, now)
    // Un calendrier sombre (bleu nuit) s'efface sur le fond : la date reprend sa teinte, éclaircie vers le texte.
    val readable = remember(accent) { androidx.compose.ui.graphics.lerp(accent, Neo.Text, 0.5f) }
    val shape = RoundedCornerShape(12.dp)
    val date = remember(event, timeFormat24h) {
        if (event.isSomeday) "Ajouter une date"
        else formatCardDate(event.start, event.end, event.allDay, zone, timeFormat24h, now.atZone(zone).year)
    }
    Column(
        Modifier
            .fillMaxWidth()
            // Passé : effacé ; en cours : cerné par l'accent ; à venir : tel quel.
            .alpha(if (timeframe == Timeframe.PAST) 0.6f else 1f)
            .clip(shape)
            .background(Neo.Hover)
            .border(1.dp, if (timeframe == Timeframe.NOW) Neo.Accent else Neo.Border, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(
            event.title,
            color = Neo.Text,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(date, color = readable, fontSize = 12.sp, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
        if (event.isTask) {
            val done = event.taskStatus == "complete"
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(if (done) Neo.Accent else Neo.TextSecondary))
                Text(
                    if (done) "Terminé" else "À faire",
                    color = Neo.TextSecondary,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
    }
}
