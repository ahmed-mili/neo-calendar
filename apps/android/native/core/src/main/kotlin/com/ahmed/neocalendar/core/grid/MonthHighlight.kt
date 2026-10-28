package com.ahmed.neocalendar.core.grid

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Un tronçon de bande dans une rangée du sélecteur ; colonnes 0..6, bornes incluses. */
data class HighlightSegment(val row: Int, val fromCol: Int, val toCol: Int)

/**
 * La bande suit les jours affichés dans la grille de l'agenda, pas la semaine
 * d'aujourd'hui : un tronçon par rangée touchée, rognée aux `rows` rangées visibles.
 */
fun highlightSegments(gridStart: LocalDate, rows: Int, first: LocalDate, count: Int): List<HighlightSegment> {
    if (count <= 0) return emptyList()
    val lastIndex = rows * 7 - 1
    val from = ChronoUnit.DAYS.between(gridStart, first).coerceAtLeast(0)
    val to = (ChronoUnit.DAYS.between(gridStart, first) + count - 1).coerceAtMost(lastIndex.toLong())
    if (from > to) return emptyList()
    return (from / 7..to / 7).map { row ->
        HighlightSegment(
            row.toInt(),
            if (row == from / 7) (from % 7).toInt() else 0,
            if (row == to / 7) (to % 7).toInt() else 6,
        )
    }
}
