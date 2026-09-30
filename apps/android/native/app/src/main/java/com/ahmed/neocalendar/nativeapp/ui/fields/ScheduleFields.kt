package com.ahmed.neocalendar.nativeapp.ui.fields

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.form.EventFormValues
import com.ahmed.neocalendar.core.form.computeDuration
import com.ahmed.neocalendar.core.form.daysBetween
import com.ahmed.neocalendar.core.form.panelEndDate
import com.ahmed.neocalendar.core.form.withAllDay
import com.ahmed.neocalendar.core.form.withClearedDate
import com.ahmed.neocalendar.core.format.formatClock
import com.ahmed.neocalendar.core.format.formatDatedDayWithYear
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
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

@Composable
private fun rememberDatePicker(onPicked: (String) -> Unit): (String) -> Unit {
    val context = LocalContext.current
    return { current ->
        val day = runCatching { LocalDate.parse(current) }.getOrNull() ?: LocalDate.now()
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth -> onPicked(LocalDate.of(year, month + 1, dayOfMonth).toString()) },
            day.year, day.monthValue - 1, day.dayOfMonth,
        ).show()
    }
}

@Composable
private fun rememberTimePicker(timeFormat24h: Boolean, onPicked: (String) -> Unit): (String) -> Unit {
    val context = LocalContext.current
    return { current ->
        val time = runCatching { LocalTime.parse(current) }.getOrNull() ?: LocalTime.of(12, 0)
        TimePickerDialog(
            context,
            { _, hour, minute -> onPicked(LocalTime.of(hour, minute).toString()) },
            time.hour, time.minute, timeFormat24h,
        ).show()
    }
}

/**
 * Dates, heures, durée et « toute la journée » : deux lignes (début, fin), la
 * durée à droite de la fin, la croix qui renvoie l'évènement à la liste « un jour ».
 */
@Composable
fun ScheduleFields(
    values: EventFormValues,
    editable: Boolean,
    timeFormat24h: Boolean,
    canClearDate: Boolean,
    onChange: (EventFormValues) -> Unit,
) {
    val pickStartDate = rememberDatePicker { onChange(values.copy(date = it)) }
    val pickEndDate = rememberDatePicker { picked -> onChange(values.copy(endDate = picked.takeIf { it != values.date })) }
    val pickStartTime = rememberTimePicker(timeFormat24h) { onChange(values.copy(startTime = it)) }
    val pickEndTime = rememberTimePicker(timeFormat24h) { onChange(values.copy(endTime = it)) }

    if (values.date.isEmpty()) {
        // Un évènement sans date : « Un jour », et le moyen de lui en donner une.
        FieldRow(NeoIcons.Clock) {
            Text("Un jour", color = Neo.TextSecondary, fontSize = 14.sp, modifier = Modifier.weight(1f))
            if (editable) ValuePill("Ajouter une date", onClick = {
                val today = LocalDate.now().toString()
                onChange(values.copy(date = today, allDay = true))
            })
        }
        return
    }

    val endShown = panelEndDate(values.date, values.endDate, values.allDay, values.startTime, values.endTime)
        .ifEmpty { values.endDate?.takeIf { it.isNotEmpty() } ?: values.date }
    val gap = daysBetween(values.date, endShown)
    val duration = computeDuration(values.startTime, values.endTime, gap)

    FieldRow(NeoIcons.Clock) {
        Text("Début", color = Neo.TextSecondary, fontSize = 13.sp, modifier = Modifier.width(44.dp))
        ValuePill(dateLabel(values.date), enabled = editable, onClick = { pickStartDate(values.date) })
        if (!values.allDay) {
            Box(Modifier.width(8.dp))
            ValuePill(timeLabel(values.startTime, timeFormat24h), enabled = editable, onClick = { pickStartTime(values.startTime) })
        }
        Box(Modifier.weight(1f))
        if (editable && canClearDate) {
            Box(
                Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).clickable { onChange(values.withClearedDate()) },
                contentAlignment = Alignment.Center,
            ) { Icon(NeoIcons.Close, "Effacer la date", tint = Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
        }
    }
    FieldRow(null) {
        Text("Fin", color = Neo.TextSecondary, fontSize = 13.sp, modifier = Modifier.width(44.dp))
        ValuePill(dateLabel(endShown), enabled = editable, onClick = { pickEndDate(endShown) })
        if (!values.allDay) {
            Box(Modifier.width(8.dp))
            ValuePill(timeLabel(values.endTime, timeFormat24h), enabled = editable, onClick = { pickEndTime(values.endTime) })
        }
        Box(Modifier.weight(1f))
        if (duration.isNotEmpty() && !values.allDay) Text(duration, color = Neo.TextFaint, fontSize = 13.sp)
        else if (values.allDay && gap > 0) Text("${gap + 1} jours", color = Neo.TextFaint, fontSize = 13.sp)
    }
    FieldRow(NeoIcons.Calendar, onClick = if (editable) ({ onChange(values.withAllDay(!values.allDay)) }) else null) {
        Text("Toute la journée", color = Neo.Text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        NeoSwitch(values.allDay, editable) { onChange(values.withAllDay(it)) }
    }
}
