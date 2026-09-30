package com.ahmed.neocalendar.core.form

import com.ahmed.neocalendar.core.recurrence.PresetKey
import com.ahmed.neocalendar.core.recurrence.defaultRecurrence
import com.ahmed.neocalendar.core.recurrence.presetToRecurrence

/*
 * Les gestes de la fiche qui changent plusieurs champs à la fois, tels que
 * EventPanel.tsx les fait : journée entière, effacer la date, choisir une
 * répétition, cocher un jour d'une série.
 */

/**
 * « Toute la journée ». En la décochant, un évènement qui n'a jamais eu
 * d'heures en reçoit (12:00 à 12:30) : sans elles il resterait collé en haut de
 * la journée. Un évènement qui en avait garde les siennes.
 */
fun EventFormValues.withAllDay(next: Boolean): EventFormValues {
    val toggled = copy(allDay = next)
    return if (!next && startTime.isEmpty()) toggled.copy(startTime = "12:00", endTime = "12:30") else toggled
}

/**
 * Retour à la liste des évènements sans date. Tout ce qu'un évènement daté est
 * seul à porter part avec la date : une répétition laissée en place écrirait une
 * série dont la date de départ est vide, des heures laissées en place garderaient
 * `allDay: false`.
 */
fun EventFormValues.withClearedDate(): EventFormValues = copy(
    date = "",
    endDate = null,
    isRecurring = false,
    allDay = true,
    startTime = "",
    endTime = "",
)

/**
 * « Répéter » : `null` est « une seule fois ». Une échéance décrit un seul jour,
 * une série n'en a pas.
 */
fun EventFormValues.withRepeat(key: PresetKey?): EventFormValues {
    if (key == null) return copy(isRecurring = false)
    val recurrence = if (key == PresetKey.Custom) {
        if (isRecurring) recurrence else defaultRecurrence(date)
    } else {
        presetToRecurrence(key, date)
    }
    return copy(isRecurring = true, recurrence = recurrence, due = null)
}

/** Un jour d'une série coché ou décoché ; la liste reste triée pour que la note ne change pas d'ordre à chaque édition. */
fun EventFormValues.withOccurrenceStatus(day: String, complete: Boolean): EventFormValues {
    val done = (completedDates ?: emptyList()).toMutableSet()
    if (complete) done += day else done -= day
    return copy(completedDates = done.sorted())
}
