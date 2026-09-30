package com.ahmed.neocalendar.core.notes

/*
 * Le texte que la bibliothèque `rrule` (2.7.2) donne à `rrulestr(rule).toText()`,
 * pour les seules règles que l'application écrit (recurrenceToRRule,
 * src/ui/calendar/recurrence.ts) : FREQ quotidien, hebdomadaire, mensuel ou
 * annuel, avec INTERVAL, BYDAY, BYMONTHDAY, COUNT ou UNTIL. Toute autre forme
 * rend null, et le nom de fichier retombe sur "Recurring".
 */

private val MONTH_NAMES = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
private val DAY_NAMES = mapOf(
    "MO" to "Monday", "TU" to "Tuesday", "WE" to "Wednesday", "TH" to "Thursday",
    "FR" to "Friday", "SA" to "Saturday", "SU" to "Sunday",
)
private val DAY_ORDER = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")
private val WEEKDAYS = setOf("MO", "TU", "WE", "TH", "FR")

private val POSITIVE_INT = Regex("[1-9][0-9]*")
private val NTH_DAY = Regex("\\+([1-5])(MO|TU|WE|TH|FR|SA|SU)")
private val UNTIL_VALUE = Regex("([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z")

/** plural de la bibliothèque : `n % 100 !== 1` ("every 101 day"). */
private fun plural(n: Int) = n % 100 != 1

private fun nth(n: Int): String = when (n) {
    1, 21, 31 -> "${n}st"
    2, 22 -> "${n}nd"
    3, 23 -> "${n}rd"
    else -> "${n}th"
}

private fun isLeap(year: Int) = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

private fun daysIn(year: Int, month: Int): Int = when (month) {
    2 -> if (isLeap(year)) 29 else 28
    4, 6, 9, 11 -> 30
    else -> 31
}

/** "December 31, 2026", lu en UTC comme la bibliothèque (getUTC*) : jamais de
 *  fuseau local. Une date impossible rend null (JS la ferait déborder). */
private fun untilText(value: String): String? {
    val m = UNTIL_VALUE.matchEntire(value) ?: return null
    val (y, mo, d, h, mi, s) = m.destructured
    val year = y.toInt()
    val month = mo.toInt()
    val day = d.toInt()
    if (month !in 1..12 || day !in 1..daysIn(year, month)) return null
    if (h.toInt() > 23 || mi.toInt() > 59 || s.toInt() > 59) return null
    return "${MONTH_NAMES[month - 1]} $day, $year"
}

internal fun rruleToText(rule: String): String? {
    val parts = rule.removePrefix("RRULE:").split(";")
    val options = LinkedHashMap<String, String>()
    for (part in parts) {
        val eq = part.indexOf('=')
        if (eq <= 0) return null
        if (options.put(part.substring(0, eq), part.substring(eq + 1)) != null) return null
    }
    // FREQ en tête : c'est ce qui rend la règle « entièrement convertible »
    // pour la bibliothèque (pas de « (~ approximate) »).
    if (options.keys.first() != "FREQ") return null
    val freq = options.getValue("FREQ")
    if (freq !in setOf("DAILY", "WEEKLY", "MONTHLY", "YEARLY")) return null

    val allowed = setOf("FREQ", "INTERVAL", "COUNT", "UNTIL") + when (freq) {
        "WEEKLY" -> setOf("BYDAY")
        "MONTHLY" -> setOf("BYDAY", "BYMONTHDAY")
        else -> emptySet()
    }
    if (!allowed.containsAll(options.keys)) return null

    val interval = options["INTERVAL"]?.let { if (POSITIVE_INT.matches(it)) it.toIntOrNull() ?: return null else return null } ?: 1
    val count = options["COUNT"]?.let { if (POSITIVE_INT.matches(it)) it.toIntOrNull() ?: return null else return null }
    val until = options["UNTIL"]?.let { untilText(it) ?: return null }
    if (count != null && until != null) return null

    val words = mutableListOf("every")
    fun everyN(singular: String, pluralForm: String) {
        if (interval != 1) words += interval.toString()
        words += if (plural(interval)) pluralForm else singular
    }

    when (freq) {
        "DAILY" -> everyN("day", "days")
        "YEARLY" -> everyN("year", "years")
        "WEEKLY" -> {
            val days = options["BYDAY"]?.split(",") ?: return null
            if (days.any { it !in DAY_NAMES }) return null
            if (interval != 1) words += listOf(interval.toString(), if (plural(interval)) "weeks" else "week")
            val present = days.toSet()
            when {
                present.containsAll(WEEKDAYS) && "SA" !in present && "SU" !in present ->
                    if (interval == 1) words += "weekday" else words += listOf("on", "weekdays")
                present.size == 7 -> words += if (plural(interval)) "days" else "day"
                else -> {
                    if (interval == 1) words += "week"
                    words += "on"
                    words += days.sortedBy { DAY_ORDER.indexOf(it) }.joinToString(", ") { DAY_NAMES.getValue(it) }
                }
            }
        }
        "MONTHLY" -> {
            everyN("month", "months")
            val monthDay = options["BYMONTHDAY"]
            val byDay = options["BYDAY"]
            when {
                monthDay != null && byDay == null -> {
                    val day = monthDay.takeIf { POSITIVE_INT.matches(it) }?.toIntOrNull()?.takeIf { it <= 31 } ?: return null
                    words += listOf("on the", nth(day))
                }
                byDay != null && monthDay == null -> {
                    val m = NTH_DAY.matchEntire(byDay) ?: return null
                    words += listOf("on the", "${nth(m.groupValues[1].toInt())} ${DAY_NAMES.getValue(m.groupValues[2])}")
                }
                else -> return null
            }
        }
    }

    if (until != null) words += listOf("until", until)
    else if (count != null) words += listOf("for", count.toString(), if (plural(count)) "times" else "time")
    return words.joinToString(" ")
}
