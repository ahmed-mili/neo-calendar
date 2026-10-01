package com.ahmed.neocalendar.core.reminders

/*
 * Les chaînes françaises de src/ui/i18n.ts qu'emploient les fonctions portées.
 * Sous Jest `t()` vaut « fr » (pas de localStorage) : le corpus est en français,
 * donc le noyau ne porte que cette langue. Une clé n'entre ici que quand une
 * fonction portée en a besoin.
 */
private val FR = mapOf(
    "Untitled" to "Sans titre",
    "Tomorrow" to "Demain",
    "In" to "Dans",
    "h" to "h",
    "j" to "j",
    "All-day" to "Toute la journée",
    "Tomorrow, all day" to "Demain, toute la journée",
    "Starting now" to "Ça commence",
    "It is time" to "C'est l'heure",
    "No event scheduled" to "Aucun événement prévu",
    // Fiche d'évènement : répétition et rappels.
    "Every day" to "Tous les jours",
    "Every week" to "Toutes les semaines",
    "Every month" to "Tous les mois",
    "Every year" to "Tous les ans",
    "every {n} days" to "tous les {n} jours",
    "every {n} weeks" to "toutes les {n} semaines",
    "every {n} months" to "tous les {n} mois",
    "every {n} years" to "tous les {n} ans",
    "on {days}" to "le {days}",
    "until {date}" to "jusqu'au {date}",
    "{n} times" to "{n} fois",
    "At start of event" to "Au début de l'événement",
    "No reminder" to "Aucun rappel",
    // Absent du dictionnaire français de src/ui/i18n.ts : le TypeScript l'affiche en anglais.
    "Same day" to "Same day",
    "1 day" to "1 jour",
    "before" to "avant",
    "days" to "jours",
    "minute" to "minute",
    "minutes" to "minutes",
    "hour" to "heure",
    "hours" to "heures",
    "day" to "jour",
)

/** `t(key)` de l'interface, langue « fr ». Une clé inconnue est une erreur de port. */
internal fun t(key: String): String {
    val french = FR[key] ?: error("Chaîne absente de Strings.kt : $key")
    // Sans entrée française l'ancienne rend la clé : en anglais, la clé EST le texte (sauf « 1 day », « days »... déjà anglais).
    return if (com.ahmed.neocalendar.core.format.CoreLanguage.english) key else french
}

/** `DAYS_SHORT` (`days.short`), dimanche en premier comme `Date.getDay()`. */
internal val DAYS_SHORT: List<String> get() = if (com.ahmed.neocalendar.core.format.CoreLanguage.english) listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat") else listOf("dim", "lun", "mar", "mer", "jeu", "ven", "sam")

/** `MONTHS_SHORT` (`months.short`). */
internal val MONTHS_SHORT: List<String> get() = if (com.ahmed.neocalendar.core.format.CoreLanguage.english) listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec") else listOf("janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc")
