package com.ahmed.neocalendar.core.layout

/** Un évènement placé dans sa colonne, sur `totalColumns` colonnes. */
data class OverlapItem(val event: GridEvent, val column: Int, val totalColumns: Int)

data class OverlapGroup(val events: List<OverlapItem>)

/** Port de `computeOverlapGroups` (CalendarUtils.ts) : les évènements qui se
 *  chevauchent, de proche en proche, forment un groupe ; chacun prend la
 *  première colonne dont le dernier évènement est fini. */
fun computeOverlapGroups(events: List<GridEvent>): List<OverlapGroup> {
    if (events.isEmpty()) return emptyList()

    // Début croissant, puis durée décroissante ; le tri est stable comme en JS.
    val sorted = events.sortedWith { a, b ->
        val startDiff = a.start.compareTo(b.start)
        if (startDiff != 0) {
            startDiff
        } else {
            val durA = a.end.toEpochMilli() - a.start.toEpochMilli()
            val durB = b.end.toEpochMilli() - b.start.toEpochMilli()
            durB.compareTo(durA)
        }
    }

    val groups = mutableListOf<OverlapGroup>()
    val assigned = HashSet<String>()

    for (event in sorted) {
        if (event.id in assigned) continue

        val placed = mutableListOf<Pair<GridEvent, Int>>()
        val columns = mutableListOf<MutableList<GridEvent>>()

        fun assignToColumn(ev: GridEvent): Int {
            for (c in columns.indices) {
                if (columns[c].last().end <= ev.start) {
                    columns[c].add(ev)
                    return c
                }
            }
            columns.add(mutableListOf(ev))
            return columns.size - 1
        }

        val queue = ArrayDeque<GridEvent>()
        queue.add(event)
        assigned.add(event.id)

        while (queue.isNotEmpty()) {
            val current = queue.removeFirst()
            placed.add(current to assignToColumn(current))

            for (ev in sorted) {
                if (ev.id in assigned) continue
                if (ev.start < current.end && ev.end > current.start) {
                    assigned.add(ev.id)
                    queue.add(ev)
                }
            }
        }

        val total = columns.size
        groups.add(OverlapGroup(placed.map { (ev, col) -> OverlapItem(ev, col, total) }))
    }

    return groups
}
