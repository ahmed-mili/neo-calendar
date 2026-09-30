package com.ahmed.neocalendar.core.form

import com.ahmed.neocalendar.core.recurrence.Freq
import com.ahmed.neocalendar.core.recurrence.PresetKey
import com.ahmed.neocalendar.core.recurrence.RecurrenceState
import com.ahmed.neocalendar.core.recurrence.presetToRecurrence

/*
 * Port de entryKindSelection.ts et de la lecture de `entryKind` (EventPanel.tsx) :
 * Évènement, Tâche ou Anniversaire. Un anniversaire n'est pas enregistré, il est
 * lu : c'est un évènement sur la journée entière qui revient chaque année.
 */

enum class EntryKind { Event, Task, Birthday }

fun entryKindOf(values: EventFormValues): EntryKind = when {
    values.taskStatus != null -> EntryKind.Task
    values.allDay && values.isRecurring && values.recurrence.freq == Freq.Yearly -> EntryKind.Birthday
    else -> EntryKind.Event
}

/** Le calendrier que l'Anniversaire a remplacé, pour que Évènement, Anniversaire, Évènement soit réversible. */
data class BirthdayReturn(
    val allDay: Boolean,
    val isRecurring: Boolean,
    val recurrence: RecurrenceState,
    val startTime: String,
    val endTime: String,
)

data class KindChange(val values: EventFormValues, val birthdayReturn: BirthdayReturn?)

fun applyEntryKind(values: EventFormValues, next: EntryKind, birthdayReturn: BirthdayReturn?): KindChange {
    val current = entryKindOf(values)
    var saved = birthdayReturn
    if (current != EntryKind.Birthday && next == EntryKind.Birthday) {
        saved = BirthdayReturn(values.allDay, values.isRecurring, values.recurrence, values.startTime, values.endTime)
    }

    var result = values.copy(taskStatus = if (next == EntryKind.Task) "todo" else null)

    if (current == EntryKind.Birthday && next != EntryKind.Birthday) {
        result = if (saved != null) {
            result.copy(
                allDay = saved.allDay,
                startTime = saved.startTime,
                endTime = saved.endTime,
                isRecurring = saved.isRecurring,
                recurrence = if (saved.isRecurring) saved.recurrence else result.recurrence,
            )
        } else {
            // Un anniversaire déjà enregistré n'a rien à restaurer : il reste sur la journée, sans la répétition.
            result.copy(isRecurring = false)
        }
        saved = null
    }

    if (next == EntryKind.Birthday) {
        result = result.copy(
            allDay = true,
            isRecurring = true,
            recurrence = presetToRecurrence(PresetKey.Yearly, values.date),
            due = null,
        )
    }
    return KindChange(result, saved)
}
