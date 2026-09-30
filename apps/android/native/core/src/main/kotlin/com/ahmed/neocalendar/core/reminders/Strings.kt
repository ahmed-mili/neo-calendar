package com.ahmed.neocalendar.core.reminders

/*
 * Les chaînes françaises de src/ui/i18n.ts qu'emploient les fonctions portées.
 * Sous Jest `t()` vaut « fr » (pas de localStorage) : le corpus est en français,
 * donc le noyau ne porte que cette langue. Une clé n'entre ici que quand une
 * fonction portée en a besoin.
 */
private val FR = mapOf(
    "Untitled" to "Sans titre",
)

/** `t(key)` de l'interface, langue « fr ». Une clé inconnue est une erreur de port. */
internal fun t(key: String): String = FR[key] ?: error("Chaîne absente de Strings.kt : $key")
