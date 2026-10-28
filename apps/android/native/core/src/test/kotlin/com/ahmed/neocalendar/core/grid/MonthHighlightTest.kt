package com.ahmed.neocalendar.core.grid

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MonthHighlightTest {
    private val start = LocalDate.of(2026, 10, 26)

    @Test fun threeDaysInOneRow() =
        assertEquals(listOf(HighlightSegment(0, 2, 4)), highlightSegments(start, 6, LocalDate.of(2026, 10, 28), 3))

    @Test fun splitsAcrossWeeks() = assertEquals(
        listOf(HighlightSegment(0, 5, 6), HighlightSegment(1, 0, 0)),
        highlightSegments(start, 6, LocalDate.of(2026, 10, 31), 3),
    )

    @Test fun clipsToVisibleRows() {
        val segs = highlightSegments(start, 6, LocalDate.of(2026, 10, 20), 60)
        assertEquals(HighlightSegment(0, 0, 6), segs.first())
        assertEquals(5, segs.last().row)
        assertEquals(6, segs.size)
    }

    @Test fun outsideTheGridGivesNothing() =
        assertTrue(highlightSegments(start, 6, LocalDate.of(2027, 1, 10), 3).isEmpty())
}
