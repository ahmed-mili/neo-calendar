package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
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
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * La recherche plein écran (loupe de la barre du haut), `nc-search-screen` : le titre contient la saisie, les résultats sont rangés
 * sous le jour où ils commencent, du plus ancien au plus récent. Rien de saisi, rien de listé. `corpus` est null tant qu'il se calcule.
 * Le fond (surface à 78 %) est posé par l'appelant.
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
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    // Le clavier attend la fin de l'arrivée de l'écran : le lever pendant l'animation fait saccader la mise en page.
    LaunchedEffect(Unit) {
        delay(SEARCH_ENTER_MS)
        focus.requestFocus()
    }
    val navBottom = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                Modifier
                    .weight(1f)
                    .height(44.dp)
                    .background(Neo.FieldFill.copy(alpha = 0.78f), RoundedCornerShape(12.dp))
                    .padding(start = 12.dp, end = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                Icon(NeoIcons.Search, null, tint = Neo.TextFaint, modifier = Modifier.size(16.dp))
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) Text("Rechercher un événement", color = Neo.TextFaint, fontSize = 17.sp, maxLines = 1)
                    BasicTextField(
                        query,
                        { query = it },
                        singleLine = true,
                        textStyle = TextStyle(color = Neo.Text, fontSize = 17.sp),
                        cursorBrush = SolidColor(Neo.Accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
                        modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    )
                }
                if (query.isNotEmpty()) {
                    // Un bouton rond plein, pas un glyphe nu : il faut qu'il vaille la peine d'être visé au pouce.
                    Box(
                        Modifier.size(26.dp).background(Neo.TextFaint.copy(alpha = 0.72f), CircleShape).clickable { query = ""; focus.requestFocus() },
                        contentAlignment = Alignment.Center,
                    ) { Icon(NeoIcons.Close, "Effacer la recherche", tint = Neo.Surface, modifier = Modifier.size(14.dp)) }
                }
            }
            Text(
                "Annuler",
                color = Neo.Text,
                fontSize = 16.sp,
                modifier = Modifier.clickable(indication = null, interactionSource = null, onClick = onClose).padding(horizontal = 2.dp, vertical = 8.dp),
            )
        }
        if (query.isNotBlank() && corpus != null && days.isEmpty()) {
            Text("Aucun événement trouvé", color = Neo.TextFaint, fontSize = 15.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 28.dp))
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = max(20f, navBottom.value + 12f).dp),
        ) {
            for ((dayIndex, day) in days.withIndex()) {
                item {
                    Text(
                        day.date?.let { formatDayTitle(it) } ?: "Sans date",
                        color = Neo.Text,
                        fontSize = 15.sp,
                        // 650 : le navigateur retient le gras, la police du système n'a pas de poids intermédiaire.
                        fontWeight = FontWeight.Bold,
                        lineHeight = 22.5.sp,
                        modifier = Modifier.padding(start = 2.dp, bottom = 10.dp, top = if (dayIndex == 0) 0.dp else 14.dp),
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
            .padding(bottom = 8.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(Neo.Mantle.copy(alpha = 0.62f))
            .pressFill(shape, Neo.Hover, onClick = onClick)
            .drawBehind {
                // Le bord gauche de 4 dp suit l'arrondi de la carte (`border-left` sur un `border-radius`).
                clipRect(right = 4.dp.toPx()) { drawRoundRect(accent, cornerRadius = CornerRadius(10.dp.toPx())) }
            }
            .padding(start = 18.dp, end = 14.dp, top = 13.dp, bottom = 13.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(event.title.trim().ifEmpty { "Sans titre" }, color = Neo.TextSecondary, fontSize = 15.sp, lineHeight = 19.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
            Text(meta, color = Neo.Text, fontSize = 15.sp, lineHeight = 22.5.sp, maxLines = 1)
            if (duration != null) Text(duration, color = Neo.TextFaint, fontSize = 15.sp, lineHeight = 22.5.sp, maxLines = 1)
        }
    }
}
