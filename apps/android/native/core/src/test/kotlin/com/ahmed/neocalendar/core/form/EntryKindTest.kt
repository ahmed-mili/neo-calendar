package com.ahmed.neocalendar.core.form

import com.ahmed.neocalendar.core.recurrence.Freq
import com.ahmed.neocalendar.core.recurrence.RecurEnd
import com.ahmed.neocalendar.core.recurrence.defaultRecurrence
import com.ahmed.neocalendar.core.recurrence.recurrenceSummary
import com.ahmed.neocalendar.core.recurrence.RecurrenceState
import com.ahmed.neocalendar.core.recurrence.MonthMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EntryKindTest {
    private val base = EventFormValues(
        date = "2026-08-12", startTime = "09:00", endTime = "10:00", recurrence = defaultRecurrence("2026-08-12"),
    )

    // EventPanel.tsx : tâche si le statut est posé, anniversaire si annuel sur la journée, sinon évènement.
    @Test fun kindIsReadFromTheForm() {
        assertEquals(EntryKind.Event, entryKindOf(base))
        assertEquals(EntryKind.Task, entryKindOf(base.copy(taskStatus = "todo")))
        val yearly = base.copy(allDay = true, isRecurring = true, recurrence = base.recurrence.copy(freq = Freq.Yearly))
        assertEquals(EntryKind.Birthday, entryKindOf(yearly))
        assertEquals(EntryKind.Task, entryKindOf(yearly.copy(taskStatus = "todo")))
        assertEquals(EntryKind.Event, entryKindOf(yearly.copy(allDay = false)))
        assertEquals(EntryKind.Event, entryKindOf(yearly.copy(isRecurring = false)))
    }

    @Test fun taskIsAStatus() {
        val change = applyEntryKind(base, EntryKind.Task, null)
        assertEquals("todo", change.values.taskStatus)
        assertEquals(null, applyEntryKind(change.values, EntryKind.Event, null).values.taskStatus)
    }

    // Évènement, Anniversaire, Évènement : l'horaire d'origine revient.
    @Test fun birthdayIsReversible() {
        val toBirthday = applyEntryKind(base, EntryKind.Birthday, null)
        val birthday = toBirthday.values
        assertEquals(true, birthday.allDay)
        assertEquals(true, birthday.isRecurring)
        assertEquals(Freq.Yearly, birthday.recurrence.freq)
        assertEquals(EntryKind.Birthday, entryKindOf(birthday))

        val back = applyEntryKind(birthday, EntryKind.Event, toBirthday.birthdayReturn)
        assertEquals(false, back.values.allDay)
        assertEquals(false, back.values.isRecurring)
        assertEquals("09:00", back.values.startTime)
        assertEquals("10:00", back.values.endTime)
        assertNull(back.birthdayReturn)
    }

    @Test fun aSavedBirthdayHasNothingToRestore() {
        val saved = base.copy(allDay = true, startTime = "", endTime = "", isRecurring = true, recurrence = base.recurrence.copy(freq = Freq.Yearly))
        val back = applyEntryKind(saved, EntryKind.Event, null).values
        assertEquals(true, back.allDay)
        assertEquals(false, back.isRecurring)
    }

    @Test fun birthdayDropsTheDeadline() {
        val task = base.copy(taskStatus = "todo", due = "2026-09-01")
        val change = applyEntryKind(task, EntryKind.Birthday, null)
        assertEquals(null, change.values.taskStatus)
        assertEquals(null, change.values.due)
    }

    // recurrenceSummary lit la date de fin avec l'année courante : les cas du corpus n'en ont pas, en voici avec une année explicite.
    @Test fun summaryReadsTheEndDateWithTheYear() {
        val state = RecurrenceState(Freq.Daily, 1, emptyList(), MonthMode.DayOfMonth, RecurEnd.Until("2026-08-30"))
        assertEquals("Tous les jours, jusqu'au dim 30 août", recurrenceSummary(state, currentYear = 2026))
        assertEquals("Tous les jours, jusqu'au dim 30 août 2026", recurrenceSummary(state, currentYear = 2025))
        val weekly = RecurrenceState(Freq.Weekly, 2, listOf("M"), MonthMode.DayOfMonth, RecurEnd.Until("2027-01-04"))
        assertEquals("Toutes les 2 semaines le lundi, jusqu'au lun 4 janv 2027", recurrenceSummary(weekly, currentYear = 2026))
    }
}
