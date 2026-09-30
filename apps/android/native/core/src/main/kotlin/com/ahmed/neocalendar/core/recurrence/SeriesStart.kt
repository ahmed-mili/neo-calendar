package com.ahmed.neocalendar.core.recurrence

import com.ahmed.neocalendar.core.notes.NeoEvent

private val DAY_ORDER = listOf("U", "M", "T", "W", "R", "F", "S")

/**
 * Port de `seriesStartDate` (src/ui/calendar/recurrenceDeletion.ts) : la date où
 * la série commence à se voir, sa première occurrence non supprimée. Null quand
 * l'évènement ne se répète pas, n'a pas d'ancrage, ou n'a plus rien.
 *
 * Seule la série par jours est portée ici ; la branche `rrule` suit avec
 * l'expansion `rrule`.
 */
fun seriesStartDate(event: NeoEvent): String? {
    if (event !is NeoEvent.Recurring) return null
    val startRecur = event.startRecur
    if (startRecur.isNullOrEmpty()) return null
    val days = event.daysOfWeek.map { DAY_ORDER.indexOf(it) }.filter { it >= 0 }.toSet()
    if (days.isEmpty()) return null
    val skip = event.skipDates.toSet()
    val end = event.endRecur?.takeIf { it.isNotEmpty() }
    // Une série par jours rencontre l'un de ses jours dans toute suite de sept :
    // sept jours par date écartée couvrent toujours la recherche.
    val limit = 7 * (skip.size + 1)
    var day = parseIsoDate(startRecur) ?: return null
    repeat(limit) {
        val iso = day.toString()
        if (end != null && iso > end) return null
        // luxon compte lundi = 1 … dimanche = 7 ; `% 7` ramène dimanche à 0, comme DAY_ORDER.
        if (day.dayOfWeek.value % 7 in days && iso !in skip) return iso
        day = day.plusDays(1)
    }
    return null
}
