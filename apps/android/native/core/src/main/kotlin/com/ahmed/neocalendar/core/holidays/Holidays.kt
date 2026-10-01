package com.ahmed.neocalendar.core.holidays

import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Les calendriers « jours fériés » (calendriers automatiques) : port de src/calendars/auto/rules.ts (expandRules) et de
 * AutoCalendar.ts. Un calendrier automatique n'est pas un dossier : sa source (nom, couleur, règles) vit dans
 * `externalCalendars` des préférences, ses jours se calculent sur l'appareil, en lecture seule.
 *
 * Quatre sortes de règles sont portées : `f` (date fixe), `e` (décalage depuis Pâques), `n` (n-ième jour de semaine d'un mois,
 * `i = -1` pour le dernier, `a` pour éviter une collision avec Pâques + a) et `x` (dates listées), plus `w` (chaque semaine).
 * Les règles hijri (`h`, `hm`) demandent la table de conversion hijri, non portée : elles ne produisent aucun jour ici
 * (le calendrier de France du modèle n'en a pas).
 */

/** Combien d'années autour de l'année courante le calendrier génère (AutoCalendar.ts : YEARS_BEHIND / YEARS_AHEAD). */
const val HOLIDAYS_YEARS_BEHIND = 5
const val HOLIDAYS_YEARS_AHEAD = 10

/** Une source de calendrier automatique, telle que `externalCalendars` la range. */
data class HolidaySource(val id: String, val name: String, val color: String, val rules: List<JsonObject>) {
    /** L'identifiant du calendrier dans l'écran, et la clé de ses couleur, ordre et masquage dans les préférences. */
    val calendarId: String get() = "auto::$id"
}

private fun text(value: JsonElement?): String? = (value as? JsonPrimitive)?.takeIf { it.isString }?.content

/** Les sources automatiques de `externalCalendars` (déjà nettoyées par `parseWorkspacePreferences`). */
fun holidaySourcesOf(preferences: JsonObject): List<HolidaySource> {
    val colors = preferences["colors"] as? JsonObject
    return (preferences["externalCalendars"] as? JsonArray).orEmpty().mapNotNull { item ->
        val source = item as? JsonObject ?: return@mapNotNull null
        if (text(source["type"]) != "auto") return@mapNotNull null
        val id = text(source["id"]) ?: return@mapNotNull null
        val name = text(source["name"]) ?: return@mapNotNull null
        val rules = (source["rules"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
        // La couleur choisie au tiroir est rangée sous la clé du calendrier ; à défaut, celle de la source.
        val color = text(colors?.get("auto::$id")) ?: text(source["color"]) ?: "#89b4fa"
        HolidaySource(id, name, color, rules)
    }
}

/** Pâques (calendrier grégorien), par l'algorithme anonyme de Meeus / Jones / Butcher. */
fun easterSunday(year: Int): LocalDate {
    val a = year % 19
    val b = year / 100
    val c = year % 100
    val d = b / 4
    val e = b % 4
    val f = (b + 8) / 25
    val g = (b - f + 1) / 3
    val h = (19 * a + b - d - g + 15) % 30
    val i = c / 4
    val k = c % 4
    val l = (32 + 2 * e + 2 * i - h - k) % 7
    val m = (a + 11 * h + 22 * l) / 451
    val month = (h + l - 7 * m + 114) / 31
    val day = (h + l - 7 * m + 114) % 31 + 1
    return LocalDate.of(year, month, day)
}

/** 0 = dimanche, comme `Date#getDay`. */
private fun weekdayOf(index: Int): DayOfWeek = if (index == 0) DayOfWeek.SUNDAY else DayOfWeek.of(index)

private fun nthWeekday(year: Int, month: Int, weekday: Int, ordinal: Int): LocalDate {
    val target = weekdayOf(weekday)
    if (ordinal == -1) {
        val last = YearMonth.of(year, month).atEndOfMonth()
        return last.minusDays(((last.dayOfWeek.value - target.value + 7) % 7).toLong())
    }
    val first = LocalDate.of(year, month, 1)
    val offset = (target.value - first.dayOfWeek.value + 7) % 7
    return first.plusDays((offset + (ordinal - 1) * 7).toLong())
}

private fun int(rule: JsonObject, key: String): Int? = (rule[key] as? JsonPrimitive)?.takeIf { !it.isString && it !is JsonNull }?.content?.toDoubleOrNull()?.toInt()

/** La date d'une règle l'année `year`, ou null si elle n'a pas lieu cette année-là. */
private fun dateFor(rule: JsonObject, year: Int): LocalDate? = when (text(rule["k"])) {
    "f" -> runCatching { LocalDate.of(year, int(rule, "m") ?: return null, int(rule, "d") ?: return null) }.getOrNull()
    "e" -> easterSunday(year).plusDays((int(rule, "o") ?: return null).toLong())
    "n" -> {
        var date = nthWeekday(year, int(rule, "m") ?: return null, int(rule, "w") ?: return null, int(rule, "i") ?: return null)
        val after = int(rule, "a")
        // Mère-fête : le dernier dimanche de mai, sauf s'il tombe sur la Pentecôte (Pâques + 49) : une semaine plus tard.
        if (after != null && date == easterSunday(year).plusDays(after.toLong())) date = date.plusDays(7)
        date
    }
    "x" -> (rule["d"] as? JsonArray).orEmpty().mapNotNull { text(it) }.firstOrNull { it.startsWith("$year-") }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    else -> null
}

/** Un jour de fête : sa date et son nom. */
data class Holiday(val date: LocalDate, val name: String)

/** Tous les jours que ces règles donnent de `firstYear` à `lastYear`, triés par date puis par nom. */
fun expandHolidayRules(rules: List<JsonObject>, firstYear: Int, lastYear: Int): List<Holiday> {
    val out = ArrayList<Holiday>()
    for (rule in rules) {
        val name = text(rule["n"]) ?: continue
        when (text(rule["k"])) {
            "w" -> {
                val weekday = weekdayOf(int(rule, "w") ?: continue)
                var day = LocalDate.of(firstYear, 1, 1)
                val end = LocalDate.of(lastYear, 12, 31)
                while (!day.isAfter(end)) {
                    if (day.dayOfWeek == weekday) out += Holiday(day, name)
                    day = day.plusDays(1)
                }
            }
            "h", "hm" -> Unit
            else -> for (year in firstYear..lastYear) dateFor(rule, year)?.let { out += Holiday(it, name) }
        }
    }
    return out.filter { it.date.year in firstYear..lastYear }.sortedWith(compareBy<Holiday> { it.date }.thenBy { it.name })
}

private fun slug(name: String): String = name.replace(Regex("[^a-zA-Z0-9]+"), "-").trim('-').lowercase()

/**
 * Les jours d'un calendrier automatique, en évènements « journée entière » en lecture seule (AutoCalendar.getEvents),
 * de cinq ans avant à dix ans après l'année `currentYear`. Deux fêtes le même jour gardent des identifiants distincts.
 */
fun holidayDisplayEvents(source: HolidaySource, currentYear: Int, zone: ZoneId): List<DisplayEvent> {
    val used = HashMap<String, Int>()
    return expandHolidayRules(source.rules, currentYear - HOLIDAYS_YEARS_BEHIND, currentYear + HOLIDAYS_YEARS_AHEAD).map { holiday ->
        val base = "auto-${source.id}-${holiday.date}-${slug(holiday.name)}"
        val seen = used.getOrDefault(base, 0)
        used[base] = seen + 1
        DisplayEvent(
            id = if (seen == 0) base else "$base-$seen",
            title = holiday.name,
            start = holiday.date.atStartOfDay(zone).toInstant(),
            end = holiday.date.plusDays(1).atStartOfDay(zone).toInstant(),
            allDay = true,
            color = source.color,
            editable = false,
            calendarId = source.calendarId,
            calendarName = source.name,
            isTask = false,
            taskCompleted = JsonPrimitive(false),
            taskStatus = null,
            reminders = null,
            isRecurring = false,
            isSeriesStart = false,
            isMultiDay = false,
            isSomeday = false,
            description = null,
            location = null,
        )
    }
}
