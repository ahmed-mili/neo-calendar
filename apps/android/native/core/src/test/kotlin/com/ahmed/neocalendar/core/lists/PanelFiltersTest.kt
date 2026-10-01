package com.ahmed.neocalendar.core.lists

import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class PanelFiltersTest {
    private val paris = ZoneId.of("Europe/Paris")
    private fun at(d: Int, h: Int): Instant = ZonedDateTime.of(2026, 10, d, h, 0, 0, 0, paris).toInstant()

    private fun event(
        id: String,
        title: String = id,
        start: Instant = at(1, 9),
        end: Instant = at(1, 10),
        task: String? = null,
        someday: Boolean = false,
        allDay: Boolean = false,
        description: String? = null,
    ) = DisplayEvent(
        id, title, start, end, allDay, "#89b4fa", true, "cal", "Cal", task != null, JsonPrimitive(task == "complete"),
        task, null, false, false, false, someday, description, null,
    )

    private fun run(
        events: List<DisplayEvent>,
        status: StatusFilter = StatusFilter.ALL,
        date: DateFilter = DateFilter.ALL,
        query: String = "",
        period: PanelPeriod? = null,
        hidden: Set<String> = emptySet(),
        feeds: Map<String, String> = emptyMap(),
    ) = filterPanelEvents(events, status, date, query, period, hidden, paris) { feeds[it.id] }.map { it.id }

    @Test fun statutNeGardeQueLesTachesDeCeStatut() {
        val all = listOf(event("a"), event("b", task = "todo"), event("c", task = "complete"))
        assertEquals(listOf("b"), run(all, status = StatusFilter.TODO))
        assertEquals(listOf("c"), run(all, status = StatusFilter.COMPLETE))
        assertEquals(listOf("a", "b", "c"), run(all))
    }

    @Test fun dateSepareLesSansDate() {
        val all = listOf(event("a"), event("s", someday = true))
        assertEquals(listOf("a"), run(all, date = DateFilter.SCHEDULED))
        assertEquals(listOf("s"), run(all, date = DateFilter.UNSCHEDULED))
    }

    @Test fun laPeriodeRecoupeParLesDeuxBouts() {
        val inside = event("in", start = at(5, 9), end = at(5, 10))
        val straddle = event("straddle", start = at(2, 22), end = at(3, 2))
        val before = event("before", start = at(1, 9), end = at(1, 10))
        val after = event("after", start = at(8, 9), end = at(8, 10))
        val period = PanelPeriod(LocalDate.of(2026, 10, 3), LocalDate.of(2026, 10, 7))
        assertEquals(listOf("straddle", "in"), run(listOf(before, straddle, inside, after), date = DateFilter.PERIOD, period = period))
        // Une période absente ou inversée ne retient rien.
        assertEquals(emptyList<String>(), run(listOf(inside), date = DateFilter.PERIOD, period = null))
        assertEquals(
            emptyList<String>(),
            run(listOf(inside), date = DateFilter.PERIOD, period = PanelPeriod(LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 3))),
        )
    }

    @Test fun laRechercheLitLeTitreEtLaDescriptionSansAccents() {
        val all = listOf(event("a", title = "Déjeuner"), event("b", description = "chez Élodie"), event("c"))
        assertEquals(listOf("a"), run(all, query = "dejeuner"))
        assertEquals(listOf("b"), run(all, query = "ELODIE"))
    }

    @Test fun isolerUnLienCacheLesNotesPersonnelles() {
        val all = listOf(event("note"), event("x"), event("y"))
        val feeds = mapOf("x" to "feedX", "y" to "feedY")
        assertEquals(listOf("x"), run(all, hidden = setOf(NO_ICS_FEED, "feedY"), feeds = feeds))
        assertEquals(listOf("note", "y"), run(all, hidden = setOf("feedX"), feeds = feeds))
    }

    @Test fun lesTotauxIgnorentSansDateEtJourneesEntieres() {
        val events = listOf(
            event("a", start = at(1, 9), end = at(1, 10)),
            event("b", start = at(1, 9), end = at(1, 10), task = "todo"),
            event("c", allDay = true, start = at(1, 0), end = at(2, 0)),
            event("d", someday = true),
        )
        val summary = summarizePanelEvents(events)
        assertEquals(120L, summary.totalMinutes)
        assertEquals(1, summary.taskCount)
        assertEquals("2h 00min", formatTotalMinutes(summary.totalMinutes))
        assertEquals("0h 05min", formatTotalMinutes(5))
    }

    @Test fun laPeriodeSEcritAvecLAnneeDeLaFin() {
        val period = PanelPeriod(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31))
        assertEquals("1 oct – 31 oct 2026", formatPanelPeriod(DateFilter.PERIOD, period))
        assertEquals(
            "30 déc 2026 – 2 janv 2027",
            formatPanelPeriod(DateFilter.PERIOD, PanelPeriod(LocalDate.of(2026, 12, 30), LocalDate.of(2027, 1, 2))),
        )
        assertEquals("Toutes les dates", formatPanelPeriod(DateFilter.ALL, null))
    }

    @Test fun leNomDeCouleurSuitLaPalette() {
        assertEquals("Bleu", calendarColorName("#4CA8DF"))
        assertEquals("Personnalisé", calendarColorName("#123456"))
    }
}
