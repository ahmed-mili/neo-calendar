package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import com.ahmed.neocalendar.nativeapp.ui.Icon
import com.ahmed.neocalendar.nativeapp.ui.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import com.ahmed.neocalendar.nativeapp.ui.pressFill
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.reminders.ReminderUnit
import com.ahmed.neocalendar.core.reminders.reminderChoices
import com.ahmed.neocalendar.core.reminders.reminderLabelParts
import com.ahmed.neocalendar.core.reminders.reminderMinutesFrom
import com.ahmed.neocalendar.core.reminders.splitReminderDelay
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons

@Composable
private fun ReminderLabel(minutes: Double, allDay: Boolean) {
    val parts = reminderLabelParts(minutes, allDay)
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(color = Neo.Text, fontWeight = FontWeight.SemiBold)) { append(parts.amount) }
            if (parts.suffix.isNotEmpty()) withStyle(SpanStyle(color = Neo.TextFaint)) { append(" ${parts.suffix}") }
        },
        fontSize = 16.sp,
    )
}

/**
 * Les rappels de l'ancienne : l'icône `bell` et « Rappels » (`#696D86`) tant qu'il n'y en a aucun ; chaque rappel choisi
 * devient une ligne, avec sa croix ; le menu `nc-reminders-menu` (entrées de 40 dp, nombre en 600, suffixe en `#696D86`)
 * propose les délais restants, « Personnalisé… » et le retour au réglage de l'application. Absents (`null`), ceux du
 * réglage s'appliquent ; une liste, même vide, est la décision de cet événement.
 */
@Composable
fun RemindersField(
    reminders: List<Double>?,
    allDay: Boolean,
    editable: Boolean,
    onChange: (List<Double>?) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var customOpen by remember { mutableStateOf(false) }
    val chosen = reminders.orEmpty()
    val remaining = reminderChoices(allDay).map { it.toDouble() }.filter { it !in chosen }

    val anchor = rememberAnchorWidth()
    Box(anchor.track) {
        Column(Modifier.alpha(if (editable) 1f else 0.7f)) {
            if (chosen.isEmpty()) {
                FieldRow(NeoIcons.Bell, onClick = if (editable) ({ menuOpen = true }) else null, open = menuOpen, inset = 18.5.dp, highlightHeight = 37.dp) {
                    Text("Rappels", color = Neo.TextFaint, fontSize = 16.sp, modifier = Modifier.weight(1f))
                    if (editable) Icon(NeoIcons.ChevronDown, null, tint = Neo.TextFaint, modifier = Modifier.size(14.dp))
                }
            } else {
                chosen.forEachIndexed { index, minutes ->
                    FieldRow(if (index == 0) NeoIcons.Bell else null) {
                        Box(Modifier.weight(1f)) { ReminderLabel(minutes, allDay) }
                        if (editable) {
                            Box(
                                Modifier.size(36.dp).pressFill(RoundedCornerShape(8.dp), Neo.Hover) { onChange(chosen - minutes) },
                                contentAlignment = Alignment.Center,
                            ) { Icon(NeoIcons.Close, "Retirer le rappel", tint = Neo.TextFaint, modifier = Modifier.size(14.dp)) }
                        }
                    }
                }
                if (editable) FieldRow(null, onClick = { menuOpen = true }, open = menuOpen, minHeight = 40, inset = 18.5.dp) {
                    Text("Ajouter un rappel", color = Neo.TextFaint, fontSize = 16.sp)
                }
            }
        }
        Popover(menuOpen, { menuOpen = false }, PopoverSurface(Neo.Surface, 12.dp, 5.dp, true, gap = 1.dp), width = anchor.width - 37.dp, anchorInset = 18.5.dp) {
            for (minutes in remaining) {
                val parts = reminderLabelParts(minutes, allDay)
                PopoverEntry(
                    "${parts.amount} ${parts.suffix}", 40.dp, horizontalPadding = 12.dp,
                    rich = buildAnnotatedString {
                        withStyle(SpanStyle(color = Neo.Text, fontWeight = FontWeight.SemiBold)) { append(parts.amount) }
                        if (parts.suffix.isNotEmpty()) withStyle(SpanStyle(color = Neo.TextFaint)) { append(" ${parts.suffix}") }
                    },
                ) {
                    menuOpen = false
                    onChange((chosen + minutes).sorted())
                }
            }
            if (!allDay) PopoverEntry("Personnalisé…", 40.dp) {
                menuOpen = false
                customOpen = true
            }
            if (reminders != null) PopoverEntry("Rétablir le réglage de l'application", 40.dp, color = Neo.TextSecondary) {
                menuOpen = false
                onChange(null)
            }
        }
    }
    if (customOpen) {
        CustomReminderDialog(
            onDismiss = { customOpen = false },
            onAdd = { minutes ->
                customOpen = false
                if (minutes.toDouble() !in chosen) onChange((chosen + minutes.toDouble()).sorted())
            },
        )
    }
}

@Composable
private fun CustomReminderDialog(onDismiss: () -> Unit, onAdd: (Int) -> Unit) {
    val initial = splitReminderDelay(0)
    var amount by remember { mutableStateOf(initial.amount) }
    var unit by remember { mutableStateOf(initial.unit) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Neo.Surface,
        title = { Text("Rappel personnalisé", color = Neo.Text, fontSize = 18.sp) },
        text = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    NumberBox(amount) { amount = it }
                    Box(Modifier.width(10.dp))
                    Text("avant", color = Neo.TextSecondary, fontSize = 14.sp)
                }
                Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for ((choice, name) in listOf(ReminderUnit.Minutes to "minutes", ReminderUnit.Hours to "heures", ReminderUnit.Days to "jours")) {
                        val on = unit == choice
                        Box(
                            Modifier.defaultMinSize(minHeight = 36.dp).clip(RoundedCornerShape(10.dp))
                                .background(if (on) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover)
                                .border(1.dp, if (on) Neo.Accent else Neo.Border, RoundedCornerShape(10.dp))
                                .clickable { unit = choice }
                                .padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text(name, color = if (on) Neo.Accent else Neo.Text, fontSize = 13.sp) }
                    }
                }
            }
        },
        confirmButton = { TextAction("Ajouter") { onAdd(reminderMinutesFrom(amount.toDouble(), unit)) } },
        dismissButton = { TextAction("Annuler", color = Neo.TextSecondary, onClick = onDismiss) },
    )
}
