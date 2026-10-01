package com.ahmed.neocalendar.core.widget

import com.ahmed.neocalendar.core.notes.jsTrim
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.recurrence.addDays
import com.ahmed.neocalendar.core.recurrence.localZone
import com.ahmed.neocalendar.core.recurrence.startOfDay
import com.ahmed.neocalendar.core.reminders.DAYS_SHORT
import com.ahmed.neocalendar.core.reminders.formatTime
import com.ahmed.neocalendar.core.reminders.t
import java.time.Instant
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de apps/windows/src/platform/androidWidget.ts : ce que le widget de
 * l'écran d'accueil reçoit à dessiner. Il ne lit pas le calendrier : l'app lui
 * remet la liste finie, déjà groupée par jour, écrite dans la langue et le
 * format d'heure choisis, colorée par calendrier.
 */

/** Au-delà, une ligne n'est jamais vue. */
private const val MAX_ROWS = 60

/** Au-delà, un jour n'est plus « à venir ». */
private const val HORIZON_DAYS = 30L

data class WidgetRow(
    val id: String,
    val startMs: Long,
    val endMs: Long,
    /** Le jour où tombe la ligne, pour regrouper une fois le passé écarté. */
    val dayKey: String,
    val weekday: String,
    val day: String,
    val title: String,
    /** Vide pour une journée entière : pas de durée à lire. */
    val time: String,
    val allDay: Boolean,
    val color: String,
    /** Ajout du natif : le lieu, vide s'il n'y en a pas (absent de la charge dans ce cas). Le TypeScript n'a pas ce champ. */
    val location: String,
    /** Ajout du natif : le calendrier de la ligne, pour que chaque widget filtre selon son choix. */
    val calendarId: String = "",
) {
    /** [withNativeFields] faux : la forme exacte du TypeScript, que le corpus compare (sans lieu ni calendrier). */
    fun toJson(withNativeFields: Boolean = true): JsonObject {
        val record = LinkedHashMap<String, JsonElement>()
        record["id"] = JsonPrimitive(id)
        record["startMs"] = JsonPrimitive(startMs)
        record["endMs"] = JsonPrimitive(endMs)
        record["dayKey"] = JsonPrimitive(dayKey)
        record["weekday"] = JsonPrimitive(weekday)
        record["day"] = JsonPrimitive(day)
        record["title"] = JsonPrimitive(title)
        record["time"] = JsonPrimitive(time)
        record["allDay"] = JsonPrimitive(allDay)
        record["color"] = JsonPrimitive(color)
        if (withNativeFields && location.isNotEmpty()) record["location"] = JsonPrimitive(location)
        if (withNativeFields) record["calendarId"] = JsonPrimitive(calendarId)
        return JsonObject(record)
    }
}

/** Un calendrier proposé à la configuration du widget (ajout du natif). */
data class WidgetCalendar(val id: String, val name: String, val color: String) {
    fun toJson(): JsonObject = JsonObject(
        mapOf<String, JsonElement>(
            "id" to JsonPrimitive(id),
            "name" to JsonPrimitive(name),
            "color" to JsonPrimitive(color),
        )
    )
}

data class WidgetTheme(val surface: String, val text: String, val muted: String, val accent: String) {
    fun toJson(): JsonObject = JsonObject(
        mapOf<String, JsonElement>(
            "surface" to JsonPrimitive(surface),
            "text" to JsonPrimitive(text),
            "muted" to JsonPrimitive(muted),
            "accent" to JsonPrimitive(accent),
        )
    )
}

data class WidgetPayload(
    val updatedAt: Long,
    val rows: List<WidgetRow>,
    /** Les noms des jours, dimanche en premier, pour que le widget nomme un jour de lui-même. */
    val weekdays: List<String>,
    val emptyLabel: String,
    val theme: WidgetTheme,
    /** Les calendriers visibles, pour la liste à cocher de la configuration (ajout du natif). */
    val calendars: List<WidgetCalendar> = emptyList(),
) {
    fun toJson(withNativeFields: Boolean = true): JsonObject {
        val record = LinkedHashMap<String, JsonElement>()
        record["updatedAt"] = JsonPrimitive(updatedAt)
        record["rows"] = JsonArray(rows.map { it.toJson(withNativeFields) })
        record["weekdays"] = JsonArray(weekdays.map { JsonPrimitive(it) })
        record["emptyLabel"] = JsonPrimitive(emptyLabel)
        record["theme"] = theme.toJson()
        if (withNativeFields) record["calendars"] = JsonArray(calendars.map { it.toJson() })
        return JsonObject(record)
    }
}

/** `${année}-${mois de 0 à 11}-${jour}`, jour civil local. */
private fun dayKey(date: Instant): String {
    val local = date.atZone(localZone())
    return "${local.year}-${local.monthValue - 1}-${local.dayOfMonth}"
}

fun buildWidgetPayload(
    events: List<DisplayEvent>,
    now: Instant,
    timeFormat24h: Boolean,
    theme: WidgetTheme,
    calendars: List<WidgetCalendar> = emptyList(),
): WidgetPayload {
    val horizon = addDays(startOfDay(now), HORIZON_DAYS)

    // Un évènement commencé ce matin et fini ce soir est encore à venir : ce qui compte, c'est qu'il ne soit pas fini.
    val upcoming = events
        .filter { !it.isSomeday }
        .filter { it.end >= now && it.start < horizon }
        .sortedBy { it.start }
        .take(MAX_ROWS)

    val rows = upcoming.map { event ->
        val local = event.start.atZone(localZone())
        WidgetRow(
            id = event.id,
            startMs = event.start.toEpochMilli(),
            endMs = event.end.toEpochMilli(),
            dayKey = dayKey(event.start),
            weekday = DAYS_SHORT[local.dayOfWeek.value % 7],
            day = local.dayOfMonth.toString(),
            title = event.title.ifEmpty { t("Untitled") },
            time = if (event.allDay) "" else "${formatTime(event.start, timeFormat24h)} – ${formatTime(event.end, timeFormat24h)}",
            allDay = event.allDay,
            color = event.color,
            location = (event.location ?: "").jsTrim(),
            calendarId = event.calendarId,
        )
    }

    return WidgetPayload(
        updatedAt = now.toEpochMilli(),
        rows = rows,
        weekdays = DAYS_SHORT,
        emptyLabel = t("No event scheduled"),
        theme = theme,
        calendars = calendars,
    )
}

private fun parseHex(color: String): IntArray? {
    var hex = color.trim().lowercase()
    if (!hex.startsWith("#")) return null
    hex = hex.substring(1)
    if (hex.length == 3 || hex.length == 4) hex = hex.map { "$it$it" }.joinToString("")
    if (hex.length != 6 && hex.length != 8) return null
    if (!hex.all { it in '0'..'9' || it in 'a'..'f' }) return null
    return intArrayOf(hex.substring(0, 2).toInt(16), hex.substring(2, 4).toInt(16), hex.substring(4, 6).toInt(16))
}

/** `mix` de androidWidget.ts : `a` pèse [weight], `b` le reste ; `a` si l'une des deux est illisible. */
internal fun mixColors(a: String, b: String, weight: Double): String {
    val left = parseHex(a) ?: return a
    val right = parseHex(b) ?: return a
    return "#" + (0..2).joinToString("") { i ->
        val value = left[i] * weight + right[i] * (1 - weight)
        Math.max(0, Math.min(255, Math.floor(value + 0.5).toInt())).toString(16).padStart(2, '0')
    }
}

/**
 * Les couleurs du widget à partir des trois couleurs du thème (surface, encre, accent),
 * avec la même recette que App.tsx pour le CSS : surface relevée de 12 % d'encre,
 * encre atténuée de 28 % de surface.
 */
fun widgetThemeOf(surface: String, ink: String, accent: String): WidgetTheme {
    val raised = mixColors(surface, ink, 0.88)
    return WidgetTheme(surface = raised, text = ink, muted = mixColors(ink, surface, 0.72), accent = accent)
}
