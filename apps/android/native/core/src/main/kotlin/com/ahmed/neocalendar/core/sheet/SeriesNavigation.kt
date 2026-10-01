package com.ahmed.neocalendar.core.sheet

import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.recurrence.parseOccurrenceId
import com.ahmed.neocalendar.core.recurrence.rruleInstants
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/*
 * Port de `seriesNavigation.ts` : d'une occurrence d'une série à la suivante ou à la précédente, pour les flèches de la
 * fiche. Les dates sont recalculées depuis la règle (la voisine d'une règle annuelle est à onze mois de la fenêtre
 * visible), avec le même ancrage UTC que l'expansion ; les jours de `skipDates` sont enjambés.
 */

/** La date de l'occurrence voisine (`direction` = +1 ou -1), ou null : série terminée, pas commencée, ou pas une série. */
fun adjacentOccurrenceDate(event: NeoEvent?, fromDate: String, direction: Int): String? {
    if (event == null || fromDate.isEmpty()) return null
    when (event) {
        is NeoEvent.Rrule -> {
            val instants = rruleInstants(event) ?: return null
            val skip = event.skipDates.toSet()
            val cursor = runCatching { LocalDate.parse(fromDate).atStartOfDay(ZoneOffset.UTC).toInstant() }.getOrNull() ?: return null
            return try {
                if (direction > 0) {
                    instants.firstNotNullOfOrNull { found -> dayOf(found).takeIf { found > cursor && it !in skip } }
                } else {
                    var previous: String? = null
                    for (found in instants) {
                        if (found >= cursor) break
                        val day = dayOf(found)
                        if (day !in skip) previous = day
                    }
                    previous
                }
            } catch (_: Exception) {
                null
            }
        }
        is NeoEvent.Recurring -> {
            val order = listOf("U", "M", "T", "W", "R", "F", "S")
            val days = event.daysOfWeek.map { order.indexOf(it) }.filter { it >= 0 }.toSet()
            if (days.isEmpty()) return null
            val skip = event.skipDates.toSet()
            val start = event.startRecur?.takeIf { it.isNotEmpty() }
            val end = event.endRecur?.takeIf { it.isNotEmpty() }
            // Une série hebdomadaire rencontre un de ses jours dans n'importe quels sept jours consécutifs.
            val limit = 7 * (skip.size + 1)
            var day = runCatching { LocalDate.parse(fromDate) }.getOrNull() ?: return null
            repeat(limit) {
                day = day.plusDays(direction.toLong())
                val iso = day.toString()
                if (direction > 0 && end != null && iso > end) return null
                if (direction < 0 && start != null && iso < start) return null
                if (day.dayOfWeek.value % 7 in days && iso !in skip) return iso
            }
            return null
        }
        else -> return null
    }
}

private fun dayOf(instant: Instant): String = instant.atZone(ZoneOffset.UTC).toLocalDate().toString()

/** L'identifiant d'affichage de l'occurrence voisine, prêt à être ouvert, avec sa date ; null quand le panneau ne regarde pas un jour daté. */
fun adjacentOccurrenceId(event: NeoEvent?, displayId: String?, direction: Int): Pair<String, String>? {
    if (displayId == null) return null
    val (stored, day) = parseOccurrenceId(displayId) ?: return null
    val date = adjacentOccurrenceDate(event, day, direction) ?: return null
    return "${stored}_$date" to date
}
