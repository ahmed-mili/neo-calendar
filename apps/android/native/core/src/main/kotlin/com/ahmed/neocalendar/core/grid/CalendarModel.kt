package com.ahmed.neocalendar.core.grid

import com.ahmed.neocalendar.core.notes.calendarIdFromPath
import com.ahmed.neocalendar.core.workspace.WorkspaceCalendar
import java.text.Collator
import java.util.Locale
import kotlin.math.abs
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Les calendriers tels que le tiroir les montre : nom, couleur, ordre. Port de
 * `stableColor` et de la construction de `localCalendars` dans
 * DesktopCalendar.tsx (les calendriers externes « auto » et ICS n'y figurent pas).
 */

data class CalendarModel(
    val id: String,
    val relativePath: String,
    val name: String,
    val color: String,
    val editable: Boolean,
)

val CALENDAR_COLOR_PALETTE: List<String> = listOf(
    "#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8", "#cba6f7",
    "#94e2d5", "#fab387", "#74c7ec", "#b4befe", "#eba0ac",
)

/** `stableColor(path, index)` : un hachage de 32 bits signé, comme `(hash * 31 + code) | 0`. */
fun stableCalendarColor(path: String, index: Int): String {
    var hash = 0
    for (c in path) hash = hash * 31 + c.code
    val slot = abs(hash.toLong() + index) % CALENDAR_COLOR_PALETTE.size
    return CALENDAR_COLOR_PALETTE[slot.toInt()]
}

/** Les calendriers locaux dans l'ordre des préférences (`order`), puis par nom
 *  (`localeCompare`) ; la couleur rangée dans `colors`, sinon la couleur stable. */
fun buildCalendarModels(
    calendars: List<WorkspaceCalendar>,
    preferences: JsonObject,
    locale: Locale = Locale.getDefault(),
): List<CalendarModel> {
    val colors = preferences["colors"] as? JsonObject
    val order = (preferences["order"] as? JsonArray).orEmpty()
        .mapIndexedNotNull { index, item ->
            (item as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { it to index }
        }
        .toMap()
    val collator = Collator.getInstance(locale).apply { strength = Collator.TERTIARY }
    return calendars
        .mapIndexed { index, calendar ->
            val stored = (colors?.get(calendar.relativePath) as? JsonPrimitive)?.takeIf { it.isString }?.content
            CalendarModel(
                id = calendarIdFromPath(calendar.relativePath),
                relativePath = calendar.relativePath,
                name = calendar.name,
                color = stored ?: stableCalendarColor(calendar.relativePath, index),
                editable = true,
            )
        }
        .sortedWith { a, b ->
            val left = order[a.relativePath] ?: Int.MAX_VALUE
            val right = order[b.relativePath] ?: Int.MAX_VALUE
            if (left != right) left.compareTo(right) else collator.compare(a.name, b.name)
        }
}
