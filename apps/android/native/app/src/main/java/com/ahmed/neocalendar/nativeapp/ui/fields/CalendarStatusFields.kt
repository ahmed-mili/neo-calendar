package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
import com.ahmed.neocalendar.nativeapp.ui.parseCalendarColor

/** Le calendrier : seuls les calendriers modifiables sont proposés. Un évènement en lecture seule montre le sien sans menu. */
@Composable
fun CalendarField(
    calendars: List<CalendarModel>,
    selectedIndex: Int,
    readOnlyName: String?,
    editable: Boolean,
    onSelect: (Int) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val current = calendars.getOrNull(selectedIndex)
    val name = current?.name ?: readOnlyName ?: "Aucun calendrier"
    val color = current?.color?.let(::parseCalendarColor) ?: Neo.TextFaint
    Box {
        FieldRow(NeoIcons.Folder, onClick = if (editable && calendars.size > 1) ({ open = true }) else null, open = open) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(color))
            Text(name, color = Neo.Text, fontSize = 15.sp, modifier = Modifier.padding(start = 10.dp).weight(1f), maxLines = 1)
            if (editable && calendars.size > 1) Icon(NeoIcons.ChevronDown, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
        }
        NeoMenu(open, { open = false }) {
            calendars.forEachIndexed { index, calendar ->
                NeoMenuItem(calendar.name, index == selectedIndex) {
                    open = false
                    onSelect(index)
                }
            }
        }
    }
}

/** Le statut d'une tâche : « À faire » ou « Terminé », une pastille qui bascule. */
@Composable
fun StatusField(complete: Boolean, editable: Boolean, onToggle: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    FieldRow(NeoIcons.CircleCheck) {
        Text("Statut", color = Neo.TextSecondary, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Row(
            Modifier.defaultMinSize(minHeight = 36.dp).clip(shape)
                .background(if (complete) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover, shape)
                .border(1.dp, if (complete) Neo.Accent else Neo.Border, shape)
                .let { if (editable) it.clickable(onClick = onToggle) else it }
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (complete) Neo.Accent else Neo.TextFaint))
            Text(if (complete) "Terminé" else "À faire", color = Neo.Text, fontSize = 14.sp, modifier = Modifier.padding(start = 8.dp))
        }
    }
}
