package com.ahmed.neocalendar.core.form

import com.ahmed.neocalendar.core.recurrence.parseIsoDate
import java.time.temporal.ChronoUnit

/*
 * Ports de daysBetween, computeDuration et panelEndDate (EventPanel.helpers.ts) :
 * la durée et la date de fin que la fiche montre à côté de l'horaire.
 */

/** Jours entiers d'une date à l'autre, 0 si l'une manque ou si la fin ne suit pas le début. */
fun daysBetween(start: String, end: String?): Int {
    if (start.isEmpty() || end.isNullOrEmpty()) return 0
    val from = parseIsoDate(start) ?: return 0
    val to = parseIsoDate(end) ?: return 0
    val gap = ChronoUnit.DAYS.between(from, to).toInt()
    return if (gap > 0) gap else 0
}

/** « 2h 45 min », « 2h », « 30 min » ; vide si rien ne dure. `dayGap` : jours entre les deux dates. */
fun computeDuration(start: String, end: String, dayGap: Int = 0): String {
    if (start.isEmpty() || end.isEmpty()) return ""
    // Number("") vaut 0 en JavaScript, Number("x") vaut NaN.
    fun number(text: String): Int? = if (text.isBlank()) 0 else text.trim().toIntOrNull()
    val s = start.split(":").map { number(it) }
    val e = end.split(":").map { number(it) }
    if (s.size < 2 || e.size < 2 || s[0] == null || s[1] == null || e[0] == null || e[1] == null) return ""
    val sh = s[0]!!
    val sm = s[1]!!
    val eh = e[0]!!
    val em = e[1]!!
    val days = if (dayGap > 0) dayGap else 0
    var total = days * 24 * 60 + eh * 60 + em - (sh * 60 + sm)
    // Pas de date de fin et une fin avant le début : l'évènement passe minuit.
    if (days == 0 && total < 0) total += 24 * 60
    if (total <= 0) return ""
    val hours = total / 60
    val minutes = total % 60
    return when {
        hours > 0 && minutes > 0 -> "${hours}h $minutes min"
        hours > 0 -> "${hours}h"
        else -> "$minutes min"
    }
}

/** La vraie seconde date de la fiche : `endDate` si elle est là, sinon le lendemain d'un horaire qui passe minuit. */
fun panelEndDate(date: String, endDate: String?, allDay: Boolean, startTime: String, endTime: String): String {
    if (!endDate.isNullOrEmpty() && endDate != date) return endDate
    if (allDay || date.isEmpty() || startTime.isEmpty() || endTime.isEmpty() || endTime >= startTime) return ""
    val day = parseIsoDate(date) ?: return ""
    return day.plusDays(1).toString()
}
