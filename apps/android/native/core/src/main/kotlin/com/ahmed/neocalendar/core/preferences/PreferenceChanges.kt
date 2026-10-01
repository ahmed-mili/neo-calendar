package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Les changements de préférences que l'écran de réglages et le tiroir demandent, en fonctions pures
 * sur les préférences lues (DesktopCalendar.tsx : toggleCalendar, setDefaultCalendar, changeColor,
 * reorderCalendars, renameCalendar, setCalendarReminder). `updatePreferences` les applique au
 * contenu du fichier relu juste avant l'écriture. Les calendriers sont désignés par leur chemin.
 */

private fun JsonObject.with(key: String, value: JsonElement) = JsonObject(LinkedHashMap(this).also { it[key] = value })

private fun JsonObject.without(key: String) = JsonObject(LinkedHashMap(this).also { it.remove(key) })

private fun strings(value: JsonElement?): List<String> =
    (value as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }

private fun stringArray(values: List<String>) = JsonArray(values.map { JsonPrimitive(it) })

fun withSetting(preferences: JsonObject, key: String, value: JsonElement): JsonObject = preferences.with(key, value)

/** Masquer ou afficher un calendrier : un seul chemin ajouté ou retiré, le reste de la liste du fichier est gardé. */
fun withCalendarHidden(preferences: JsonObject, path: String, hidden: Boolean): JsonObject {
    val paths = strings(preferences["hiddenCalendarPaths"])
    val next = if (hidden) (if (path in paths) paths else paths + path) else paths.filter { it != path }
    return preferences.with("hiddenCalendarPaths", stringArray(next))
}

fun withCalendarColor(preferences: JsonObject, path: String, color: String): JsonObject {
    val colors = preferences["colors"] as? JsonObject ?: JsonObject(emptyMap())
    return preferences.with("colors", colors.with(path, JsonPrimitive(color)))
}

fun withDefaultCalendar(preferences: JsonObject, path: String): JsonObject =
    preferences.with("defaultCalendarPath", JsonPrimitive(path))

/** L'ordre des calendriers : `ordered` d'abord, puis les chemins du fichier que l'écran ne connaissait pas. */
fun withCalendarOrder(preferences: JsonObject, ordered: List<String>): JsonObject =
    preferences.with("order", stringArray(ordered.distinct() + (strings(preferences["order"]) - ordered.toSet()).distinct()))

/** Le rappel d'un calendrier ; `null` retire l'entrée (le calendrier suit de nouveau le réglage de l'application). */
fun withCalendarReminder(preferences: JsonObject, path: String, minutes: List<Long>?): JsonObject {
    val reminders = preferences["calendarReminderMinutes"] as? JsonObject ?: JsonObject(emptyMap())
    val next = if (minutes == null) reminders.without(path)
    else reminders.with(path, JsonArray(minutes.map { JsonPrimitive(it) }))
    return preferences.with("calendarReminderMinutes", next)
}

/** Un dossier renommé : tout ce qui le désignait par son chemin le suit (couleur, ordre, défaut, masqués, rappel). */
fun withCalendarRenamed(preferences: JsonObject, oldPath: String, newPath: String): JsonObject {
    var next = preferences
    fun rename(list: List<String>) = stringArray(list.map { if (it == oldPath) newPath else it }.distinct())
    val colors = preferences["colors"] as? JsonObject
    if (colors != null && oldPath in colors) {
        val moved = LinkedHashMap<String, JsonElement>()
        for ((key, value) in colors) if (key != newPath) moved[if (key == oldPath) newPath else key] = value
        next = next.with("colors", JsonObject(moved))
    }
    next = next.with("order", rename(strings(preferences["order"])))
    next = next.with("hiddenCalendarPaths", rename(strings(preferences["hiddenCalendarPaths"])))
    if ((preferences["defaultCalendarPath"] as? JsonPrimitive)?.takeIf { it.isString }?.content == oldPath) {
        next = next.with("defaultCalendarPath", JsonPrimitive(newPath))
    }
    val reminders = preferences["calendarReminderMinutes"] as? JsonObject
    if (reminders != null && oldPath in reminders) {
        val moved = LinkedHashMap<String, JsonElement>()
        for ((key, value) in reminders) if (key != newPath) moved[if (key == oldPath) newPath else key] = value
        next = next.with("calendarReminderMinutes", JsonObject(moved))
    }
    return next
}
