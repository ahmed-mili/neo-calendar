package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.form.EventFormValues
import com.ahmed.neocalendar.core.form.computeDuration
import com.ahmed.neocalendar.core.form.daysBetween
import com.ahmed.neocalendar.core.form.panelEndDate
import com.ahmed.neocalendar.core.form.parseTypedTime
import com.ahmed.neocalendar.core.form.withAllDay
import com.ahmed.neocalendar.core.form.withClearedDate
import com.ahmed.neocalendar.core.format.formatClock
import com.ahmed.neocalendar.core.format.formatDatedDayWithYear
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
import com.ahmed.neocalendar.nativeapp.ui.pressFill
import java.time.LocalDate
import java.time.LocalTime

/** « jeu 25 juin », avec l'année dès qu'elle n'est pas l'année en cours. */
fun dateLabel(iso: String): String {
    val date = runCatching { LocalDate.parse(iso) }.getOrNull() ?: return ""
    return formatDatedDayWithYear(date, LocalDate.now().year)
}

/** « 09:00 » ou « 9:00 AM » selon le réglage ; une heure absente se dit « --:-- ». */
fun timeLabel(hhmm: String, timeFormat24h: Boolean): String {
    val time = runCatching { LocalTime.parse(hhmm) }.getOrNull() ?: return "--:--"
    return formatClock(time, timeFormat24h)
}

/**
 * Un champ d'heure de la fiche : l'heure se tape en place (aucun cadran, aucun dialogue). Au focus le texte est
 * sélectionné et fond `rgba(198,208,245,.1)` ; en le quittant (ou « Terminé » au clavier) l'heure est lue par
 * `parseTypedTime`, et le champ reprend sa valeur si elle n'a pas de sens.
 */
@Composable
fun TimeInput(value: String, timeFormat24h: Boolean, enabled: Boolean, onCommit: (String) -> Unit) {
    val shown = timeLabel(value, timeFormat24h)
    var text by remember(shown) { mutableStateOf(TextFieldValue(shown)) }
    var focused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    fun commit() {
        val parsed = parseTypedTime(text.text)
        if (parsed != null && parsed != value) onCommit(parsed) else text = TextFieldValue(shown)
    }
    val shape = RoundedCornerShape(6.dp)
    Box(
        Modifier.heightIn(min = 44.dp).background(if (focused) Neo.Text.copy(alpha = 0.1f) else androidx.compose.ui.graphics.Color.Transparent, shape)
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        BasicTextField(
            text,
            { text = it },
            enabled = enabled,
            singleLine = true,
            textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp),
            cursorBrush = SolidColor(Neo.Accent),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
            modifier = Modifier.width(if (timeFormat24h) 46.dp else 70.dp).onFocusChanged {
                if (it.isFocused && !focused) text = TextFieldValue(text.text, TextRange(0, text.text.length))
                if (!it.isFocused && focused) commit()
                focused = it.isFocused
            },
        )
    }
}

/** Un bouton de date de la fiche (16 sp, rayon 4, remplissage 2 / 6) : il ouvre le popover de date. */
@Composable
private fun DateButton(iso: String, editable: Boolean, firstDay: Int, onPick: (String) -> Unit, onClear: (() -> Unit)? = null) {
    var open by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(4.dp)
    Box {
        Box(
            Modifier.heightIn(min = 40.dp).let { if (editable) it.pressFill(shape, Neo.Hover, on = open) { open = true } else it }
                .padding(horizontal = 6.dp, vertical = 2.dp),
            contentAlignment = Alignment.CenterStart,
        ) { Text(dateLabel(iso), color = Neo.Text, fontSize = 16.sp, maxLines = 1) }
        DatePopover(open, iso, firstDay, { open = false }, { open = false; onPick(it) }, onClear?.let { clear -> { open = false; clear() } })
    }
}

/**
 * Dates, heures, durée et « toute la journée », comme `DateRow` et `DateOptionsRow` de l'ancienne : une ligne
 * `heure → heure durée` à côté de l'horloge, la date sous chaque heure, puis « Toute la journée ».
 */
@Composable
fun ScheduleFields(
    values: EventFormValues,
    editable: Boolean,
    timeFormat24h: Boolean,
    firstDay: Int,
    canClearDate: Boolean,
    onChange: (EventFormValues) -> Unit,
) {
    if (values.date.isEmpty()) {
        // Un événement sans date : « Un jour », et le moyen de lui en donner une.
        FieldRow(NeoIcons.Clock) {
            Text("Un jour", color = Neo.TextSecondary, fontSize = 16.sp, modifier = Modifier.weight(1f))
            if (editable) {
                var open by remember { mutableStateOf(false) }
                Box {
                    Text(
                        "Ajouter une date", color = Neo.Text, fontSize = 16.sp,
                        modifier = Modifier.pressFill(RoundedCornerShape(4.dp), Neo.Hover, on = open) { open = true }.padding(horizontal = 6.dp, vertical = 8.dp),
                    )
                    DatePopover(open, LocalDate.now().toString(), firstDay, { open = false }, {
                        open = false
                        onChange(values.copy(date = it, allDay = true))
                    })
                }
            }
        }
        return
    }

    val endShown = panelEndDate(values.date, values.endDate, values.allDay, values.startTime, values.endTime)
        .ifEmpty { values.endDate?.takeIf { it.isNotEmpty() } ?: values.date }
    val gap = daysBetween(values.date, endShown)
    val duration = computeDuration(values.startTime, values.endTime, gap)
    val ranged = endShown != values.date
    val timesShown = !values.allDay || values.startTime.isNotEmpty()
    val fieldWidth = if (timeFormat24h) 54.dp else 78.dp

    FieldRow(NeoIcons.Clock, minHeight = 48) {
        if (timesShown) {
            Row(Modifier.alpha(if (values.allDay) 0.38f else 1f), verticalAlignment = Alignment.CenterVertically) {
                TimeInput(values.startTime, timeFormat24h, editable && !values.allDay) { onChange(values.copy(startTime = it)) }
                Box(Modifier.padding(horizontal = 14.dp)) { Icon(NeoIcons.ArrowRight, null, tint = Neo.TextSecondary, modifier = Modifier.size(15.dp)) }
                TimeInput(values.endTime, timeFormat24h, editable && !values.allDay) { onChange(values.copy(endTime = it)) }
                if (duration.isNotEmpty()) Text(duration, color = Neo.TextSecondary, fontSize = 12.5.sp, modifier = Modifier.padding(start = 12.dp))
            }
        }
    }
    Row(Modifier.fillMaxWidth().padding(start = ICON_COLUMN_START + ICON_SIZE + FIELD_GAP - 6.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(if (ranged && timesShown) Modifier.width(fieldWidth + 43.dp) else Modifier) {
            DateButton(values.date, editable, firstDay, { onChange(values.copy(date = it)) }, if (editable && canClearDate) ({ onChange(values.withClearedDate()) }) else null)
        }
        if (ranged) {
            DateButton(endShown, editable, firstDay, { picked -> onChange(values.copy(endDate = picked.takeIf { it != values.date })) })
        }
    }

    // « Toute la journée » : une ligne qui s'allume, sans interrupteur.
    val shape = RoundedCornerShape(6.dp)
    Box(
        Modifier.fillMaxWidth().padding(horizontal = 10.dp)
            .let { if (values.allDay) it.border(1.dp, Neo.Border, shape) else it }
            .let { if (editable) it.pressFill(shape, Neo.Hover) { onChange(values.withAllDay(!values.allDay)) } else it.alpha(0.48f) },
    ) {
        Row(Modifier.heightIn(min = 40.dp).padding(start = 16.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(ICON_SIZE, 20.dp).let { if (values.allDay) it.scale(1.06f) else it }, contentAlignment = Alignment.Center) {
                Icon(NeoIcons.Sun, null, tint = if (values.allDay) Neo.Accent else Neo.TextFaint, modifier = Modifier.size(16.dp))
            }
            Box(Modifier.width(FIELD_GAP))
            Text("Toute la journée", color = Neo.TextSecondary, fontSize = 16.sp, fontWeight = if (values.allDay) FontWeight.SemiBold else FontWeight.Normal)
        }
    }
}
