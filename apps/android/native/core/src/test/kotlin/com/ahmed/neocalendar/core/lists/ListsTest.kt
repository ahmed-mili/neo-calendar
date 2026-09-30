package com.ahmed.neocalendar.core.lists

import com.ahmed.neocalendar.core.format.formatCardDate
import com.ahmed.neocalendar.core.format.formatClock
import com.ahmed.neocalendar.core.format.formatDatedDay
import com.ahmed.neocalendar.core.format.formatDatedDayWithYear
import com.ahmed.neocalendar.core.format.formatDuration
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.tasks.TaskItem
import com.ahmed.neocalendar.core.tasks.buildDesktopTaskGroups
import com.ahmed.neocalendar.core.tasks.collectTasks
import com.ahmed.neocalendar.core.tasks.getTaskStatus
import com.ahmed.neocalendar.core.tasks.isOverdue
import com.ahmed.neocalendar.core.tasks.isTask
import com.ahmed.neocalendar.core.tasks.matchesTaskQuery
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ListsTest {
    private val paris = ZoneId.of("Europe/Paris")
    private val calendar = CalendarModel("local::Etudes", "Etudes", "Etudes", "#89b4fa", true)
    private fun at(y: Int, m: Int, d: Int, h: Int, min: Int = 0): Instant =
        ZonedDateTime.of(y, m, d, h, min, 0, 0, paris).toInstant()

    private fun single(title: String, date: String, completed: kotlinx.serialization.json.JsonElement? = null, due: String? = null) =
        NeoEvent.Single(
            title = title, allDay = false, startTime = "09:00", endTime = "10:00", date = date,
            completed = completed, due = due?.let { JsonPrimitive(it) },
        )

    private fun stored(id: String, event: NeoEvent, calendarId: String = calendar.id) =
        StoredEvent(id, calendarId, "Etudes", "Etudes/$id.md", "$id.md", "", event)

    private fun task(id: String, date: String?, due: String? = null, status: String = "todo", completedAt: String? = null, title: String = id) =
        TaskItem(id, title, date, due, status, completedAt, calendar.id, calendar.name, calendar.color, true)

    @Test fun taskStatusFollowsCompleted() {
        assertFalse(isTask(single("a", "2026-10-01")))
        assertNull(getTaskStatus(single("a", "2026-10-01")))
        assertEquals("todo", getTaskStatus(single("a", "2026-10-01", JsonPrimitive(false))))
        assertEquals("todo", getTaskStatus(single("a", "2026-10-01", JsonPrimitive("in-progress"))))
        assertEquals("complete", getTaskStatus(single("a", "2026-10-01", JsonPrimitive("2026-09-30T10:00:00+02:00"))))
        assertFalse(isTask(single("a", "2026-10-01", JsonNull)))
    }

    @Test fun collectTasksSkipsHiddenCalendarsAndSeries() {
        val series = NeoEvent.Recurring(
            title = "arroser", allDay = false, daysOfWeek = listOf("M"), completed = JsonPrimitive(false),
        )
        val events = listOf(
            stored("a", single("a", "2026-10-01", JsonPrimitive(false), due = "2026-10-05")),
            stored("b", series),
            stored("c", single("c", "2026-10-01")),
            stored("d", single("d", "2026-10-01", JsonPrimitive(false)), calendarId = "local::Autre"),
        )
        val byId = mapOf(calendar.id to calendar)
        val tasks = collectTasks(events, byId, emptySet())
        assertEquals(listOf("a"), tasks.map { it.id })
        assertEquals("2026-10-05", tasks[0].due)
        assertEquals(emptyList<TaskItem>(), collectTasks(events, byId, setOf(calendar.id)))
    }

    @Test fun groupsSortByDueAndCompletion() {
        val groups = buildDesktopTaskGroups(
            listOf(
                task("sans-date", null),
                task("tard", "2026-10-09"),
                task("tot", "2026-10-02"),
                task("fini-vieux", "2026-09-01", status = "complete", completedAt = "2026-09-02T10:00:00+02:00"),
                task("fini-recent", "2026-09-01", status = "complete", completedAt = "2026-09-20T10:00:00+02:00"),
                task("fini-sans-date", null, status = "complete", completedAt = "2026-09-25T10:00:00+02:00"),
            ),
        )
        assertEquals(listOf("tot", "tard", "sans-date", "fini-sans-date"), groups.todo.map { it.id })
        assertEquals(listOf("fini-recent", "fini-vieux"), groups.complete.map { it.id })
    }

    @Test fun overdueJudgesTheDeadlineFirst() {
        assertTrue(isOverdue(task("a", "2026-09-29"), "2026-09-30"))
        assertFalse(isOverdue(task("a", "2026-09-29", due = "2026-10-03"), "2026-09-30"))
        assertFalse(isOverdue(task("a", "2026-09-29", status = "complete"), "2026-09-30"))
        assertFalse(isOverdue(task("a", null), "2026-09-30"))
    }

    @Test fun taskQueryIgnoresCaseAccentsAndNeedsEveryWord() {
        val t = task("a", null, title = "Réinscription Efrei")
        assertTrue(matchesTaskQuery(t, "reinscription"))
        assertTrue(matchesTaskQuery(t, "  EFREI  réins "))
        assertTrue(matchesTaskQuery(t, "efrei etudes"))
        assertFalse(matchesTaskQuery(t, "efrei islam"))
        assertTrue(matchesTaskQuery(t, "   "))
    }

    @Test fun calendarListPutsUndatedFirstThenNewestFirst() {
        val now = at(2026, 10, 1, 12)
        val notes = listOf(
            stored("vieux", single("vieux", "2026-03-01")),
            stored("recent", single("recent", "2026-11-01")),
            stored("loin", single("loin", "2031-01-01")),
            stored("sans", NeoEvent.Someday(title = "sans", completed = JsonPrimitive(false))),
            stored("autre", single("autre", "2026-06-01"), calendarId = "local::Autre"),
        )
        val list = calendarPanelEvents(notes, calendar, paris, now)
        assertEquals(listOf("sans", "loin", "recent", "vieux"), list.map { it.id })
        assertTrue(list[0].isSomeday)
        assertEquals("todo", list[0].taskStatus)
    }

    @Test fun timeframeComparesToNow() {
        val now = at(2026, 10, 1, 9, 30)
        val list = calendarPanelEvents(listOf(stored("a", single("a", "2026-10-01"))), calendar, paris, now)
        assertEquals(Timeframe.NOW, panelTimeframe(list[0], now))
        assertEquals(Timeframe.PAST, panelTimeframe(list[0], at(2026, 10, 1, 10)))
        assertEquals(Timeframe.FUTURE, panelTimeframe(list[0], at(2026, 10, 1, 8)))
    }

    @Test fun searchIsEmptyWithoutQueryAndGroupsByDay() {
        val now = at(2026, 10, 1, 12)
        val notes = listOf(
            stored("a", single("Examen réseaux", "2026-10-03")),
            stored("b", single("Cours réseaux", "2026-10-02")),
            stored("c", single("Autre chose", "2026-10-02")),
            stored("d", NeoEvent.Someday(title = "Réseaux à revoir")),
        )
        val all = calendarPanelEvents(notes, calendar, paris, now)
        assertTrue(searchEvents(all, "  ").isEmpty())
        val days = groupEventsByDay(searchEvents(all, "RESEAUX"), paris)
        assertEquals(listOf(LocalDate.of(2026, 10, 2), LocalDate.of(2026, 10, 3), null), days.map { it.date })
        assertEquals(listOf("b"), days[0].events.map { it.id })
    }

    @Test fun searchCorpusCoversTheWindowAndSomedays() {
        val now = at(2026, 10, 1, 12)
        val weekly = NeoEvent.Rrule(
            title = "Cours", allDay = false, startTime = "09:00", endTime = "10:00",
            startDate = "2026-01-05", rrule = "FREQ=WEEKLY;BYDAY=MO", skipDates = emptyList(),
        )
        val notes = listOf(stored("w", weekly), stored("s", NeoEvent.Someday(title = "Un jour")))
        val corpus = searchCorpus(notes, mapOf(calendar.id to calendar), LocalDate.of(2026, 10, 1), paris, now)
        val courses = corpus.filter { it.title == "Cours" }
        // D'août au 31 décembre 2026 : des lundis, pas ceux de juillet ni de 2027.
        assertTrue(courses.all { it.start >= at(2026, 8, 1, 0) && it.start < at(2027, 1, 1, 0) })
        assertTrue("n=${courses.size} first=${courses.minOfOrNull { it.start }} last=${courses.maxOfOrNull { it.start }}", courses.size in 20..23)
        assertEquals(1, corpus.count { it.isSomeday })
    }

    @Test fun datesReadLikeTheInterface() {
        assertEquals("jeu 1 oct", formatDatedDay(LocalDate.of(2026, 10, 1)))
        assertEquals("1 oct", formatDatedDay(LocalDate.of(2026, 10, 1), weekday = false))
        assertEquals("jeu 1 oct", formatDatedDayWithYear(LocalDate.of(2026, 10, 1), 2026))
        assertEquals("mar 1 oct 2030", formatDatedDayWithYear(LocalDate.of(2030, 10, 1), 2026))
        assertEquals("30 min", formatDuration(30))
        assertEquals("1 h", formatDuration(60))
        assertEquals("1 h 30", formatDuration(90))
        assertEquals("09:05", formatClock(LocalTime.of(9, 5), true))
        assertEquals("12:00 AM", formatClock(LocalTime.of(0, 0), false))
        assertEquals("1:30 PM", formatClock(LocalTime.of(13, 30), false))
    }

    @Test fun cardDateCoversTimedAllDayAndMultiDay() {
        val timed = formatCardDate(at(2026, 10, 1, 9), at(2026, 10, 1, 10), false, paris, true, 2026)
        assertEquals("jeu 1 oct, 09:00 – 10:00", timed)
        assertEquals("jeu 1 oct", formatCardDate(at(2026, 10, 1, 0), at(2026, 10, 2, 0), true, paris, true, 2026))
        assertEquals("1 oct → 3 oct", formatCardDate(at(2026, 10, 1, 0), at(2026, 10, 4, 0), true, paris, true, 2026))
        assertEquals(
            "1 oct, 22:00 → 2 oct, 02:00",
            formatCardDate(at(2026, 10, 1, 22), at(2026, 10, 2, 2), false, paris, true, 2026),
        )
    }
}
