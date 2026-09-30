package com.ahmed.neocalendar.core.layout

import java.time.Instant
import java.time.ZoneId
import java.time.temporal.IsoFields

/*
 * Port de calendarDateUtils.ts et, dans CalendarUtils.ts, de getISOWeek,
 * todayBadgeState, eventTopHours, eventDurationHours, isMultiDayTimed et
 * needsCompactMonthType. Un `Date` JavaScript est un instant lu dans le fuseau
 * local : ici un `Instant` lu dans `zone` (le fuseau par défaut de la machine,
 * comme le fait JavaScript). Le jour local, lui, est un `LocalDate`.
 */

private const val DAY_MS = 24L * 3600 * 1000

/** Minuit local du jour de `date`. */
fun startOfDay(date: Instant, zone: ZoneId = ZoneId.systemDefault()): Instant =
    date.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()

/** 23:59:59.999 local du jour de `date`. */
fun endOfDay(date: Instant, zone: ZoneId = ZoneId.systemDefault()): Instant =
    date.atZone(zone).toLocalDate().atTime(23, 59, 59, 999_000_000).atZone(zone).toInstant()

/** Même heure murale `days` jours plus loin (setDate), pas `days` fois 24 h.
 *  Une heure murale inexistante glisse en avant, une ambiguë prend la première
 *  occurrence, comme en JavaScript. */
fun addDays(date: Instant, days: Long, zone: ZoneId = ZoneId.systemDefault()): Instant =
    date.atZone(zone).toLocalDateTime().plusDays(days).atZone(zone).toInstant()

fun isSameDay(a: Instant, b: Instant, zone: ZoneId = ZoneId.systemDefault()): Boolean =
    a.atZone(zone).toLocalDate() == b.atZone(zone).toLocalDate()

fun isToday(date: Instant, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): Boolean =
    isSameDay(date, now, zone)

/** Minuit local du premier jour de la semaine de `date` ; `firstDay` compte
 *  comme `Date.getDay()` : 0 dimanche, 1 lundi ... 6 samedi. */
fun getWeekStart(date: Instant, firstDay: Int = 0, zone: ZoneId = ZoneId.systemDefault()): Instant {
    val local = date.atZone(zone).toLocalDate()
    val day = local.dayOfWeek.value % 7
    val diff = (day - firstDay + 7) % 7
    return local.minusDays(diff.toLong()).atStartOfDay(zone).toInstant()
}

fun getWeekDays(weekStart: Instant, zone: ZoneId = ZoneId.systemDefault()): List<Instant> =
    (0L until 7L).map { addDays(weekStart, it, zone) }

/** Numéro de semaine ISO 8601 du jour local de `date`. */
fun getISOWeek(date: Instant, zone: ZoneId = ZoneId.systemDefault()): Int =
    date.atZone(zone).toLocalDate().get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)

/** Le déplacement qui ramènerait aujourd'hui à l'écran. `value` est le mot que
 *  lit le TypeScript. */
enum class TodayBadgeState(val value: String) { PRESENT("present"), BACK("back"), FORWARD("forward") }

fun todayBadgeState(visibleDates: List<Instant>, now: Instant, zone: ZoneId = ZoneId.systemDefault()): TodayBadgeState {
    if (visibleDates.isEmpty()) return TodayBadgeState.PRESENT

    // Le mois compte de 0 à 11 en JavaScript ; seul l'ordre importe ici.
    fun dayNumber(date: Instant): Int {
        val local = date.atZone(zone).toLocalDate()
        return local.year * 10000 + (local.monthValue - 1) * 100 + local.dayOfMonth
    }

    val today = dayNumber(now)
    val days = visibleDates.map(::dayNumber)

    if (days.any { it == today }) return TodayBadgeState.PRESENT
    return if (days[0] > today) TodayBadgeState.BACK else TodayBadgeState.FORWARD
}

/** Combien d'heures après l'heure de `dayStart` commence `start`, à l'heure
 *  murale (pas au temps écoulé), jamais négatif. */
fun eventTopHours(start: Instant, dayStart: Instant, zone: ZoneId = ZoneId.systemDefault()): Double {
    val s = start.atZone(zone)
    val d = dayStart.atZone(zone)
    val hours = (s.hour - d.hour) + (s.minute - d.minute) / 60.0
    return maxOf(0.0, hours)
}

/** Durée en heures, négative si la fin précède le début. */
fun eventDurationHours(start: Instant, end: Instant): Double =
    (end.toEpochMilli() - start.toEpochMilli()) / (1000.0 * 60 * 60)

/** Un évènement horodaté qui couvre au moins un jour civil entier. Le premier
 *  minuit se cherche 24 h après le début et le jour couvert se mesure en 24 h
 *  fixes : les jours de changement d'heure en héritent, comme en TypeScript. */
fun isMultiDayTimed(start: Instant, end: Instant, allDay: Boolean, zone: ZoneId = ZoneId.systemDefault()): Boolean {
    if (allDay) return false
    val sod = startOfDay(start, zone)
    val firstMidnight = if (sod == start) sod else startOfDay(start.plusMillis(DAY_MS), zone)
    return end.toEpochMilli() >= firstMidnight.toEpochMilli() + DAY_MS
}

/** Seuil, en unités UTF-16, à partir duquel un nom de mois passe en petit corps. */
const val LONG_MONTH_NAME = 8

/** Les espaces que `String.prototype.trim` retire : ni plus (U+001C à U+001F,
 *  U+0085) ni moins (U+FEFF) que `Char.isWhitespace` de Kotlin. */
private fun isJsWhitespace(c: Char): Boolean = when (c) {
    '\t', '\n', '\u000B', '\u000C', '\r', ' ', ' ', ' ', ' ', ' ',
    ' ', ' ', '　', '﻿' -> true
    else -> c in ' '..' '
}

fun needsCompactMonthType(monthName: String): Boolean =
    monthName.trim(::isJsWhitespace).length >= LONG_MONTH_NAME
