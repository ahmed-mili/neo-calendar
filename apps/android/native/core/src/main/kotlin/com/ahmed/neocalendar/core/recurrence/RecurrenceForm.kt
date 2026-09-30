package com.ahmed.neocalendar.core.recurrence

import com.ahmed.neocalendar.core.format.formatDatedDayWithYear
import com.ahmed.neocalendar.core.reminders.t
import java.time.LocalDate
import java.time.Year
import java.util.Locale
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/*
 * Port de src/ui/calendar/recurrence.ts : la répétition telle que la fiche la
 * tient (fréquence, intervalle, jours, mode mensuel, fin), sa conversion vers
 * et depuis la règle RRULE que la note porte, les préréglages et le résumé en
 * français. Les règles lues sont celles que l'application écrit ; une forme
 * qu'elle n'écrit jamais n'est pas reproduite (voir conformance/README.md).
 */

enum class Freq(val key: String) { Daily("daily"), Weekly("weekly"), Monthly("monthly"), Yearly("yearly") }

enum class MonthMode(val key: String) { DayOfMonth("dayOfMonth"), DayOfWeek("dayOfWeek") }

sealed interface RecurEnd {
    data object Never : RecurEnd
    data class Until(val date: String) : RecurEnd
    data class Count(val count: Int) : RecurEnd
}

data class RecurrenceState(
    val freq: Freq,
    val interval: Int,
    /** Codes de jour U M T W R F S, dans l'ordre choisi. */
    val byDay: List<String>,
    val monthMode: MonthMode,
    val end: RecurEnd,
)

/** Suit `Date.getDay()` : indice 0 = dimanche. */
val DAY_ORDER: List<String> = listOf("U", "M", "T", "W", "R", "F", "S")

private val RRULE_DAY = mapOf("U" to "SU", "M" to "MO", "T" to "TU", "W" to "WE", "R" to "TH", "F" to "FR", "S" to "SA")

/** Indice rrule (MO=0 ... SU=6) vers le code de jour. */
private val RRULE_DAY_TO_CODE = mapOf("MO" to "M", "TU" to "T", "WE" to "W", "TH" to "R", "FR" to "F", "SA" to "S", "SU" to "U")

fun orderedDayCodes(firstDay: Int): List<String> = List(7) { DAY_ORDER[(it + firstDay) % 7] }

/** `DAY_ORDER[new Date(iso + "T00:00:00").getDay()]` ; une date illisible rend « M » (le TypeScript rend undefined). */
fun dayCodeOf(dateISO: String): String {
    val date = parseIsoDate(dateISO) ?: return "M"
    return DAY_ORDER[date.dayOfWeek.value % 7]
}

fun defaultRecurrence(startDateISO: String) =
    RecurrenceState(Freq.Weekly, 1, listOf(dayCodeOf(startDateISO)), MonthMode.DayOfMonth, RecurEnd.Never)

private fun untilText(date: String): String = date.replace("-", "") + "T235959Z"

fun recurrenceToRRule(state: RecurrenceState, startDateISO: String): String {
    val parts = mutableListOf("FREQ=${state.freq.name.uppercase(Locale.ROOT)}", "INTERVAL=${maxOf(1, state.interval)}")
    if (state.freq == Freq.Weekly) {
        val days = state.byDay.ifEmpty { listOf(dayCodeOf(startDateISO)) }
        parts += "BYDAY=" + days.joinToString(",") { RRULE_DAY.getValue(it) }
    }
    if (state.freq == Freq.Monthly) {
        val date = parseIsoDate(startDateISO)
        val dayOfMonth = date?.dayOfMonth ?: 1
        if (state.monthMode == MonthMode.DayOfWeek) {
            val nth = (dayOfMonth + 6) / 7
            parts += "BYDAY=+$nth" + RRULE_DAY.getValue(dayCodeOf(startDateISO))
        } else {
            parts += "BYMONTHDAY=$dayOfMonth"
        }
    }
    when (val end = state.end) {
        is RecurEnd.Until -> parts += "UNTIL=" + untilText(end.date)
        is RecurEnd.Count -> parts += "COUNT=${maxOf(1, end.count)}"
        RecurEnd.Never -> {}
    }
    return "RRULE:" + parts.joinToString(";")
}

/** Les parties `CLÉ=valeur` d'une règle, dans l'ordre du texte, préfixe `RRULE:` retiré. */
internal fun rruleParts(rrule: String): List<Pair<String, String>> =
    rrule.trim().removePrefix("RRULE:").split(";").filter { it.isNotEmpty() }.map {
        val eq = it.indexOf('=')
        if (eq < 0) it.uppercase(Locale.ROOT) to "" else it.substring(0, eq).uppercase(Locale.ROOT) to it.substring(eq + 1)
    }

private val NTH_WEEKDAY = Regex("""([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)""", RegexOption.IGNORE_CASE)

fun rruleToRecurrence(rrule: String, startDateISO: String): RecurrenceState {
    val parts = rruleParts(rrule)
    fun value(key: String) = parts.lastOrNull { it.first == key }?.second
    val freq = when (value("FREQ")?.uppercase(Locale.ROOT)) {
        "DAILY" -> Freq.Daily
        "MONTHLY" -> Freq.Monthly
        "YEARLY" -> Freq.Yearly
        else -> Freq.Weekly
    }
    val interval = value("INTERVAL")?.toIntOrNull()?.takeIf { it != 0 } ?: 1
    val weekdays = value("BYDAY")?.split(",")?.mapNotNull { NTH_WEEKDAY.matchEntire(it.trim()) }.orEmpty()

    var byDay = emptyList<String>()
    if (freq == Freq.Weekly) {
        byDay = weekdays.map { RRULE_DAY_TO_CODE.getValue(it.groupValues[2].uppercase(Locale.ROOT)) }
        if (byDay.isEmpty()) byDay = listOf(dayCodeOf(startDateISO))
    }
    val monthMode =
        if (freq == Freq.Monthly && weekdays.isNotEmpty() && weekdays[0].groupValues[1].isNotEmpty()) MonthMode.DayOfWeek
        else MonthMode.DayOfMonth

    val until = value("UNTIL")
    val count = value("COUNT")?.toIntOrNull()?.takeIf { it != 0 }
    val end = when {
        until != null && until.length >= 8 && until.take(8).all { it.isDigit() } ->
            RecurEnd.Until("${until.substring(0, 4)}-${until.substring(4, 6)}-${until.substring(6, 8)}")
        count != null -> RecurEnd.Count(count)
        else -> RecurEnd.Never
    }
    return RecurrenceState(freq, interval, byDay, monthMode, end)
}

fun recurringToRecurrence(daysOfWeek: List<String>, startRecur: String?, endRecur: String?, startDateISO: String) =
    RecurrenceState(
        Freq.Weekly, 1,
        daysOfWeek.ifEmpty { listOf(dayCodeOf(startDateISO)) },
        MonthMode.DayOfMonth,
        if (!endRecur.isNullOrEmpty()) RecurEnd.Until(endRecur) else RecurEnd.Never,
    )

data class EventRecurrence(val isRecurring: Boolean, val recurrence: RecurrenceState)

private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.strings(key: String): List<String> =
    (this[key] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }

/** `eventToRecurrenceState` sur l'évènement tel que la note le porte (objet JSON). */
fun eventToRecurrenceState(event: JsonObject, startDateISO: String): EventRecurrence {
    when (event.text("type")) {
        "rrule" -> return EventRecurrence(
            true,
            rruleToRecurrence(event.text("rrule").orEmpty(), event.text("startDate").orEmpty().ifEmpty { startDateISO }),
        )
        "recurring" -> {
            val startRecur = event.text("startRecur")
            return EventRecurrence(
                true,
                recurringToRecurrence(
                    event.strings("daysOfWeek"), startRecur, event.text("endRecur"),
                    startRecur.orEmpty().ifEmpty { startDateISO },
                ),
            )
        }
    }
    return EventRecurrence(false, defaultRecurrence(startDateISO))
}

/** `recurrenceToEventFields` : les champs qu'une répétition ajoute à l'évènement. */
fun recurrenceToEventFields(state: RecurrenceState, startDateISO: String): JsonObject = JsonObject(
    linkedMapOf(
        "type" to JsonPrimitive("rrule"),
        "startDate" to JsonPrimitive(startDateISO),
        "rrule" to JsonPrimitive(recurrenceToRRule(state, startDateISO)),
        "skipDates" to JsonArray(emptyList()),
    )
)

enum class PresetKey(val key: String) { Daily("daily"), Weekly("weekly"), Monthly("monthly"), Yearly("yearly"), Custom("custom") }

fun presetToRecurrence(key: PresetKey, startDateISO: String): RecurrenceState {
    val base = defaultRecurrence(startDateISO)
    return when (key) {
        PresetKey.Daily -> base.copy(freq = Freq.Daily, byDay = emptyList())
        PresetKey.Monthly -> base.copy(freq = Freq.Monthly, byDay = emptyList(), monthMode = MonthMode.DayOfMonth)
        PresetKey.Yearly -> base.copy(freq = Freq.Yearly, byDay = emptyList())
        PresetKey.Weekly, PresetKey.Custom -> base
    }
}

fun matchPreset(state: RecurrenceState, startDateISO: String): PresetKey {
    if (state.interval != 1 || state.end !is RecurEnd.Never) return PresetKey.Custom
    return when (state.freq) {
        Freq.Daily -> PresetKey.Daily
        Freq.Yearly -> PresetKey.Yearly
        Freq.Weekly ->
            if (state.byDay.size == 1 && state.byDay[0] == dayCodeOf(startDateISO)) PresetKey.Weekly else PresetKey.Custom
        Freq.Monthly -> if (state.monthMode == MonthMode.DayOfMonth) PresetKey.Monthly else PresetKey.Custom
    }
}

private val DAY_NAMES_LONG = listOf("dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi")

/** `formatDateLong` : « jeu 25 juin », avec l'année dès qu'elle n'est pas l'année en cours. */
fun formatDateLong(dateISO: String, currentYear: Int = Year.now().value): String {
    val date = parseIsoDate(dateISO) ?: return ""
    return formatDatedDayWithYear(date, currentYear)
}

/** `recurrenceSummary` : la répétition lue comme une phrase, en français. */
fun recurrenceSummary(state: RecurrenceState, currentYear: Int = Year.now().value): String {
    val interval = maxOf(1, state.interval)
    val everyKey = when (state.freq) {
        Freq.Daily -> "Every day" to "every {n} days"
        Freq.Weekly -> "Every week" to "every {n} weeks"
        Freq.Monthly -> "Every month" to "every {n} months"
        Freq.Yearly -> "Every year" to "every {n} years"
    }
    val parts = mutableListOf(
        if (interval == 1) t(everyKey.first) else t(everyKey.second).replace("{n}", interval.toString())
    )
    if (state.freq == Freq.Weekly && state.byDay.isNotEmpty()) {
        val days = DAY_ORDER.filter { it in state.byDay }.map { DAY_NAMES_LONG[DAY_ORDER.indexOf(it)] }
        parts += t("on {days}").replace("{days}", days.joinToString(", "))
    }
    val end = state.end
    if (end is RecurEnd.Until && end.date.isNotEmpty()) {
        parts += t("until {date}").replace("{date}", formatDateLong(end.date, currentYear))
    }
    if (end is RecurEnd.Count) {
        parts += t("{n} times").replace("{n}", maxOf(1, end.count).toString())
    }
    val headSize = if (state.freq == Freq.Weekly) 2 else 1
    val head = parts.take(headSize).joinToString(" ")
    val tail = parts.drop(headSize)
    val sentence = if (tail.isNotEmpty()) "$head, ${tail.joinToString(", ")}" else head
    return sentence.replaceFirstChar { it.uppercase(Locale.ROOT) }
}

// ── JSON du corpus : la forme que le TypeScript donne à RecurrenceState ──────

fun RecurrenceState.toJson(): JsonObject = JsonObject(
    linkedMapOf(
        "freq" to JsonPrimitive(freq.key),
        "interval" to JsonPrimitive(interval),
        "byDay" to JsonArray(byDay.map { JsonPrimitive(it) }),
        "monthMode" to JsonPrimitive(monthMode.key),
        "end" to when (val e = end) {
            RecurEnd.Never -> JsonObject(mapOf("kind" to JsonPrimitive("never")))
            is RecurEnd.Until -> JsonObject(mapOf("kind" to JsonPrimitive("until"), "date" to JsonPrimitive(e.date)))
            is RecurEnd.Count -> JsonObject(mapOf("kind" to JsonPrimitive("count"), "count" to JsonPrimitive(e.count)))
        },
    )
)

fun recurrenceStateOf(json: JsonObject): RecurrenceState {
    val end = json["end"] as? JsonObject
    return RecurrenceState(
        freq = Freq.entries.first { it.key == json.text("freq") },
        interval = (json["interval"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 1,
        byDay = json.strings("byDay"),
        monthMode = MonthMode.entries.firstOrNull { it.key == json.text("monthMode") } ?: MonthMode.DayOfMonth,
        end = when (end?.text("kind")) {
            "until" -> RecurEnd.Until(end.text("date").orEmpty())
            "count" -> RecurEnd.Count((end["count"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 1)
            else -> RecurEnd.Never
        },
    )
}
