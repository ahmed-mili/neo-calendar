package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.recurrence.RecurringEditChange
import com.ahmed.neocalendar.core.recurrence.RecurringEditScope

/** Les questions que la fiche pose avant d'écrire : quelle portée, quoi supprimer, abandonner ou non. */
sealed interface SheetDialog {
    data class DeleteNote(val isTask: Boolean) : SheetDialog
    data class DeleteOccurrence(val isTask: Boolean) : SheetDialog
}

/** Les libellés et valeurs de `recurringEditChanges` sont des clés anglaises ; l'interface du PC les traduit par son dictionnaire. */
private val CHANGE_WORDS = mapOf(
    "Title" to "Titre", "Date" to "Date", "Dates" to "Dates", "Start time" to "Heure de début", "End time" to "Heure de fin",
    "All day" to "Toute la journée", "Repeat" to "Répéter", "Calendar" to "Calendrier", "Status" to "Statut",
    "Reminders" to "Rappels", "Description" to "Description",
    "Empty" to "Vide", "None" to "Aucun", "Once" to "Une seule fois", "Event" to "Événement", "Done" to "Fait",
    "To do" to "À faire", "On" to "Activé", "Off" to "Désactivé", "Default" to "Par défaut",
    "At start of event" to "Au début de l'événement",
)

private fun fr(word: String) = CHANGE_WORDS[word] ?: word

/** `.nc-scope-dialog` : la carte des questions de la fiche, 380 dp au plus, rayon 10, sur le voile des dialogues. */
@Composable
private fun ScopeCard(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    NeoModal(onDismiss) {
        val shape = RoundedCornerShape(10.dp)
        Column(
            Modifier.padding(10.dp).widthIn(max = 380.dp).fillMaxWidth()
                .shadow(24.dp, shape, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.48f))
                .background(Neo.Surface, shape).border(1.dp, Neo.BorderStrong, shape).clip(shape)
                .consumeTaps().padding(14.dp),
            content = content,
        )
    }
}

/** Un bouton de réponse : 46 dp, rayon 7, bord 1 dp, 12 sp. */
@Composable
private fun ScopeButton(text: String, modifier: Modifier = Modifier, filled: Boolean = true, color: Color = Neo.Text, onClick: () -> Unit) {
    val shape = RoundedCornerShape(7.dp)
    Box(
        modifier.heightIn(min = 46.dp).clip(shape).background(if (filled) Neo.Hover else Color.Transparent, shape).border(1.dp, Neo.Border, shape)
            .pressFill(shape, Neo.Hover, onClick = onClick).padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = color, fontSize = 12.sp, textAlign = TextAlign.Center) }
}

@Composable
fun ScopeDialog(
    changes: List<RecurringEditChange>,
    isTask: Boolean,
    onChoose: (RecurringEditScope) -> Unit,
    onCancel: () -> Unit,
) {
    ScopeCard(onCancel) {
        Text(
            if (isTask) "Modifier une tâche récurrente" else "Modifier un événement récurrent",
            color = Neo.Text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
        )
        Text("Choisissez comment appliquer ces modifications.", color = Neo.TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
        if (changes.isNotEmpty()) {
            val box = RoundedCornerShape(7.dp)
            Column(Modifier.padding(top = 14.dp).fillMaxWidth().border(1.dp, Neo.Border, box).padding(10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("MODIFICATIONS", color = Neo.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.44.sp)
                for (change in changes) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(fr(change.label), color = Neo.TextSecondary, fontSize = 12.sp, modifier = Modifier.weight(0.7f))
                        Row(Modifier.weight(1.6f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(fr(change.before), color = Neo.TextSecondary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            Icon(NeoIcons.ArrowRight, null, tint = Neo.TextSecondary, modifier = Modifier.size(12.dp))
                            Text(fr(change.after), color = Neo.Text, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        }
                    }
                }
            }
        }
        Row(Modifier.padding(top = 14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ScopeButton(if (isTask) "Cette tâche uniquement" else "Cet événement seulement", Modifier.weight(1f)) { onChoose(RecurringEditScope.Occurrence) }
            ScopeButton(if (isTask) "Toutes les tâches" else "Tous les événements", Modifier.weight(1f)) { onChoose(RecurringEditScope.Series) }
        }
        ScopeButton("Annuler", Modifier.padding(top = 8.dp).fillMaxWidth(), filled = false, color = Neo.TextSecondary, onClick = onCancel)
    }
}

@Composable
fun ConfirmDialog(title: String, message: String, confirm: String, onConfirm: () -> Unit, onCancel: () -> Unit) {
    ScopeCard(onCancel) {
        Text(title, color = Neo.Text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(message, color = Neo.TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
        Row(Modifier.padding(top = 14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ScopeButton("Annuler", Modifier.weight(1f), filled = false, color = Neo.TextSecondary, onClick = onCancel)
            ScopeButton(confirm, Modifier.weight(1f), color = Neo.Danger, onClick = onConfirm)
        }
    }
}

@Composable
fun DeleteOccurrenceDialog(isTask: Boolean, onChoose: (following: Boolean) -> Unit, onCancel: () -> Unit) {
    ScopeCard(onCancel) {
        Text(
            if (isTask) "Supprimer la tâche récurrente" else "Supprimer l'événement récurrent",
            color = Neo.Text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
        )
        Text(
            if (isTask) "Que supprimer de cette série de tâches ?" else "Que supprimer de cette série ?",
            color = Neo.TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp),
        )
        Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ScopeButton(if (isTask) "Supprimer cette tâche uniquement" else "Supprimer cet événement uniquement", Modifier.fillMaxWidth(), color = Neo.Danger) { onChoose(false) }
            ScopeButton(
                if (isTask) "Supprimer cette tâche et les suivantes" else "Supprimer cet événement et les suivants",
                Modifier.fillMaxWidth(), color = Neo.Danger,
            ) { onChoose(true) }
            ScopeButton("Annuler", Modifier.fillMaxWidth(), filled = false, color = Neo.TextSecondary, onClick = onCancel)
        }
    }
}
