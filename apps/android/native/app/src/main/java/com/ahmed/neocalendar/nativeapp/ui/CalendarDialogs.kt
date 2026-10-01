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
