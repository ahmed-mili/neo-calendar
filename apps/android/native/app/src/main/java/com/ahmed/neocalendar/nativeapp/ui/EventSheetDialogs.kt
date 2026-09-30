package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
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
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction

/** Les questions que la fiche pose avant d'écrire : quelle portée, quoi supprimer, abandonner ou non. */
sealed interface SheetDialog {
    data class Scope(val changes: List<RecurringEditChange>, val isTask: Boolean) : SheetDialog
    data object Discard : SheetDialog
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

@Composable
fun ScopeDialog(
    changes: List<RecurringEditChange>,
    isTask: Boolean,
    onChoose: (RecurringEditScope) -> Unit,
    onCancel: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = Neo.Surface,
        title = {
            Text(
                if (isTask) "Modifier une tâche récurrente" else "Modifier un événement récurrent",
                color = Neo.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Choisissez comment appliquer ces modifications.", color = Neo.TextSecondary, fontSize = 14.sp)
                if (changes.isNotEmpty()) {
                    Text("Modifications", color = Neo.TextFaint, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    for (change in changes) {
                        Column {
                            Text(fr(change.label), color = Neo.TextSecondary, fontSize = 12.sp)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(fr(change.before), color = Neo.TextFaint, fontSize = 14.sp, modifier = Modifier.weight(1f, fill = false))
                                Icon(NeoIcons.ChevronRight, null, tint = Neo.TextSecondary, modifier = Modifier.padding(horizontal = 4.dp).size(14.dp))
                                Text(fr(change.after), color = Neo.Text, fontSize = 14.sp, modifier = Modifier.weight(1f, fill = false))
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Column(horizontalAlignment = Alignment.End) {
                TextAction(if (isTask) "Cette tâche uniquement" else "Cet événement uniquement") { onChoose(RecurringEditScope.Occurrence) }
                TextAction(if (isTask) "Toutes les tâches" else "Tous les événements") { onChoose(RecurringEditScope.Series) }
                TextAction("Annuler", color = Neo.TextSecondary, onClick = onCancel)
            }
        },
    )
}

@Composable
fun DiscardDialog(onSave: () -> Unit, onDiscard: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = Neo.Surface,
        title = { Text("Enregistrer les modifications ?", color = Neo.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) },
        text = { Text("Les changements faits dans la fiche ne sont pas encore écrits.", color = Neo.TextSecondary, fontSize = 14.sp) },
        confirmButton = {
            Column(horizontalAlignment = Alignment.End) {
                TextAction("Enregistrer", onClick = onSave)
                TextAction("Ne pas enregistrer", color = Neo.Today, onClick = onDiscard)
                TextAction("Continuer", color = Neo.TextSecondary, onClick = onCancel)
            }
        },
    )
}

@Composable
fun ConfirmDialog(title: String, message: String, confirm: String, onConfirm: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = Neo.Surface,
        title = { Text(title, color = Neo.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) },
        text = { Text(message, color = Neo.TextSecondary, fontSize = 14.sp) },
        confirmButton = { TextAction(confirm, color = Neo.Today, onClick = onConfirm) },
        dismissButton = { TextAction("Annuler", color = Neo.TextSecondary, onClick = onCancel) },
    )
}

@Composable
fun DeleteOccurrenceDialog(isTask: Boolean, onChoose: (following: Boolean) -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = Neo.Surface,
        title = {
            Text(
                if (isTask) "Supprimer la tâche récurrente" else "Supprimer l'événement récurrent",
                color = Neo.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
            )
        },
        text = { Text(if (isTask) "Que supprimer de cette série de tâches ?" else "Que supprimer de cette série ?", color = Neo.TextSecondary, fontSize = 14.sp) },
        confirmButton = {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
                TextAction(if (isTask) "Supprimer cette tâche uniquement" else "Supprimer cet événement uniquement", color = Neo.Today) { onChoose(false) }
                TextAction(
                    if (isTask) "Supprimer cette tâche et toutes les suivantes" else "Supprimer cet événement et toutes les suivantes",
                    color = Neo.Today,
                ) { onChoose(true) }
                TextAction("Annuler", color = Neo.TextSecondary, onClick = onCancel)
            }
        },
    )
}
