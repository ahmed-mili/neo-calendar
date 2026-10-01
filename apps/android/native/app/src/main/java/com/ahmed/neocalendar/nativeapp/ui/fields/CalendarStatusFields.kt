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

/**
 * Le calendrier de l'ancienne : un carré de la couleur (10x10, rayon 3), le nom en 16 sp et le type du calendrier en
 * légende (« Note »), un chevron ; le menu `nc-cal-select-menu` a son titre « Calendrier » et une entrée de 48 dp par
 * calendrier modifiable (coche, carré, nom). Un événement en lecture seule montre le sien sans menu.
 */
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
    val pickable = editable && calendars.size > 1
    val anchor = rememberAnchorWidth()
    Box(anchor.track) {
        FieldRow(null, onClick = if (pickable) ({ open = true }) else null, open = open, minHeight = 50, leading = { Box(Modifier.size(10.dp).background(color, RoundedCornerShape(3.dp))) }) {
            Text(name, color = Neo.Text, fontSize = 16.sp, maxLines = 1)
            Text("Note", color = Neo.TextSecondary, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp).weight(1f))
            if (pickable) Icon(NeoIcons.ChevronDown, null, tint = Neo.TextFaint, modifier = Modifier.size(14.dp))
        }
        Popover(open, { open = false }, GlassSurface, width = anchor.width) {
            PopoverHeading("Calendrier")
            calendars.forEachIndexed { index, calendar ->
                PopoverEntry(calendar.name, 48.dp, active = index == selectedIndex, checkAtStart = true, swatch = parseCalendarColor(calendar.color), hint = "Note", hintAfterLabel = true) {
                    open = false
                    onSelect(index)
                }
            }
        }
    }
}
