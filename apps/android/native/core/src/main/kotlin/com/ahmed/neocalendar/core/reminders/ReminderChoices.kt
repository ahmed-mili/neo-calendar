package com.ahmed.neocalendar.core.reminders

import com.ahmed.neocalendar.core.jsNumber

/*
 * Ports de reminderChoices.ts et de la partie de reminderDelay.ts que la fiche
 * emploie : les délais proposés, leur libellé en deux morceaux (la puce du
 * rappel), et le choix « personnalisé » (nombre + unité, en minutes).
 */

/** Un évènement horodaté propose ces délais, en minutes avant le début. */
val TIMED_REMINDER_CHOICES: List<Int> = listOf(0, 5, 10, 30, 60)

/**
 * Un évènement sur la journée entière part de minuit : un nombre négatif est
 * une heure le jour même (-540 = 09:00), 900 = 09:00 la veille, et ainsi de
 * suite (2340 = deux jours avant, 9540 = six jours avant).
 */
val ALL_DAY_REMINDER_CHOICES: List<Int> = listOf(-540, 900, 2340, 9540)

fun reminderChoices(allDay: Boolean): List<Int> = if (allDay) ALL_DAY_REMINDER_CHOICES else TIMED_REMINDER_CHOICES

data class ReminderLabelParts(val amount: String, val suffix: String)

private fun twoDigits(value: Int) = value.toString().padStart(2, '0')

/** Un décalage de journée entière relu comme l'heure et le jour qui l'ont produit. */
fun allDayReminderLabelParts(minutesBeforeMidnight: Double): ReminderLabelParts {
    val fromDayStart = -minutesBeforeMidnight
    val dayIndex = Math.floor(fromDayStart / 1440).toInt()
    val minutesOfDay = (((fromDayStart % 1440) + 1440) % 1440).toInt()
    val daysBefore = maxOf(0, -dayIndex)
    return ReminderLabelParts(
        "${twoDigits(minutesOfDay / 60)}:${twoDigits(minutesOfDay % 60)}",
        when (daysBefore) {
            // « Same day » n'est pas traduit dans i18n.ts : le TypeScript l'affiche tel quel.
            0 -> t("Same day")
            1 -> "${t("1 day")} ${t("before")}"
            else -> "$daysBefore ${t("days")} ${t("before")}"
        },
    )
}

fun reminderLabelParts(minutes: Double, allDay: Boolean): ReminderLabelParts {
    if (allDay) return allDayReminderLabelParts(minutes)
    if (minutes == 0.0) return ReminderLabelParts(t("At start of event"), "")
    if (minutes < 60) return ReminderLabelParts("${jsNumber(minutes)} min", t("before"))
    val before = " ${t("before")}"
    return ReminderLabelParts(reminderDelayLabel(minutes).dropLast(before.length), t("before"))
}

enum class ReminderUnit(val key: String, val minutes: Int) {
    Minutes("minutes", 1), Hours("hours", 60), Days("days", 1440),
}

/** Quatre semaines, la borne que les préférences acceptent. */
private const val MAX_MINUTES = 40320

data class ReminderDelay(val amount: Int, val unit: ReminderUnit)

/** Le délai relu dans l'unité la plus large qui tombe juste ; zéro ou moins ouvre sur dix minutes. */
fun splitReminderDelay(minutes: Int): ReminderDelay {
    if (minutes <= 0) return ReminderDelay(10, ReminderUnit.Minutes)
    for (unit in listOf(ReminderUnit.Days, ReminderUnit.Hours, ReminderUnit.Minutes)) {
        if (minutes % unit.minutes == 0) return ReminderDelay(minutes / unit.minutes, unit)
    }
    return ReminderDelay(minutes, ReminderUnit.Minutes)
}

/** Le chemin inverse, tenu entre une minute et la borne des préférences. */
fun reminderMinutesFrom(amount: Double, unit: ReminderUnit): Int {
    val whole = Math.floor(if (amount.isFinite()) amount else 1.0)
    val minutes = maxOf(1.0, whole) * unit.minutes
    return minOf(MAX_MINUTES.toDouble(), maxOf(1.0, minutes)).toInt()
}

private fun unitWord(amount: Int, unit: ReminderUnit): String = when (unit) {
    ReminderUnit.Minutes -> t(if (amount == 1) "minute" else "minutes")
    ReminderUnit.Hours -> t(if (amount == 1) "hour" else "hours")
    ReminderUnit.Days -> t(if (amount == 1) "day" else "days")
}

/** « 45 minutes avant », « 1 jour 30 minutes avant » ; zéro est le silence. */
fun reminderDelayLabel(minutes: Double): String {
    if (minutes <= 0) return t("No reminder")
    val parts = mutableListOf<String>()
    var rest = minutes
    for (unit in listOf(ReminderUnit.Days, ReminderUnit.Hours, ReminderUnit.Minutes)) {
        val amount = Math.floor(rest / unit.minutes).toInt()
        if (amount > 0) {
            parts += "$amount ${unitWord(amount, unit)}"
            rest -= amount * unit.minutes
        }
    }
    return "${parts.joinToString(" ")} ${t("before")}"
}
