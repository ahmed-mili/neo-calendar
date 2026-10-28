package com.ahmed.neocalendar.core.grid

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt
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
 * Le jour où se pose la grille au lâcher d'un geste sans élan : un jour
 * exactement, jamais plus, dans le sens du geste. Avec élan, voir [flingTargetDay].
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

/** Plafond du lancer (Ahmed, 2026-10-28) : au plus 7 jours au-delà de la position du lâcher. */
const val FLING_MAX_DAYS = 7

/**
 * Le jour où se pose la grille après un lancer. Sans élan, la règle du jour
 * unique ; avec élan, le jour le plus proche de la projection, mais jamais
 * derrière le lâcher dans le sens du geste (pas de recul) et plafonné.
 *
 * @param startDay le jour le plus proche au début du glissé
 * @param position la position au lâcher, en jours
 * @param projected la position plus la distance de la décroissance du lancer
 */
fun flingTargetDay(startDay: Long, position: Double, projected: Double, velocityDaysPerSecond: Double): Long {
    val v = velocityDaysPerSecond
    if (abs(v) < SNAP_VELOCITY_DAYS_PER_SECOND) {
        val moved = position - startDay
        return if (abs(moved) < 1) snapTargetDay(startDay, moved, 0.0) else nearestDay(position)
    }
    return if (v > 0) {
        val t = maxOf(nearestDay(projected), ceil(position).toLong())
        minOf(t, floor(position + FLING_MAX_DAYS).toLong())
    } else {
        val t = minOf(nearestDay(projected), floor(position).toLong())
        maxOf(t, ceil(position - FLING_MAX_DAYS).toLong())
    }
}

/**
 * La durée de la glisse vers le jour cible, en ms. Décélération constante
 * (T = 2d/|v|) pour partir à la vitesse du doigt, bornée à 150..900 ms ; si la
 * borne basse faisait dépasser la cible (pente de départ > 3), T = 3d/|v|.
 */
fun glideDurationMs(distanceDays: Double, velocityDaysPerSecond: Double): Int {
    val v = abs(velocityDaysPerSecond)
    if (distanceDays <= 0.0 || v == 0.0) return 260
    val ms = (2000.0 * distanceDays / v).roundToInt()
    if (ms >= 150) return ms.coerceAtMost(900)
    val m0 = v * 0.150 / distanceDays
    return if (m0 > 3.0) (3000.0 * distanceDays / v).roundToInt() else 150
}

/**
 * Hermite cubique de 0 à 1 : part de la pente [m0] (vitesse du doigt rapportée
 * à la distance), arrive à plat. `s` va de 0 à 1.
 */
fun glideProgress(s: Double, m0: Double): Double =
    (s * s * s - 2 * s * s + s) * m0 + (-2 * s * s * s + 3 * s * s)

/** Dérivée de [glideProgress] par rapport à `s`. */
fun glideSlope(s: Double, m0: Double): Double =
    (3 * s * s - 4 * s + 1) * m0 + (-6 * s * s + 6 * s)

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
