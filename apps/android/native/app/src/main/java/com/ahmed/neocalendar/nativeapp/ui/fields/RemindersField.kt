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
import com.ahmed.neocalendar.core.reminders.ReminderUnit
import com.ahmed.neocalendar.core.reminders.reminderChoices
import com.ahmed.neocalendar.core.reminders.reminderLabelParts
import com.ahmed.neocalendar.core.reminders.reminderMinutesFrom
import com.ahmed.neocalendar.core.reminders.splitReminderDelay
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons

private fun label(minutes: Double, allDay: Boolean): String {
    val parts = reminderLabelParts(minutes, allDay)
    return "${parts.amount} ${parts.suffix}".trim()
}

/**
 * Les rappels. Absents (`null`), ceux du réglage s'appliquent ; une liste, même
 * vide, est la décision de cet évènement : la vider est le silence.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
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

    Column {
        FieldRow(NeoIcons.Bell, minHeight = 52) {
            Column(Modifier.weight(1f)) {
                when {
                    reminders == null -> Text("Par défaut", color = Neo.TextSecondary, fontSize = 15.sp)
                    chosen.isEmpty() -> Text("Aucun rappel", color = Neo.TextSecondary, fontSize = 15.sp)
                    else -> FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (minutes in chosen) {
                            Row(
                                Modifier.defaultMinSize(minHeight = 34.dp).clip(RoundedCornerShape(10.dp))
                                    .background(Neo.Hover).border(1.dp, Neo.Border, RoundedCornerShape(10.dp))
                                    .padding(start = 12.dp, end = if (editable) 4.dp else 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(label(minutes, allDay), color = Neo.Text, fontSize = 14.sp)
                                if (editable) {
                                    Box(
                                        Modifier.size(30.dp).clickable { onChange(chosen - minutes) },
                                        contentAlignment = Alignment.Center,
                                    ) { Icon(NeoIcons.Close, "Retirer le rappel", tint = Neo.TextSecondary, modifier = Modifier.size(14.dp)) }
                                }
                            }
                        }
                    }
                }
            }
            if (editable) {
                Box {
                    ValuePill("Ajouter", open = menuOpen, chevron = true, onClick = { menuOpen = true })
                    NeoMenu(menuOpen, { menuOpen = false }) {
                        for (minutes in remaining) {
                            NeoMenuItem(label(minutes, allDay)) {
                                menuOpen = false
                                onChange((chosen + minutes).sorted())
                            }
                        }
                        if (!allDay) NeoMenuItem("Personnalisé…") {
                            menuOpen = false
                            customOpen = true
                        }
                        if (reminders != null) NeoMenuItem("Rétablir le réglage de l'application") {
                            menuOpen = false
                            onChange(null)
                        }
                    }
                }
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
