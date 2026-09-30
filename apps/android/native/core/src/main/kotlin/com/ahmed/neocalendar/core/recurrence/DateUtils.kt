package com.ahmed.neocalendar.core.recurrence

import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/*
 * Port de src/ui/calendar/calendarDateUtils.ts et des lectures de date de
 * eventExpansion.ts. Le TypeScript compte en `Date` dans le fuseau de la
 * machine ; ici ce fuseau est celui de la JVM (`-Duser.timezone=Europe/Paris`
 * dans la tâche Gradle `test`), relu à chaque appel.
 */

internal fun localZone(): ZoneId = ZoneId.systemDefault()

private val ISO_DATE = Regex("""(\d{4})-(\d{2})-(\d{2})""")
private val ISO_TIME = Regex("""(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?""")

/** `YYYY-MM-DD`, la seule forme de date que l'application écrit. Luxon en lit
 *  d'autres (`20260722`, `2026-07`, semaines ISO) : elles ne sont pas portées,
 *  le corpus ne les emploie pas. Null quand luxon dirait « invalide » (jour
 *  inexistant compris). */
internal fun parseIsoDate(text: String): LocalDate? {
    val m = ISO_DATE.matchEntire(text) ?: return null
    return try {
        LocalDate.of(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].toInt())
    } catch (_: DateTimeException) {
        null
    }
}

/** `DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: "local" })` : HH:mm,
 *  HH:mm:ss ou HH:mm:ss.fff ; `24:00` vaut minuit du lendemain, comme en ISO.
 *  Une heure qui n'existe pas (saut de mars) est décalée de la durée du saut,
 *  une heure qui existe deux fois (retour d'octobre) prend la première : ce que
 *  font luxon et `ZonedDateTime.of`. */
internal fun parseTimeToDate(dateStr: String, timeStr: String): Instant? {
    val date = parseIsoDate(dateStr) ?: return null
    val m = ISO_TIME.matchEntire(timeStr) ?: return null
    val hour = m.groupValues[1].toInt()
    val minute = m.groupValues[2].toInt()
    val second = m.groupValues[3].ifEmpty { "0" }.toInt()
    val fraction = m.groupValues[4]
    val nanos = if (fraction.isEmpty()) 0 else fraction.padEnd(9, '0').toInt()
    return try {
        if (hour == 24) {
            if (minute != 0 || second != 0 || nanos != 0) return null
            date.plusDays(1).atStartOfDay(localZone()).toInstant()
        } else {
            LocalDateTime.of(date, LocalTime.of(hour, minute, second, nanos)).atZone(localZone()).toInstant()
        }
    } catch (_: DateTimeException) {
        null
    }
}

/** `DateTime.fromISO(dateStr, { zone: "local" }).startOf("day")`. */
internal fun parseDateOnly(dateStr: String): Instant? =
    parseIsoDate(dateStr)?.atStartOfDay(localZone())?.toInstant()

internal fun startOfDay(date: Instant): Instant =
    date.atZone(localZone()).toLocalDate().atStartOfDay(localZone()).toInstant()

/** `d.setDate(d.getDate() + days)` : on avance d'un jour CIVIL, l'heure du mur
 *  est gardée, donc 9 h reste 9 h de part et d'autre d'un changement d'heure.
 *  Passer par le LocalDateTime plutôt que par `ZonedDateTime.plusDays` : à
 *  l'heure qui existe deux fois, celui-ci garde l'ancien décalage là où
 *  JavaScript reprend la première occurrence. */
internal fun addDays(date: Instant, days: Long): Instant =
    date.atZone(localZone()).toLocalDateTime().plusDays(days).atZone(localZone()).toInstant()

/** La forme de `Date.prototype.toISOString()` : UTC, millisecondes, `Z`. */
private val ISO_INSTANT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

internal fun Instant.toIsoString(): String = ISO_INSTANT.format(this)
