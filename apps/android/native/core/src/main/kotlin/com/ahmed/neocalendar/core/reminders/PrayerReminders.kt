package com.ahmed.neocalendar.core.reminders

import com.ahmed.neocalendar.core.recurrence.addDays
import com.ahmed.neocalendar.core.recurrence.localZone
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/*
 * Port de apps/windows/src/platform/prayerReminders.ts et de `prayersOn`
 * (src/ui/calendar/prayerTimes.ts) : un rappel par prière d'aujourd'hui et de
 * demain. La table garde la forme JSON du TypeScript
 * { name, year, jumua: ["HH:MM"], days: { "MM-JJ": [minutes x 6] } }.
 */

/** Aujourd'hui et demain suffisent. */
private const val DAYS_AHEAD = 2

private const val FAJR = 0
private const val DHUHR = 2
private const val ASR = 3
private const val MAGHRIB = 4
private const val ISHA = 5

private data class Prayer(val name: String, val minutes: Int)

private val PRAYER_LABELS = mapOf(
    "fajr" to "Fajr",
    "dhuhr" to "Dhuhr",
    "jumua" to "Jumu'a",
    "asr" to "Asr",
    "maghrib" to "Maghrib",
    "isha" to "Isha",
)

/** `"13:05".split(":").map(Number)` : heures * 60 + minutes. */
private fun minutesOfTime(time: String): Int {
    val (hours, minutes) = time.split(":").map { it.trim().toInt() }
    return hours * 60 + minutes
}

/** `prayersOn` : les prières d'un jour local, triées par heure (tri stable). */
private fun prayersOn(timetable: JsonObject, date: LocalDate): List<Prayer> {
    if (date.year != timetable.getValue("year").jsonPrimitive.int) return emptyList()

    val key = "%02d-%02d".format(date.monthValue, date.dayOfMonth)
    val minutes = timetable.getValue("days").jsonObject[key]?.jsonArray?.map { it.jsonPrimitive.int }
        ?: return emptyList()

    // Le vendredi, Dhuhr laisse la place à chaque séance de Jumu'a.
    val midday = if (date.dayOfWeek.value == 5) {
        timetable.getValue("jumua").jsonArray.map { Prayer("jumua", minutesOfTime(it.jsonPrimitive.content)) }
    } else {
        listOf(Prayer("dhuhr", minutes[DHUHR]))
    }

    return (listOf(Prayer("fajr", minutes[FAJR])) + midday + listOf(
        Prayer("asr", minutes[ASR]),
        Prayer("maghrib", minutes[MAGHRIB]),
        Prayer("isha", minutes[ISHA]),
    )).sortedBy { it.minutes }
}

/** Zéro veut dire à l'heure de la prière, à la différence des évènements. */
private fun prayerBodyFor(offsetMinutes: Long, start: Instant, mosque: String, timeFormat24h: Boolean): String {
    val whenText = "${formatTime(start, timeFormat24h)} · $mosque"
    if (offsetMinutes <= 0) return "${t("It is time")} · $whenText"
    return "${t("In")} ${relativeDelayLabel(offsetMinutes.toDouble())} · $whenText"
}

/** Une liste de délais vide, aucun rappel. */
fun prayerRemindersFor(
    timetable: JsonElement,
    minutes: List<Long>,
    now: Instant,
    timeFormat24h: Boolean,
): List<Reminder> {
    if (minutes.isEmpty()) return emptyList()
    val table = timetable.jsonObject
    val mosque = table.getValue("name").jsonPrimitive.content

    val reminders = ArrayList<Reminder>()
    for (ahead in 0 until DAYS_AHEAD) {
        val day = addDays(now, ahead.toLong()).atZone(localZone()).toLocalDate()
        prayersOn(table, day).forEachIndexed { index, prayer ->
            // `setHours(0, minutes)` : l'heure du mur, décalée d'une heure dans le saut de mars.
            val start = LocalDateTime.of(day, java.time.LocalTime.MIDNIGHT).plusMinutes(prayer.minutes.toLong())
                .atZone(localZone()).toInstant()
            // `toISOString().slice(0, 10)` : le jour UTC, pas le jour local.
            val stamp = start.atOffset(ZoneOffset.UTC).toLocalDate()
            for (offset in minutes) {
                val id = "prayer:$stamp:$index:${prayer.name}"
                reminders.add(
                    Reminder(
                        id = id,
                        key = "$id:$offset",
                        atMs = start.toEpochMilli().toDouble() - offset * 60_000,
                        title = PRAYER_LABELS.getValue(prayer.name),
                        body = prayerBodyFor(offset, start, mosque, timeFormat24h),
                        details = mosque,
                    )
                )
            }
        }
    }
    return reminders
}
