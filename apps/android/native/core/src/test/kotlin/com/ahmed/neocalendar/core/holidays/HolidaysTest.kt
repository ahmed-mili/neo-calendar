package com.ahmed.neocalendar.core.holidays

import com.ahmed.neocalendar.core.grid.buildCalendarModels
import com.ahmed.neocalendar.core.preferences.FRANCE_HOLIDAY_SOURCE
import com.ahmed.neocalendar.core.preferences.withHolidayCalendar
import com.ahmed.neocalendar.core.preferences.withHolidayRemoved
import com.ahmed.neocalendar.core.workspace.WorkspaceCalendar
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HolidaysTest {
    private val paris = ZoneId.of("Europe/Paris")
    private val france = (FRANCE_HOLIDAY_SOURCE["rules"] as JsonArray).map { it as JsonObject }

    private fun day(year: Int, name: String) = expandHolidayRules(france, year, year).filter { it.name == name }.map { it.date }

    @Test fun paquesSuitLAlgorithmeGregorien() {
        assertEquals(LocalDate.of(2024, 3, 31), easterSunday(2024))
        assertEquals(LocalDate.of(2026, 4, 5), easterSunday(2026))
        assertEquals(LocalDate.of(2027, 3, 28), easterSunday(2027))
        assertEquals(LocalDate.of(2038, 4, 25), easterSunday(2038))
    }

    @Test fun lesFetesMobilesSuiventPaques() {
        assertEquals(listOf(LocalDate.of(2026, 4, 6)), day(2026, "Le lundi de Pâques"))
        assertEquals(listOf(LocalDate.of(2026, 5, 14)), day(2026, "L'Ascension"))
        assertEquals(listOf(LocalDate.of(2026, 5, 24)), day(2026, "Pentecôte"))
        assertEquals(listOf(LocalDate.of(2026, 5, 25)), day(2026, "Le lundi de Pentecôte"))
    }

    @Test fun lesDatesFixesEtLesJoursDeSemaine() {
        assertEquals(listOf(LocalDate.of(2026, 12, 25)), day(2026, "Noël"))
        assertEquals(listOf(LocalDate.of(2026, 7, 14)), day(2026, "La fête nationale"))
        // Dernier dimanche de mars et d'octobre, troisième dimanche de juin.
        assertEquals(listOf(LocalDate.of(2026, 3, 29)), day(2026, "Heure d'été"))
        assertEquals(listOf(LocalDate.of(2026, 10, 25)), day(2026, "Heure d'hiver"))
        assertEquals(listOf(LocalDate.of(2026, 6, 21)), day(2026, "Fête des Pères"))
    }

    @Test fun laFeteDesMeresCedeLaPlaceALaPentecote() {
        // 2026 : le dernier dimanche de mai (31) n'est pas la Pentecôte (24).
        assertEquals(listOf(LocalDate.of(2026, 5, 31)), day(2026, "Fête des Mères"))
        // 2023 : le dernier dimanche de mai (28) est la Pentecôte (Pâques 9 avril + 49) : une semaine plus tard.
        assertEquals(listOf(LocalDate.of(2023, 6, 4)), day(2023, "Fête des Mères"))
    }

    @Test fun uneDateFixeInexistanteNEstPasProduite() {
        val rule = JsonObject(mapOf("n" to JsonPrimitive("Bissextile"), "k" to JsonPrimitive("f"), "m" to JsonPrimitive(2), "d" to JsonPrimitive(29)))
        assertEquals(listOf(LocalDate.of(2028, 2, 29)), expandHolidayRules(listOf(rule), 2026, 2030).map { it.date })
    }

    @Test fun lesDatesListeesEtLesJoursDeLaSemaine() {
        val listed = JsonObject(
            mapOf(
                "n" to JsonPrimitive("Aïd"), "k" to JsonPrimitive("x"),
                "d" to JsonArray(listOf(JsonPrimitive("2026-03-20"), JsonPrimitive("2027-03-10"))),
            ),
        )
        assertEquals(listOf(LocalDate.of(2026, 3, 20)), expandHolidayRules(listOf(listed), 2026, 2026).map { it.date })
        val mondays = JsonObject(mapOf("n" to JsonPrimitive("Lundi"), "k" to JsonPrimitive("w"), "w" to JsonPrimitive(1)))
        assertEquals(52, expandHolidayRules(listOf(mondays), 2026, 2026).size)
    }

    @Test fun lesReglesHijriNeProduisentRien() {
        val hijri = JsonObject(mapOf("n" to JsonPrimitive("Achoura"), "k" to JsonPrimitive("h"), "hm" to JsonPrimitive(1), "hd" to JsonPrimitive(10)))
        assertTrue(expandHolidayRules(listOf(hijri), 2026, 2027).isEmpty())
    }

    @Test fun lesEvenementsSontEnLectureSeuleSurUneJourneeEntiere() {
        val source = HolidaySource("FR", "Fériés", "#4a9d5f", france)
        val events = holidayDisplayEvents(source, 2026, paris)
        val noel = events.first { it.title == "Noël" && it.start == LocalDate.of(2026, 12, 25).atStartOfDay(paris).toInstant() }
        assertTrue(noel.allDay)
        assertFalse(noel.editable)
        assertEquals(LocalDate.of(2026, 12, 26).atStartOfDay(paris).toInstant(), noel.end)
        assertEquals("auto::FR", noel.calendarId)
        assertEquals("auto-FR-2026-12-25-no-l", noel.id)
        // Cinq ans avant, dix ans après : 16 années de 19 fêtes.
        assertEquals(16 * 19, events.size)
        assertEquals(events.size, events.map { it.id }.toSet().size)
    }

    @Test fun deuxFetesLeMemeJourGardentDesIdentifiantsDistincts() {
        val one = JsonObject(mapOf("n" to JsonPrimitive("Fête"), "k" to JsonPrimitive("f"), "m" to JsonPrimitive(1), "d" to JsonPrimitive(1)))
        val ids = holidayDisplayEvents(HolidaySource("X", "X", "#fff", listOf(one, one)), 2026, paris).map { it.id }
        assertEquals(ids.size, ids.toSet().size)
    }

    @Test fun lesSourcesViennentDesPreferencesEtLaCouleurDuTiroirPrime() {
        val prefs = withHolidayCalendar(JsonObject(emptyMap()), "Mes fériés", "#4a9d5f")
        val chosen = JsonObject(prefs + ("colors" to JsonObject(mapOf("auto::FR" to JsonPrimitive("#112233")))))
        val source = holidaySourcesOf(chosen).single()
        assertEquals("Mes fériés", source.name)
        assertEquals("#112233", source.color)
        assertEquals("auto::FR", source.calendarId)
    }

    @Test fun leCalendrierAutomatiqueRejointLesDossiersDansLOrdre() {
        val prefs = JsonObject(mapOf("order" to JsonArray(listOf(JsonPrimitive("auto::FR"), JsonPrimitive("Islam")))))
        val source = HolidaySource("FR", "Fériés", "#4a9d5f", france)
        val models = buildCalendarModels(listOf(WorkspaceCalendar("Islam", "Islam"), WorkspaceCalendar("Etudes", "Etudes")), prefs, holidays = listOf(source))
        assertEquals(listOf("auto::FR", "Islam", "Etudes"), models.map { it.relativePath })
        assertFalse(models.first().editable)
        assertEquals("auto::FR", models.first().id)
    }

    @Test fun retirerUnCalendrierAutomatiqueEffaceToutesSesTraces() {
        var prefs = withHolidayCalendar(JsonObject(emptyMap()), null, "#4a9d5f")
        prefs = JsonObject(
            prefs + mapOf(
                "hiddenCalendarPaths" to JsonArray(listOf(JsonPrimitive("auto::FR"), JsonPrimitive("Islam"))),
                "defaultCalendarPath" to JsonPrimitive("auto::FR"),
                "calendarReminderMinutes" to JsonObject(mapOf("auto::FR" to JsonArray(listOf(JsonPrimitive(5))), "Islam" to JsonArray(listOf(JsonPrimitive(10))))),
            ),
        )
        val next = withHolidayRemoved(prefs, "auto::FR")
        assertEquals(JsonArray(emptyList()), next["externalCalendars"])
        assertEquals(JsonObject(emptyMap()), next["colors"])
        assertEquals(JsonArray(emptyList()), next["order"])
        assertEquals(JsonArray(listOf(JsonPrimitive("Islam"))), next["hiddenCalendarPaths"])
        assertEquals(JsonObject(mapOf("Islam" to JsonArray(listOf(JsonPrimitive(10))))), next["calendarReminderMinutes"])
        assertFalse("defaultCalendarPath" in next)
    }
}
