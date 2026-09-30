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
)

/** `t(key)` de l'interface, langue « fr ». Une clé inconnue est une erreur de port. */
internal fun t(key: String): String = FR[key] ?: error("Chaîne absente de Strings.kt : $key")

/** `DAYS_SHORT` (`days.short`), dimanche en premier comme `Date.getDay()`. */
internal val DAYS_SHORT = listOf("dim", "lun", "mar", "mer", "jeu", "ven", "sam")

/** `MONTHS_SHORT` (`months.short`). */
internal val MONTHS_SHORT = listOf("janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc")
