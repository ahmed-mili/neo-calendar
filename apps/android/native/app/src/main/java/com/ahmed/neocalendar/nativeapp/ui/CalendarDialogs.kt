package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.grid.CALENDAR_COLOR_PALETTE
import com.ahmed.neocalendar.core.preferences.REMINDER_CHOICES
import com.ahmed.neocalendar.core.reminders.ReminderUnit
import com.ahmed.neocalendar.core.reminders.reminderDelayLabel
import com.ahmed.neocalendar.core.reminders.reminderListLabel
import com.ahmed.neocalendar.core.reminders.reminderMinutesFrom
import com.ahmed.neocalendar.core.reminders.splitReminderDelay
import com.ahmed.neocalendar.core.workspace.validName
import com.ahmed.neocalendar.nativeapp.ui.fields.NumberBox
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction

private val HexColor = Regex("#[0-9a-fA-F]{6}")

@Composable
internal fun NeoDialog(
    title: String,
    onDismiss: () -> Unit,
    confirm: (@Composable () -> Unit)? = null,
    dismissLabel: String = "Annuler",
    content: @Composable () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Neo.Surface,
        title = { Text(title, color = Neo.Text, fontSize = 18.sp) },
        text = { Column(Modifier.verticalScroll(rememberScrollState())) { content() } },
        confirmButton = { confirm?.invoke() },
        dismissButton = { TextAction(dismissLabel, color = Neo.TextSecondary, onClick = onDismiss) },
    )
}

@Composable
internal fun TextInput(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, uri: Boolean = false) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier.fillMaxWidth().heightIn(min = 44.dp).background(Neo.Hover, shape).border(1.dp, Neo.Border, shape).padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) Text(placeholder, color = Neo.TextFaint, fontSize = 15.sp)
        BasicTextField(
            value,
            onChange,
            singleLine = true,
            textStyle = TextStyle(color = Neo.Text, fontSize = 15.sp),
            cursorBrush = SolidColor(Neo.Accent),
            keyboardOptions = if (uri) {
                KeyboardOptions(capitalization = KeyboardCapitalization.None, keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri)
            } else {
                KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)
            },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * Le nom d'un calendrier (un dossier), pour l'ajouter ou le renommer. Les règles sont celles du Java
 * (`validName`) : ni séparateur, ni « . » ni « .. » ; un nom déjà pris est refusé ici avant de l'être par le noyau.
 */
@Composable
fun CalendarNameDialog(
    title: String,
    initial: String,
    confirmLabel: String,
    takenNames: Set<String>,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var text by remember { mutableStateOf(initial) }
    val name = text.trim()
    val invalid = name.isNotEmpty() && runCatching { validName(name, false) }.isFailure
    val taken = name in takenNames
    val ok = name.isNotEmpty() && !invalid && !taken && name != initial
    NeoDialog(
        title,
        onDismiss,
        confirm = { TextAction(confirmLabel, enabled = ok) { onConfirm(name) } },
    ) {
        TextInput(text, { text = it }, "Nom du calendrier")
        val problem = when {
            invalid -> "Le nom ne peut pas contenir / ou \\, ni être « . » ou « .. »."
            taken -> "Un calendrier porte déjà ce nom."
            else -> null
        }
        if (problem != null) Text(problem, color = Neo.Today, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
    }
}

/** La couleur d'un calendrier : la palette du noyau, ou un `#RRGGBB` saisi. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun CalendarColorDialog(current: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf(current) }
    val valid = HexColor.matches(text)
    NeoDialog("Couleur", onDismiss, confirm = { TextAction("Appliquer", enabled = valid) { onPick(text.lowercase()) } }) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (hex in CALENDAR_COLOR_PALETTE) {
                val on = text.equals(hex, ignoreCase = true)
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(parseCalendarColor(hex))
                        .border(if (on) 3.dp else 1.dp, if (on) Neo.Text else Neo.Border, CircleShape)
                        .clickable { text = hex },
                )
            }
        }
        Row(Modifier.padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(if (valid) parseCalendarColor(text) else Neo.Hover).border(1.dp, Neo.Border, CircleShape))
            TextInput(text, { text = it.take(7) }, "#RRGGBB", Modifier.weight(1f))
        }
        if (!valid) Text("Format #RRGGBB", color = Neo.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
fun ConfirmDeleteCalendarDialog(name: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    NeoDialog(
        "Supprimer le calendrier",
        onDismiss,
        confirm = { TextAction("Supprimer", color = Neo.Today, onClick = onConfirm) },
    ) {
        Text("« $name » sera supprimé. Un calendrier ne peut l'être que s'il est vide.", color = Neo.TextSecondary, fontSize = 14.sp)
    }
}

/** Une liste de choix où un seul est pris (premier jour, mode de trajet, application de cartes). */
@Composable
fun ChoiceDialog(title: String, options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    NeoDialog(title, onDismiss) {
        for ((value, label) in options) ChoiceLine(label, null, value == selected) { onPick(value) }
    }
}

@Composable
private fun ChoiceLine(label: String, note: String?, checked: Boolean, muted: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, color = if (muted) Neo.TextFaint else if (checked) Neo.Accent else Neo.Text, fontSize = 15.sp)
            if (note != null) Text(note, color = Neo.TextFaint, fontSize = 12.sp)
        }
        if (checked) Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(18.dp))
    }
}

/**
 * Le rappel : celui de toute l'application (`inherited` nul) ou celui d'un calendrier (`minutes` nul =
 * il suit le réglage de l'application). Port de ReminderChoiceDialog.tsx : les lignes se cochent sans
 * refermer le dialogue, « Personnalisé » ajoute un délai au compteur. Chaque geste écrit aussitôt.
 */
@Composable
fun ReminderDialog(
    title: String,
    minutes: List<Long>?,
    inherited: List<Long>?,
    onPick: (List<Long>?) -> Unit,
    onDismiss: () -> Unit,
) {
    var current by remember { mutableStateOf(minutes) }
    val chosen = current.orEmpty()
    val write = { next: List<Long>? -> current = next; onPick(next) }
    val toggle = { value: Long ->
        write(if (value in chosen) chosen - value else (chosen + value).sorted())
    }
    val presets = REMINDER_CHOICES.filter { it > 0 }
    val extras = chosen.filter { it !in presets }
    var amount by remember { mutableStateOf(splitReminderDelay(0).amount) }
    var unit by remember { mutableStateOf(ReminderUnit.Minutes) }

    NeoDialog(title, onDismiss, dismissLabel = "Fermer") {
        if (inherited != null) {
            ChoiceLine(
                "Réglage de l'application",
                reminderListLabel(inherited.map { it.toDouble() }),
                checked = current == null,
                muted = current != null,
            ) { write(null); onDismiss() }
        }
        ChoiceLine("Aucun rappel", null, checked = current != null && chosen.isEmpty()) { write(emptyList()); onDismiss() }
        for (preset in presets) ChoiceLine(reminderDelayLabel(preset.toDouble()), null, preset in chosen) { toggle(preset) }
        for (extra in extras) ChoiceLine(reminderDelayLabel(extra.toDouble()), null, true) { toggle(extra) }
        Text("Personnalisé", color = Neo.TextSecondary, fontSize = 13.sp, modifier = Modifier.padding(start = 4.dp, top = 12.dp, bottom = 6.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberBox(amount) { amount = it }
            for ((choice, name) in listOf(ReminderUnit.Minutes to "minutes", ReminderUnit.Hours to "heures", ReminderUnit.Days to "jours")) {
                val on = unit == choice
                Box(
                    Modifier.defaultMinSize(minHeight = 36.dp).clip(RoundedCornerShape(10.dp))
                        .background(if (on) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover)
                        .border(1.dp, if (on) Neo.Accent else Neo.Border, RoundedCornerShape(10.dp))
                        .clickable { unit = choice }
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(name, color = if (on) Neo.Accent else Neo.Text, fontSize = 13.sp) }
            }
        }
        Box(Modifier.padding(top = 8.dp)) {
            TextAction("Ajouter") { toggle(reminderMinutesFrom(amount.toDouble(), unit).toLong()) }
        }
    }
}
