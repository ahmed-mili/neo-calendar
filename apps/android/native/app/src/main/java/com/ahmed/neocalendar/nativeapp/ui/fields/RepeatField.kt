package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.form.EventFormValues
import com.ahmed.neocalendar.core.form.withRepeat
import com.ahmed.neocalendar.core.recurrence.Freq
import com.ahmed.neocalendar.core.recurrence.MonthMode
import com.ahmed.neocalendar.core.recurrence.PresetKey
import com.ahmed.neocalendar.core.recurrence.RecurEnd
import com.ahmed.neocalendar.core.recurrence.RecurrenceState
import com.ahmed.neocalendar.core.recurrence.matchPreset
import com.ahmed.neocalendar.core.recurrence.orderedDayCodes
import com.ahmed.neocalendar.core.recurrence.recurrenceSummary
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
import java.time.LocalDate

private val PRESETS = listOf(
    null to "Une seule fois",
    PresetKey.Daily to "Tous les jours",
    PresetKey.Weekly to "Toutes les semaines",
    PresetKey.Monthly to "Tous les mois",
    PresetKey.Yearly to "Tous les ans",
    PresetKey.Custom to "Personnalisé…",
)

private val DAY_LETTERS = mapOf("U" to "D", "M" to "L", "T" to "M", "W" to "M", "R" to "J", "F" to "V", "S" to "S")
private val DAY_DESCRIPTIONS = mapOf(
    "U" to "dimanche", "M" to "lundi", "T" to "mardi", "W" to "mercredi", "R" to "jeudi", "F" to "vendredi", "S" to "samedi",
)

/** La ligne « Répéter » : le résumé de la règle, le menu des préréglages, et le panneau « Personnalisé ». */
@Composable
fun RepeatField(
    values: EventFormValues,
    editable: Boolean,
    firstDay: Int,
    onChange: (EventFormValues) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    // Ouvert à la demande : choisir « Personnalisé… » écrit une règle, la résumer ne l'ouvre pas.
    var customOpen by remember { mutableStateOf(false) }
    val preset = if (values.isRecurring) matchPreset(values.recurrence, values.date) else null
    val summary = if (values.isRecurring) recurrenceSummary(values.recurrence) else "Une seule fois"

    Box {
        FieldRow(NeoIcons.Repeat, onClick = if (editable) ({ menuOpen = true }) else null, open = menuOpen) {
            Text(
                if (values.isRecurring) summary else "Répéter",
                color = if (values.isRecurring) Neo.Text else Neo.TextSecondary,
                fontSize = 15.sp,
                modifier = Modifier.weight(1f),
            )
            if (editable) Icon(NeoIcons.ChevronDown, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
        }
        NeoMenu(menuOpen, { menuOpen = false }) {
            for ((key, label) in PRESETS) {
                val selected = if (key == null) !values.isRecurring else values.isRecurring && key == preset
                NeoMenuItem(label, selected) {
                    menuOpen = false
                    customOpen = key == PresetKey.Custom
                    onChange(values.withRepeat(key))
                }
            }
        }
    }
    if (values.isRecurring && customOpen && editable) {
        CustomRecurrence(values.recurrence, values.date, firstDay) { onChange(values.copy(recurrence = it)) }
    }
}

@Composable
private fun CustomRecurrence(state: RecurrenceState, startDate: String, firstDay: Int, onChange: (RecurrenceState) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = ICON_COLUMN_START + ICON_SIZE + FIELD_GAP, end = 16.dp, bottom = 8.dp)) {
        // Fréquence
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((freq, label) in listOf(Freq.Daily to "Jour", Freq.Weekly to "Semaine", Freq.Monthly to "Mois", Freq.Yearly to "An")) {
                val on = state.freq == freq
                Box(
                    Modifier.weight(1f).defaultMinSize(minHeight = 36.dp).clip(RoundedCornerShape(10.dp))
                        .background(if (on) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover)
                        .border(1.dp, if (on) Neo.Accent else Neo.Border, RoundedCornerShape(10.dp))
                        .clickable {
                            onChange(
                                state.copy(
                                    freq = freq,
                                    byDay = if (freq == Freq.Weekly) state.byDay.ifEmpty { listOf(dayOf(startDate)) } else emptyList(),
                                    monthMode = MonthMode.DayOfMonth,
                                )
                            )
                        },
                    contentAlignment = Alignment.Center,
                ) { Text(label, color = if (on) Neo.Accent else Neo.Text, fontSize = 13.sp) }
            }
        }
        // Intervalle
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Tous les", color = Neo.TextSecondary, fontSize = 14.sp)
            Box(Modifier.width(10.dp))
            NumberBox(state.interval) { onChange(state.copy(interval = it)) }
            Box(Modifier.width(10.dp))
            Text(
                when (state.freq) {
                    Freq.Daily -> "jour(s)"
                    Freq.Weekly -> "semaine(s)"
                    Freq.Monthly -> "mois"
                    Freq.Yearly -> "an(s)"
                },
                color = Neo.TextSecondary, fontSize = 14.sp,
            )
        }
        // Jours de la semaine
        if (state.freq == Freq.Weekly) {
            Row(Modifier.padding(top = 10.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                for (code in orderedDayCodes(firstDay)) {
                    val on = code in state.byDay
                    Box(
                        Modifier.size(38.dp).clip(CircleShape)
                            .background(if (on) Neo.Accent else Neo.Hover)
                            .clickable {
                                val next = if (on) state.byDay - code else state.byDay + code
                                // Jamais de semaine sans jour : le dernier ne se décoche pas.
                                if (next.isNotEmpty()) onChange(state.copy(byDay = next))
                            },
                        contentAlignment = Alignment.Center,
                    ) { Text(DAY_LETTERS.getValue(code), color = if (on) Neo.OnAccent else Neo.Text, fontSize = 13.sp) }
                }
            }
        }
        // Mensuel : le quantième ou le jour de la semaine
        if (state.freq == Freq.Monthly) {
            val date = runCatching { LocalDate.parse(startDate) }.getOrNull()
            if (date != null) {
                val nth = (date.dayOfMonth + 6) / 7
                val ordinal = if (nth == 1) "1er" else "${nth}e"
                val dayName = DAY_DESCRIPTIONS.getValue(dayOf(startDate))
                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for ((mode, label) in listOf(
                        MonthMode.DayOfMonth to "Le ${date.dayOfMonth} du mois",
                        MonthMode.DayOfWeek to "Le $ordinal $dayName",
                    )) {
                        val on = state.monthMode == mode
                        Box(
                            Modifier.defaultMinSize(minHeight = 36.dp).clip(RoundedCornerShape(10.dp))
                                .background(if (on) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover)
                                .border(1.dp, if (on) Neo.Accent else Neo.Border, RoundedCornerShape(10.dp))
                                .clickable { onChange(state.copy(monthMode = mode)) }
                                .padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text(label, color = if (on) Neo.Accent else Neo.Text, fontSize = 13.sp) }
                    }
                }
            }
        }
        // Fin
        Text("Fin", color = Neo.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            val isNever = state.end is RecurEnd.Never
            val isUntil = state.end is RecurEnd.Until
            val isCount = state.end is RecurEnd.Count
            EndChip("Jamais", isNever) { onChange(state.copy(end = RecurEnd.Never)) }
            EndChip("Le", isUntil) { onChange(state.copy(end = RecurEnd.Until(defaultUntil(startDate)))) }
            EndChip("Après", isCount) { onChange(state.copy(end = RecurEnd.Count(10))) }
        }
        val end = state.end
        if (end is RecurEnd.Until) {
            val pick = rememberUntilPicker { onChange(state.copy(end = RecurEnd.Until(it))) }
            Row(Modifier.padding(top = 8.dp)) { ValuePill(dateLabel(end.date), onClick = { pick(end.date) }) }
        }
        if (end is RecurEnd.Count) {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                NumberBox(end.count) { onChange(state.copy(end = RecurEnd.Count(maxOf(1, it)))) }
                Box(Modifier.width(10.dp))
                Text("occurrences", color = Neo.TextSecondary, fontSize = 14.sp)
            }
        }
    }
}


private fun dayOf(startDate: String): String =
    runCatching { com.ahmed.neocalendar.core.recurrence.dayCodeOf(startDate) }.getOrDefault("M")

private fun defaultUntil(startDate: String): String =
    (runCatching { LocalDate.parse(startDate) }.getOrNull() ?: LocalDate.now()).plusMonths(3).toString()

@Composable
private fun rememberUntilPicker(onPicked: (String) -> Unit): (String) -> Unit {
    val context = androidx.compose.ui.platform.LocalContext.current
    return { current ->
        val day = runCatching { LocalDate.parse(current) }.getOrNull() ?: LocalDate.now()
        android.app.DatePickerDialog(
            context,
            { _, y, m, d -> onPicked(LocalDate.of(y, m + 1, d).toString()) },
            day.year, day.monthValue - 1, day.dayOfMonth,
        ).show()
    }
}

@Composable
private fun EndChip(label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.defaultMinSize(minHeight = 36.dp).clip(RoundedCornerShape(10.dp))
            .background(if (on) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover)
            .border(1.dp, if (on) Neo.Accent else Neo.Border, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (on) Neo.Accent else Neo.Text, fontSize = 13.sp) }
}

/** Un petit champ numérique : tape un nombre, garde le dernier nombre valide. */
@Composable
fun NumberBox(value: Int, onChange: (Int) -> Unit) {
    var text by remember(value) { mutableStateOf(value.toString()) }
    Box(
        Modifier.width(64.dp).defaultMinSize(minHeight = 36.dp).clip(RoundedCornerShape(10.dp)).background(Neo.Hover).border(1.dp, Neo.Border, RoundedCornerShape(10.dp)),
        contentAlignment = Alignment.Center,
    ) {
        BasicTextField(
            text,
            { raw ->
                val digits = raw.filter { it.isDigit() }.take(4)
                text = digits
                digits.toIntOrNull()?.takeIf { it >= 1 }?.let(onChange)
            },
            singleLine = true,
            textStyle = TextStyle(color = Neo.Text, fontSize = 15.sp, textAlign = TextAlign.Center),
            cursorBrush = SolidColor(Neo.Accent),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp),
        )
    }
}
