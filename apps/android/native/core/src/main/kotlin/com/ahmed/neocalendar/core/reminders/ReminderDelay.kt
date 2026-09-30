package com.ahmed.neocalendar.core.reminders

import java.math.BigDecimal

/*
 * Port de `relativeDelayLabel` (src/ui/calendar/reminderDelay.ts). Les délais
 * sont des `number` en TypeScript, donc des Double ici : un rappel de 1,5
 * minute s'écrit « 1.5 min ».
 */

private const val MINUTES_PER_HOUR = 60.0
private const val MINUTES_PER_DAY = 1440.0

/** `String(number)` de JavaScript pour un nombre fini. */
internal fun reminderJsNumber(number: Double): String {
    if (number == 0.0) return "0"
    val magnitude = Math.abs(number)
    val digits = BigDecimal(java.lang.Double.toString(magnitude)).stripTrailingZeros()
    val sign = if (number < 0) "-" else ""
    if (magnitude in 1e-6..<1e21) return sign + digits.toPlainString()
    val unscaled = digits.unscaledValue().toString()
    val exponent = unscaled.length - 1 - digits.scale()
    val mantissa = if (unscaled.length == 1) unscaled else unscaled[0] + "." + unscaled.substring(1)
    return sign + mantissa + "e" + (if (exponent < 0) "-" else "+") + Math.abs(exponent)
}

/** Le délai en abrégé : « 1 h 30 », « 2 h 05 », « 1 j 12 h ». */
fun relativeDelayLabel(minutes: Double): String {
    if (minutes <= 0) return t("Starting now")
    if (minutes < MINUTES_PER_HOUR) return "${reminderJsNumber(minutes)} min"

    if (minutes < MINUTES_PER_DAY) {
        val hours = Math.floor(minutes / MINUTES_PER_HOUR)
        val rest = minutes % MINUTES_PER_HOUR
        if (rest == 0.0) return "${reminderJsNumber(hours)} ${t("h")}"
        return "${reminderJsNumber(hours)} ${t("h")} ${reminderJsNumber(rest).padStart(2, '0')}"
    }

    val days = Math.floor(minutes / MINUTES_PER_DAY)
    val rest = minutes % MINUTES_PER_DAY
    if (rest == 0.0) return "${reminderJsNumber(days)} ${t("j")}"
    return "${reminderJsNumber(days)} ${t("j")} ${relativeDelayLabel(rest)}"
}
