package com.ahmed.neocalendar.core.grid

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs
import kotlin.math.roundToLong

/** Le nombre de jours affiché : un entier de 1 à 60, comme `dayCount` dans les préférences d'appareil. */
const val MIN_DAY_COUNT = 1
const val MAX_DAY_COUNT = 60
const val DEFAULT_DAY_COUNT = 2

fun clampDayCount(n: Int): Int = n.coerceIn(MIN_DAY_COUNT, MAX_DAY_COUNT)

/** Un glissé d'au moins ce quart de jour, ou plus rapide que ce seuil, change de jour. */
const val SNAP_DISTANCE_DAYS = 0.25
const val SNAP_VELOCITY_DAYS_PER_SECOND = 1.2

/**
 * Le jour où se pose la grille au lâcher, hors défilement libre : un jour
 * exactement, jamais plus, dans le sens du geste.
 *
 * @param startDay le jour en tête de la grille au début du glissé
 * @param movedDays de combien de jours la grille a avancé depuis (positif = vers le futur)
 * @param velocityDaysPerSecond sa vitesse au lâcher, même sens
 */
fun snapTargetDay(startDay: Long, movedDays: Double, velocityDaysPerSecond: Double): Long {
    val direction = when {
        abs(velocityDaysPerSecond) >= SNAP_VELOCITY_DAYS_PER_SECOND -> if (velocityDaysPerSecond > 0) 1 else -1
        abs(movedDays) >= SNAP_DISTANCE_DAYS -> if (movedDays > 0) 1 else -1
        else -> 0
    }
    return startDay + direction
}

/** Le jour entier le plus proche d'une position fractionnaire. */
fun nearestDay(position: Double): Long = position.roundToLong()

/** La part d'un évènement qui tombe sur un jour, en heures murales depuis minuit. */
data class DaySegment(
    val topHours: Double,
    val durationHours: Double,
    /** Le début réel est ce jour-là (sinon c'est la suite d'un évènement commencé plus tôt). */
    val startsThisDay: Boolean,
    /** La fin réelle est ce jour-là (sinon l'évènement continue le lendemain). */
    val endsThisDay: Boolean,
)

private fun wallHours(instant: Instant, zone: ZoneId): Double {
    val t = instant.atZone(zone)
    return t.hour + t.minute / 60.0 + t.second / 3600.0
}

/**
 * La part de [start, end) sur `day`, lue à l'heure murale : c'est l'heure
 * écrite sur l'axe, donc un évènement finit en face de l'heure qu'il affiche,
 * même un jour de changement d'heure. Null quand l'évènement ne touche pas ce jour.
 */
fun segmentForDay(start: Instant, end: Instant, day: LocalDate, zone: ZoneId = ZoneId.systemDefault()): DaySegment? {
    val dayStart = day.atStartOfDay(zone).toInstant()
    val nextStart = day.plusDays(1).atStartOfDay(zone).toInstant()
    val stop = if (end > start) end else start
    val zeroLength = stop == start
    if (start >= nextStart) return null
    if (stop < dayStart || (stop == dayStart && !zeroLength)) return null
    val startsHere = start >= dayStart
    val endsHere = stop <= nextStart
    val top = if (startsHere) wallHours(start, zone) else 0.0
    val bottom = when {
        !endsHere -> 24.0
        stop == nextStart -> 24.0
        else -> wallHours(stop, zone)
    }
    return DaySegment(top, maxOf(0.0, bottom - top), startsHere, endsHere)
}
