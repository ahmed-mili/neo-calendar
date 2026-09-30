package com.ahmed.neocalendar.core.layout

import java.text.Collator
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/*
 * Port de useAllDayLanes.ts, sans le hook React : le rang d'arrivée d'un
 * évènement (`arrivalOf`) est fourni par l'appelant.
 */

data class AllDayLaneBar(
    val event: GridEvent,
    /** Premier index de colonne visible, dans `extendedDates`. */
    val startIdx: Int,
    /** Nombre de colonnes couvertes. */
    val span: Int,
    /** Rangée empilée, à partir de 0. */
    val lane: Int,
)

data class AllDayLanesResult(val bars: List<AllDayLaneBar>, val laneCount: Int)

/** `String.prototype.localeCompare` : ordre du dictionnaire, pas ordre des unités UTF-16. */
private val idCollator: Collator = Collator.getInstance(Locale.ENGLISH).apply {
    strength = Collator.TERTIARY
    decomposition = Collator.CANONICAL_DECOMPOSITION
}

private class Placed(val event: GridEvent, val startIdx: Int, val endIdx: Int, val span: Int)

/** Range chaque évènement journée entière en barre dans la première rangée libre
 *  sur ses jours, dans l'ordre d'arrivée. La fin est exclusive : le dernier jour
 *  inclus est celui de `end - 1 ms`. */
fun packAllDayLanes(
    allDayEvents: List<GridEvent>?,
    extendedDates: List<Instant>,
    arrivalOf: (GridEvent) -> Long,
    zone: ZoneId = ZoneId.systemDefault(),
): AllDayLanesResult {
    if (allDayEvents.isNullOrEmpty() || extendedDates.isEmpty()) return AllDayLanesResult(emptyList(), 0)

    val placed = mutableListOf<Placed>()
    for (event in allDayEvents) {
        val lastDay = startOfDay(event.end.minusMillis(1), zone)

        var startIdx = extendedDates.indexOfFirst { isSameDay(it, event.start, zone) }
        if (startIdx == -1) {
            startIdx = extendedDates.indexOfFirst { event.start <= it && it <= lastDay }
            if (startIdx == -1) continue
        }

        var span = 1
        for (i in startIdx + 1 until extendedDates.size) {
            if (extendedDates[i] > lastDay && !isSameDay(extendedDates[i], lastDay, zone)) break
            span++
        }
        placed.add(Placed(event, startIdx, startIdx + span - 1, span))
    }

    val ordered = placed.sortedWith { a, b ->
        var c = arrivalOf(a.event).compareTo(arrivalOf(b.event))
        if (c == 0) c = a.startIdx.compareTo(b.startIdx)
        if (c == 0) c = b.span.compareTo(a.span)
        if (c == 0) c = a.event.start.compareTo(b.event.start)
        if (c == 0) c = idCollator.compare(a.event.id, b.event.id)
        c
    }

    val laneSpans = mutableListOf<MutableList<IntRange>>()
    val bars = mutableListOf<AllDayLaneBar>()
    for (p in ordered) {
        var lane = laneSpans.indexOfFirst { spans -> spans.all { p.endIdx < it.first || p.startIdx > it.last } }
        if (lane == -1) {
            lane = laneSpans.size
            laneSpans.add(mutableListOf())
        }
        laneSpans[lane].add(p.startIdx..p.endIdx)
        bars.add(AllDayLaneBar(p.event, p.startIdx, p.span, lane))
    }
    return AllDayLanesResult(bars, laneSpans.size)
}

/** La rangée visible la plus haute, plus un ; 0 quand aucune barre n'est à l'écran. */
fun visibleLaneCount(bars: List<AllDayLaneBar>, firstVisibleIdx: Int, lastVisibleIdx: Int): Int {
    var highest = -1
    for (bar in bars) {
        val endIdx = bar.startIdx + bar.span - 1
        if (endIdx < firstVisibleIdx || bar.startIdx > lastVisibleIdx) continue
        if (bar.lane > highest) highest = bar.lane
    }
    return highest + 1
}

/** Par index de colonne visible, le nombre TOTAL d'évènements du jour, pour les
 *  seuls jours où au moins une barre sort de `visibleRows` rangées. */
fun hiddenBarCountByDay(
    bars: List<AllDayLaneBar>,
    firstVisibleIdx: Int,
    lastVisibleIdx: Int,
    visibleRows: Int,
): Map<Int, Int> {
    val totals = HashMap<Int, Int>()
    val hasHidden = LinkedHashSet<Int>()
    for (bar in bars) {
        val from = maxOf(bar.startIdx, firstVisibleIdx)
        val to = minOf(bar.startIdx + bar.span - 1, lastVisibleIdx)
        for (idx in from..to) {
            totals[idx] = (totals[idx] ?: 0) + 1
            if (bar.lane >= visibleRows) hasHidden.add(idx)
        }
    }
    val counts = LinkedHashMap<Int, Int>()
    for (idx in hasHidden) counts[idx] = totals[idx] ?: 0
    return counts
}

data class AllDayBandRows(val contentRows: Int, val visibleRows: Int)

/** Les rangées de la bande : toujours UNE de plus que nécessaire, vide, pour
 *  pouvoir y ajouter un évènement ; plafonnée à `maxRows`, une seule si repliée. */
fun allDayBandRows(laneCount: Int, draftLane: Int?, collapsed: Boolean, maxRows: Int): AllDayBandRows {
    val taken = maxOf(laneCount, if (draftLane == null) 0 else draftLane + 1)
    val contentRows = taken + 1
    return AllDayBandRows(contentRows, if (collapsed) 1 else minOf(contentRows, maxRows))
}
