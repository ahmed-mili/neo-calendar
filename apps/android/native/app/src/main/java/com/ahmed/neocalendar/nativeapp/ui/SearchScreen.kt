package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.format.formatClock
import com.ahmed.neocalendar.core.format.formatDayTitle
import com.ahmed.neocalendar.core.format.formatDuration
import com.ahmed.neocalendar.core.lists.EventDay
import com.ahmed.neocalendar.core.lists.groupEventsByDay
import com.ahmed.neocalendar.core.lists.searchEvents
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Duration
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * La recherche plein écran (loupe de la barre du haut) : le titre contient la
 * saisie, les résultats sont rangés sous le jour où ils commencent, du plus
 * ancien au plus récent. Rien de saisi, rien de listé. `corpus` est null tant
 * qu'il se calcule.
 */
@Composable
fun SearchScreen(
    corpus: List<DisplayEvent>?,
    timeFormat24h: Boolean,
    onClose: () -> Unit,
    onEventClick: (DisplayEvent) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val zone = remember { ZoneId.systemDefault() }
    // Le tri et la mise en jours se font hors du fil principal, à chaque frappe.
    val days by produceState<List<EventDay>>(emptyList(), corpus, query) {
        value = if (corpus == null) emptyList()
        else withContext(Dispatchers.Default) { groupEventsByDay(searchEvents(corpus, query), zone) }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().height(Neo.TopBarHeight).padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            ListSearchField(query, { query = it }, "Rechercher un événement", Modifier.weight(1f), autoFocus = true)
            Box(Modifier.height(Neo.TouchTarget).clickable(onClick = onClose).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                Text("Annuler", color = Neo.Accent, fontSize = 15.sp)
            }
        }
        if (query.isNotBlank() && corpus != null && days.isEmpty()) EmptyNote("Aucun événement trouvé")
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp)) {
            for (day in days) {
                item {
                    Text(
                        day.date?.let { formatDayTitle(it) } ?: "Sans date",
                        color = Neo.TextSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 16.dp, bottom = 6.dp),
                    )
                }
                items(day.events.size) { index ->
                    ResultCard(day.events[index], timeFormat24h, zone) { onEventClick(day.events[index]) }
                }
            }
        }
    }
}

@Composable
private fun ResultCard(event: DisplayEvent, timeFormat24h: Boolean, zone: ZoneId, onClick: () -> Unit) {
    val accent = remember(event.color) { parseCalendarColor(event.color) }
    val shape = RoundedCornerShape(10.dp)
    val meta = remember(event, timeFormat24h) {
        when {
            event.isSomeday -> event.calendarName
            event.allDay -> "Toute la journée"
            else -> "${formatClock(event.start, zone, timeFormat24h)} – ${formatClock(event.end, zone, timeFormat24h)}"
        }
    }
    val duration = remember(event) {
        if (event.isSomeday || event.allDay) null else formatDuration(Duration.between(event.start, event.end).toMinutes())
    }
    Column(
        Modifier
            .padding(bottom = 6.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(Neo.Hover)
            .clickable(onClick = onClick)
            .drawBehind { drawRect(accent, size = Size(4.dp.toPx(), size.height)) }
            .padding(start = 16.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
    ) {
        Text(event.title, color = Neo.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Row(Modifier.padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(meta, color = Neo.TextSecondary, fontSize = 12.sp, maxLines = 1)
            if (duration != null) {
                Box(Modifier.width(8.dp))
                Text(duration, color = Neo.TextFaint, fontSize = 12.sp, maxLines = 1)
            }
        }
    }
}
