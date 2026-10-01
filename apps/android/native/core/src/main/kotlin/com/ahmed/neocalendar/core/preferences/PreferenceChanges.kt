package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import com.ahmed.neocalendar.core.notes.jsTrim

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

// --- les liens ICS d'un calendrier (DesktopCalendar.tsx : onAdd, onEdit, onRemove du panneau) -------------

private fun feeds(preferences: JsonObject): List<JsonObject> =
    (preferences["icsFeeds"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }

/** La liste repasse par `parseIcsFeeds`, comme le TypeScript à l'écriture : même ordre des champs, même nettoyage. */
private fun withFeeds(preferences: JsonObject, list: List<JsonObject>): JsonObject =
    preferences.with("icsFeeds", parseIcsFeeds(JsonArray(list)))

private fun feedText(feed: JsonObject, key: String) = (feed[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

/**
 * Pourquoi ce lien ne peut pas être ajouté à ce calendrier, ou null s'il le peut (textes de `IcsFeedsPanel.tsx`) :
 * nom et adresse valides, adresse pas déjà prise par un autre lien du calendrier, cinq liens au plus.
 */
fun icsFeedProblem(name: String, rawUrl: String, calendarFeedUrls: List<String>): String? {
    val url = normalizeIcsUrl(rawUrl)
    return when {
        calendarFeedUrls.size >= MAX_ICS_FEEDS_PER_CALENDAR -> "Ce calendrier a déjà le maximum de cinq liens ICS."
        name.jsTrim().isEmpty() || url.isEmpty() -> "Cette adresse n'est pas valide. Entrez une adresse HTTPS ou webcal."
        url in calendarFeedUrls -> "Ce lien est déjà utilisé par un autre flux de ce calendrier."
        else -> null
    }
}

/** Ajoute un lien actif au calendrier ; refusé (message de [icsFeedProblem]) sur les préférences lues à l'instant. */
fun withIcsFeedAdded(preferences: JsonObject, id: String, calendarPath: String, name: String, rawUrl: String): JsonObject {
    val existing = feeds(preferences).filter { feedText(it, "calendarPath") == calendarPath }.mapNotNull { feedText(it, "url") }
    icsFeedProblem(name, rawUrl, existing)?.let { throw IllegalArgumentException(it) }
    val feed = JsonObject(
        linkedMapOf(
            "id" to JsonPrimitive(id),
            "calendarPath" to JsonPrimitive(calendarPath),
            "name" to JsonPrimitive(name.jsTrim()),
            "url" to JsonPrimitive(normalizeIcsUrl(rawUrl)),
            "active" to JsonPrimitive(true),
        )
    )
    return withFeeds(preferences, feeds(preferences) + feed)
}

/** Change le nom, la fréquence ou l'adresse d'un lien ; une adresse vide se retire du fichier. Un lien disparu : rien ne change. */
fun withIcsFeedEdited(preferences: JsonObject, id: String, name: String? = null, refreshMinutes: Int? = null, address: String? = null): JsonObject =
    withFeeds(
        preferences,
        feeds(preferences).map { feed ->
            if (feedText(feed, "id") != id) return@map feed
            val next = LinkedHashMap<String, JsonElement>(feed)
            if (name != null && name.jsTrim().isNotEmpty()) next["name"] = JsonPrimitive(name.jsTrim())
            if (refreshMinutes != null) next["refreshMinutes"] = JsonPrimitive(refreshMinutes.toLong())
            if (address != null) if (address.isEmpty()) next.remove("address") else next["address"] = JsonPrimitive(address)
            JsonObject(next)
        },
    )

/** Retire le lien. Ses notes restent : rien ici ne les supprime. */
fun withIcsFeedRemoved(preferences: JsonObject, id: String): JsonObject =
    withFeeds(preferences, feeds(preferences).filter { feedText(it, "id") != id })

/** Le dossier propre d'un lien, noté une fois créé. */
fun withIcsFeedDirectory(preferences: JsonObject, id: String, directory: String): JsonObject =
    withFeeds(
        preferences,
        feeds(preferences).map { feed ->
            if (feedText(feed, "id") == id) JsonObject(LinkedHashMap<String, JsonElement>(feed).also { it["directory"] = JsonPrimitive(directory) }) else feed
        },
    )
