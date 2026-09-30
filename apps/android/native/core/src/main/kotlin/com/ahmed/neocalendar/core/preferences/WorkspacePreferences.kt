package com.ahmed.neocalendar.core.preferences

import com.ahmed.neocalendar.core.notes.jsTrim
import kotlin.math.floor
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/*
 * Port de desktopWorkspacePreferences.ts (défauts et lecture tolérante de
 * `.neo-calendar.json`). Les préférences restent un JsonObject aux noms de
 * champs du TypeScript ; une préférence absente est absente (defaultCalendarPath).
 * Le TypeScript accepte tout ce que JS tient pour un « object » : un tableau
 * passe la garde de la racine et de `colors` (ses indices deviennent des clés).
 */

/** Les délais proposés tels quels, avant la durée personnalisée. */
val REMINDER_CHOICES: List<Long> = listOf(0, 5, 10, 15, 30, 60)

/** Ce que vaut un calendrier dont personne n'a réglé le rappel de prière :
 *  une notification à l'heure même. */
val DEFAULT_PRAYER_REMINDER: List<Long> = listOf(0)

/** Quatre semaines : au-delà, le délai a été écrit à la main par erreur. */
const val MAX_REMINDER_MINUTES = 40320

internal val VIEW_TYPES = listOf("day", "week", "month", "list", "3days", "days")
private val DESKTOP_INITIAL_VIEWS = listOf("day", "week", "month", "list")
private val MOBILE_INITIAL_VIEWS = listOf("day", "3days", "list")
private val MAPS_TRAVEL_MODES = listOf("auto", "transit", "driving", "walking", "bicycling")
private val MAPS_APPS = listOf("google", "citymapper", "moovit", "waze")

private val HEX_COLOR = Regex("#[0-9a-fA-F]{6}")
private val CLOCK = Regex("([01]\\d|2[0-3]):[0-5]\\d")

private fun longs(values: List<Long>) = JsonArray(values.map { JsonPrimitive(it) })

private fun stringsArray(values: Iterable<String>) = JsonArray(values.map { JsonPrimitive(it) })

fun defaultWorkspacePreferences(): JsonObject = JsonObject(
    linkedMapOf(
        "version" to JsonPrimitive(5L),
        "colors" to JsonObject(emptyMap()),
        "order" to JsonArray(emptyList()),
        "hiddenCalendarPaths" to JsonArray(emptyList()),
        "allDayCollapsed" to JsonPrimitive(false),
        "showWeekNumbers" to JsonPrimitive(false),
        "sidebarVisible" to JsonPrimitive(true),
        "viewType" to JsonPrimitive("week"),
        "dayCount" to JsonPrimitive(4L),
        "secondaryTimezones" to JsonArray(emptyList()),
        "initialView" to JsonObject(
            mapOf("desktop" to JsonPrimitive("week"), "mobile" to JsonPrimitive("3days"))
        ),
        "firstDay" to JsonPrimitive(1L),
        "timeFormat24h" to JsonPrimitive(true),
        "clickToCreateEventFromMonthView" to JsonPrimitive(true),
        "freeScroll" to JsonPrimitive(false),
        "defaultEventsAsTasks" to JsonPrimitive(false),
        "reminderMinutes" to longs(listOf(10)),
        "calendarReminderMinutes" to JsonObject(emptyMap()),
        "mapsTravelMode" to JsonPrimitive("auto"),
        "mapsApp" to JsonPrimitive("ask"),
        "icsDefaultRefreshMinutes" to JsonPrimitive(60L),
        "icsFeeds" to JsonArray(emptyList()),
        "externalCalendars" to JsonArray(emptyList()),
        "prayerMosques" to JsonObject(emptyMap()),
        "prayerColors" to JsonObject(emptyMap()),
        "prayerReminderMinutes" to JsonObject(emptyMap()),
        "prayerJumua" to JsonObject(emptyMap()),
    )
)

/** Un nombre JSON (jamais une chaîne, un booléen ou null : JS n'y voit pas un number). */
internal fun numberOf(value: JsonElement?): Double? {
    if (value !is JsonPrimitive || value is JsonNull || value.isString) return null
    return value.content.toDoubleOrNull()?.takeIf { it.isFinite() }
}

private fun wholeNumber(value: Double) = value == floor(value)

internal fun stringOf(value: JsonElement?): String? =
    if (value is JsonPrimitive && value.isString) value.content else null

private fun boolOf(value: JsonElement?, fallback: Boolean): Boolean {
    if (value !is JsonPrimitive || value.isString) return fallback
    return value.booleanOrNull ?: fallback
}

/** Les chaînes d'un tableau, le reste écarté ; tout autre type donne []. */
private fun strings(value: JsonElement?): JsonArray =
    JsonArray(if (value is JsonArray) value.filter { it is JsonPrimitive && it.isString } else emptyList())

/** Un délai qu'un choix a pu produire : un nombre entier de minutes, de zéro
 *  à quatre semaines. Tout le reste retombe sur la valeur par défaut. */
fun isReminderMinutes(value: JsonElement?): Boolean {
    val number = numberOf(value) ?: return false
    return wholeNumber(number) && number >= 0 && number <= MAX_REMINDER_MINUTES
}

/** Un nombre seul est ce qu'écrivaient les versions d'avant la 1.79.0 (0 y
 *  voulait dire « aucun ») ; un tableau est trié, sans doublon ni zéro. */
fun reminderListOf(value: JsonElement?): List<Long>? {
    if (isReminderMinutes(value)) {
        val minutes = numberOf(value)!!.toLong()
        return if (minutes == 0L) emptyList() else listOf(minutes)
    }
    if (value !is JsonArray || !value.all { isReminderMinutes(it) }) return null
    return value.map { numberOf(it)!!.toLong() }.filter { it > 0 }.distinct().sorted()
}

fun prayerReminderMinutesFor(settings: JsonObject, relativePath: String): List<Long> {
    val entry = settings[relativePath] as? JsonArray ?: return DEFAULT_PRAYER_REMINDER.toList()
    return entry.map { numberOf(it)!!.toLong() }
}

/** Les paires d'un objet JSON ; un tableau ou tout autre type n'en a pas (le
 *  TypeScript écarte le tableau de ces tables). */
private fun pairsOf(value: JsonElement?): Map<String, JsonElement> =
    if (value is JsonObject) value else emptyMap()

private fun calendarRemindersOf(source: JsonElement?): JsonObject =
    JsonObject(
        pairsOf(source).mapNotNull { (path, value) -> reminderListOf(value)?.let { path to longs(it) } }.toMap()
    )

private fun prayerRemindersOf(source: JsonElement?): JsonObject =
    JsonObject(
        pairsOf(source).mapNotNull { (path, value) ->
            if (value is JsonArray && value.all { isReminderMinutes(it) }) {
                path to longs(value.map { numberOf(it)!!.toLong() }.distinct().sorted())
            } else null
        }.toMap()
    )

private fun prayerJumuaOf(source: JsonElement?): JsonObject =
    JsonObject(
        pairsOf(source).mapNotNull { (path, value) ->
            if (value is JsonArray && value.isNotEmpty() &&
                value.all { stringOf(it)?.let { text -> CLOCK.matches(text) } == true }
            ) {
                path to stringsArray(value.map { stringOf(it)!! }.distinct().sorted())
            } else null
        }.toMap()
    )

private fun prayerMosquesOf(source: JsonElement?): JsonObject =
    JsonObject(pairsOf(source).filter { (_, value) -> stringOf(value)?.jsTrim()?.isNotEmpty() == true })

private fun prayerColorsOf(source: JsonElement?): JsonObject =
    JsonObject(pairsOf(source).filter { (_, value) -> stringOf(value)?.let { HEX_COLOR.matches(it) } == true })

/** `colors` : JS lit un tableau comme un objet dont les clés sont les indices. */
private fun colorsOf(value: JsonElement?): JsonObject {
    val entries: List<Pair<String, JsonElement>> = when (value) {
        is JsonObject -> value.entries.map { it.key to it.value }
        is JsonArray -> value.mapIndexed { index, item -> index.toString() to item }
        else -> emptyList()
    }
    return JsonObject(entries.filter { stringOf(it.second) != null }.toMap())
}

/** Math.round de JS : l'entier le plus proche, les demis vers le haut. */
internal fun jsRound(value: Double) = floor(value + 0.5)

fun parseWorkspacePreferences(value: JsonElement?): JsonObject {
    // Un tableau passe la garde du TypeScript et n'a aucun des champs lus.
    val source = when (value) {
        is JsonObject -> value
        is JsonArray -> JsonObject(emptyMap())
        else -> return defaultWorkspacePreferences()
    }

    val initialView = pairsOf(source["initialView"])
    val legacyView = stringOf(source["viewType"])?.takeIf { it in VIEW_TYPES } ?: "week"
    val desktopInitial = stringOf(initialView["desktop"])?.takeIf { it in DESKTOP_INITIAL_VIEWS }
        ?: legacyView.takeIf { it in DESKTOP_INITIAL_VIEWS }
        ?: "week"
    val mobileInitial = stringOf(initialView["mobile"])?.takeIf { it in MOBILE_INITIAL_VIEWS } ?: "3days"

    val firstDay = numberOf(source["firstDay"])
        ?.takeIf { wholeNumber(it) && it >= 0 && it <= 6 }?.toLong() ?: 1L
    val dayCount = numberOf(source["dayCount"])
        ?.takeIf { it >= 1 }?.let { minOf(60.0, jsRound(it)).toLong() } ?: 4L

    // `??` : seuls null et l'absence laissent passer calendarSources.
    val legacySources = parseExternalCalendarSources(
        source["externalCalendars"]?.takeUnless { it is JsonNull } ?: source["calendarSources"]
    )
    val legacyIcalMigration = migrateLegacyIcalSources(legacySources)
    val ownFeeds = (source["icsFeeds"] as? JsonArray) ?: JsonArray(emptyList())

    val fields = LinkedHashMap<String, JsonElement>()
    fields["version"] = JsonPrimitive(5L)
    fields["colors"] = colorsOf(source["colors"])
    fields["order"] = strings(source["order"])
    stringOf(source["defaultCalendarPath"])?.let { fields["defaultCalendarPath"] = JsonPrimitive(it) }
    fields["hiddenCalendarPaths"] = strings(source["hiddenCalendarPaths"])
    fields["allDayCollapsed"] = JsonPrimitive(boolOf(source["allDayCollapsed"], false))
    fields["showWeekNumbers"] = JsonPrimitive(boolOf(source["showWeekNumbers"], false))
    fields["sidebarVisible"] = JsonPrimitive(boolOf(source["sidebarVisible"], true))
    fields["viewType"] = JsonPrimitive(stringOf(source["viewType"])?.takeIf { it in VIEW_TYPES } ?: desktopInitial)
    fields["dayCount"] = JsonPrimitive(dayCount)
    fields["secondaryTimezones"] = strings(source["secondaryTimezones"])
    fields["initialView"] = JsonObject(
        mapOf("desktop" to JsonPrimitive(desktopInitial), "mobile" to JsonPrimitive(mobileInitial))
    )
    fields["firstDay"] = JsonPrimitive(firstDay)
    fields["timeFormat24h"] = JsonPrimitive(boolOf(source["timeFormat24h"], true))
    fields["clickToCreateEventFromMonthView"] = JsonPrimitive(boolOf(source["clickToCreateEventFromMonthView"], true))
    fields["freeScroll"] = JsonPrimitive(boolOf(source["freeScroll"], false))
    fields["defaultEventsAsTasks"] = JsonPrimitive(boolOf(source["defaultEventsAsTasks"], false))
    fields["reminderMinutes"] = longs(reminderListOf(source["reminderMinutes"]) ?: listOf(10L))
    fields["calendarReminderMinutes"] = calendarRemindersOf(source["calendarReminderMinutes"])
    fields["mapsTravelMode"] = JsonPrimitive(stringOf(source["mapsTravelMode"])?.takeIf { it in MAPS_TRAVEL_MODES } ?: "auto")
    fields["mapsApp"] = JsonPrimitive(stringOf(source["mapsApp"])?.takeIf { it == "ask" || it in MAPS_APPS } ?: "ask")
    fields["icsDefaultRefreshMinutes"] = JsonPrimitive((refreshMinutes(source["icsDefaultRefreshMinutes"]) ?: 60).toLong())
    fields["icsFeeds"] = parseIcsFeeds(JsonArray(ownFeeds + (legacyIcalMigration.getValue("feeds") as JsonArray)))
    fields["externalCalendars"] = JsonArray(
        legacySources.filter { ((it as JsonObject)["type"] as JsonPrimitive).content == "auto" } +
            (legacyIcalMigration.getValue("unresolved") as JsonArray)
    )
    fields["prayerMosques"] = prayerMosquesOf(source["prayerMosques"])
    fields["prayerColors"] = prayerColorsOf(source["prayerColors"])
    fields["prayerReminderMinutes"] = prayerRemindersOf(source["prayerReminderMinutes"])
    fields["prayerJumua"] = prayerJumuaOf(source["prayerJumua"])
    return JsonObject(fields)
}
