package com.ahmed.neocalendar.core.form

/**
 * Une heure tapée dans le champ de la fiche (saisie en place, sans cadran) lue en « HH:mm », ou null quand elle n'a pas de
 * sens (le champ reprend alors sa valeur). Accepte « 6 », « 630 », « 6:30 », « 18h30 », « 6 pm », « 6:30am ».
 */
fun parseTypedTime(raw: String): String? {
    val text = raw.trim().lowercase().replace(" ", "").replace("h", ":").replace(".", ":")
    val meridiem = when {
        text.endsWith("am") -> "am"
        text.endsWith("pm") -> "pm"
        else -> null
    }
    val digits = (if (meridiem != null) text.dropLast(2) else text).trimEnd(':')
    if (digits.isEmpty()) return null
    var hour: Int
    val minute: Int
    if (':' in digits) {
        val parts = digits.split(':')
        if (parts.size != 2 || parts.any { it.isEmpty() || !it.all(Char::isDigit) }) return null
        hour = parts[0].toIntOrNull() ?: return null
        minute = parts[1].toIntOrNull() ?: return null
    } else {
        if (!digits.all(Char::isDigit) || digits.length > 4) return null
        when (digits.length) {
            1, 2 -> { hour = digits.toInt(); minute = 0 }
            3 -> { hour = digits.substring(0, 1).toInt(); minute = digits.substring(1).toInt() }
            else -> { hour = digits.substring(0, 2).toInt(); minute = digits.substring(2).toInt() }
        }
    }
    if (meridiem != null) {
        if (hour !in 1..12) return null
        hour = (hour % 12) + if (meridiem == "pm") 12 else 0
    }
    if (hour !in 0..23 || minute !in 0..59) return null
    return "%02d:%02d".format(hour, minute)
}
