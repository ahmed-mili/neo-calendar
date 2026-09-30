package com.ahmed.neocalendar.core.reminders

import com.ahmed.neocalendar.core.jsNumber

/*
 * Port de `relativeDelayLabel` (src/ui/calendar/reminderDelay.ts). Les délais
 * sont des `number` en TypeScript, donc des Double ici : un rappel de 1,5
 * minute s'écrit « 1.5 min ».
 */

private const val MINUTES_PER_HOUR = 60.0
private const val MINUTES_PER_DAY = 1440.0

/** Le délai en abrégé : « 1 h 30 », « 2 h 05 », « 1 j 12 h ». */
fun relativeDelayLabel(minutes: Double): String {
    if (minutes <= 0) return t("Starting now")
    if (minutes < MINUTES_PER_HOUR) return "${jsNumber(minutes)} min"

    if (minutes < MINUTES_PER_DAY) {
        val hours = Math.floor(minutes / MINUTES_PER_HOUR)
        val rest = minutes % MINUTES_PER_HOUR
        if (rest == 0.0) return "${jsNumber(hours)} ${t("h")}"
        return "${jsNumber(hours)} ${t("h")} ${jsNumber(rest).padStart(2, '0')}"
    }

    val days = Math.floor(minutes / MINUTES_PER_DAY)
    val rest = minutes % MINUTES_PER_DAY
    if (rest == 0.0) return "${jsNumber(days)} ${t("j")}"
    return "${jsNumber(days)} ${t("j")} ${relativeDelayLabel(rest)}"
}
