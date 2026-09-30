package com.ahmed.neocalendar.core.format

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/*
 * Les dates et heures telles que les listes les écrivent : port de
 * calendarFormatters.ts et de formatCardDate (CalendarEventsPanel.helpers.ts),
 * en français, avec les noms du dictionnaire de l'interface (« jeu 25 juin »,
 * sans point ni virgule).
 */

/** Du lundi au dimanche, comme `DayOfWeek.value - 1`. */
private val DAYS_SHORT = listOf("lun", "mar", "mer", "jeu", "ven", "sam", "dim")
private val MONTHS_SHORT = listOf("janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc")

/** « lun » à « dim » : le nom court d'un jour de la semaine, tel que l'interface l'écrit. */
fun weekdayShort(date: LocalDate): String = DAYS_SHORT[date.dayOfWeek.value - 1]

/** « jeu 25 juin », ou « 25 juin » pour les deux bouts d'une plage. */
fun formatDatedDay(date: LocalDate, weekday: Boolean = true): String {
    val dated = "${date.dayOfMonth} ${MONTHS_SHORT[date.monthValue - 1]}"
    return if (weekday) "${weekdayShort(date)} $dated" else dated
}

/** Le même jour, suivi de l'année dès qu'il sort de l'année en cours. */
fun formatDatedDayWithYear(date: LocalDate, currentYear: Int, weekday: Boolean = true): String {
    val label = formatDatedDay(date, weekday)
    return if (date.year == currentYear) label else "$label ${date.year}"
}

/** « sam 20 juin » : l'intitulé d'un jour dans les résultats de recherche. */
fun formatDayTitle(date: LocalDate): String = formatDatedDay(date)

/** « 30 min », « 1 h », « 1 h 30 ». */
fun formatDuration(minutes: Long): String {
    val safe = maxOf(0L, minutes)
    if (safe < 60) return "$safe min"
    val hours = safe / 60
    val rest = safe % 60
    return if (rest == 0L) "$hours h" else "$hours h $rest"
}

/** « 09:00 » en 24 h, « 9:00 AM » sinon. */
fun formatClock(time: LocalTime, timeFormat24h: Boolean): String {
    val minutes = time.minute.toString().padStart(2, '0')
    if (timeFormat24h) return "${time.hour.toString().padStart(2, '0')}:$minutes"
    val hour12 = when {
        time.hour == 0 -> 12
        time.hour > 12 -> time.hour - 12
        else -> time.hour
    }
    return "$hour12:$minutes ${if (time.hour >= 12) "PM" else "AM"}"
}

fun formatClock(instant: Instant, zone: ZoneId, timeFormat24h: Boolean): String =
    formatClock(instant.atZone(zone).toLocalTime(), timeFormat24h)

/**
 * La ligne de date sous le titre d'un évènement dans la liste d'un calendrier :
 * « jeu 25 juin, 09:00 – 10:00 », ou la plage de jours d'un évènement qui en
 * couvre plusieurs. La fin d'un évènement journée entière est exclusive.
 */
fun formatCardDate(
    start: Instant,
    end: Instant,
    allDay: Boolean,
    zone: ZoneId,
    timeFormat24h: Boolean,
    currentYear: Int,
): String {
    val from = start.atZone(zone)
    val startDay = formatDatedDayWithYear(from.toLocalDate(), currentYear)
    if (allDay) {
        val lastDay = end.minusMillis(1).atZone(zone).toLocalDate()
        if (lastDay <= from.toLocalDate()) return startDay
        return "${formatDatedDayWithYear(from.toLocalDate(), currentYear, weekday = false)} → " +
            formatDatedDayWithYear(lastDay, currentYear, weekday = false)
    }
    val to = end.atZone(zone)
    val startTime = formatClock(from.toLocalTime(), timeFormat24h)
    val endTime = formatClock(to.toLocalTime(), timeFormat24h)
    if (from.toLocalDate() == to.toLocalDate()) return "$startDay, $startTime – $endTime"
    return "${formatDatedDayWithYear(from.toLocalDate(), currentYear, weekday = false)}, $startTime → " +
        "${formatDatedDayWithYear(to.toLocalDate(), currentYear, weekday = false)}, $endTime"
}
