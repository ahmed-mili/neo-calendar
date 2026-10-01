package com.ahmed.neocalendar.core.preferences

import com.ahmed.neocalendar.core.notes.jsTrim
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de parseExternalCalendarSources (desktopExternalCalendars.ts) et des
 * règles des calendriers automatiques (src/calendars/auto/rules.ts, le schéma
 * zod holidayRuleSchema). buildAutoCalendarEvents et parseIcalCalendarEvents
 * ne sont pas portés : ils appartiennent aux domaines récurrence et ICS.
 *
 * Les sources restent des JsonObject : l'écran Compose les typera quand il les
 * lira. Une clé absente du TypeScript est absente ici, jamais un null inventé.
 */

/** Le nom et la couleur du calendrier des jours fériés français (ceux de [FRANCE_HOLIDAY_SOURCE]). */
const val FRANCE_HOLIDAY_NAME = "Jours fériés et autres fêtes en France"
const val FRANCE_HOLIDAY_COLOR = "#4a9d5f"

/** Le calendrier des jours fériés français, proposé à l'ajout d'un calendrier. */
val FRANCE_HOLIDAY_SOURCE: JsonObject = jsonObject(
    "type" to JsonPrimitive("auto"),
    "country" to JsonPrimitive("FR"),
    "color" to JsonPrimitive("#4a9d5f"),
    "id" to JsonPrimitive("FR"),
    "name" to JsonPrimitive("Jours fériés et autres fêtes en France"),
    "icon" to JsonPrimitive("flag"),
    "rules" to JsonArray(
        listOf(
            fixed("Jour de l'an", 1, 1),
            nth("Heure d'été", 3, 0, -1),
            easter("Pâques", 0),
            easter("Le lundi de Pâques", 1),
            fixed("La fête du Travail", 5, 1),
            fixed("Fête de la Victoire 1945", 5, 8),
            easter("L'Ascension", 39),
            easter("Pentecôte", 49),
            easter("Le lundi de Pentecôte", 50),
            nth("Fête des Mères", 5, 0, -1, after = 49),
            nth("Fête des Pères", 6, 0, 3),
            fixed("La fête nationale", 7, 14),
            fixed("L'Assomption", 8, 15),
            nth("Heure d'hiver", 10, 0, -1),
            fixed("La Toussaint", 11, 1),
            fixed("L'Armistice", 11, 11),
            fixed("La veille de Noël", 12, 24),
            fixed("Noël", 12, 25),
            fixed("la Saint-Sylvestre", 12, 31),
        )
    ),
)

/** Les valeurs JSON sont immuables : le clone du TypeScript (qui évitait de
 *  partager des objets mutables) n'a plus rien à protéger, la constante suffit. */
fun cloneFranceHolidaySource(): JsonObject = FRANCE_HOLIDAY_SOURCE

private fun jsonObject(vararg entries: Pair<String, JsonElement>) = JsonObject(mapOf(*entries))

private fun fixed(name: String, month: Int, day: Int) = jsonObject(
    "n" to JsonPrimitive(name), "k" to JsonPrimitive("f"),
    "m" to JsonPrimitive(month.toLong()), "d" to JsonPrimitive(day.toLong()),
)

private fun easter(name: String, offset: Int) = jsonObject(
    "n" to JsonPrimitive(name), "k" to JsonPrimitive("e"), "o" to JsonPrimitive(offset.toLong()),
)

private fun nth(name: String, month: Int, weekday: Int, ordinal: Int, after: Int? = null): JsonObject {
    val fields = linkedMapOf<String, JsonElement>(
        "n" to JsonPrimitive(name), "k" to JsonPrimitive("n"),
        "m" to JsonPrimitive(month.toLong()), "w" to JsonPrimitive(weekday.toLong()), "i" to JsonPrimitive(ordinal.toLong()),
    )
    if (after != null) fields["a"] = JsonPrimitive(after.toLong())
    return JsonObject(fields)
}

/** Une chaîne non vide une fois rognée, rognée ; sinon null. */
internal fun stringValue(value: JsonElement?): String? {
    if (value !is JsonPrimitive || !value.isString) return null
    return value.content.jsTrim().ifEmpty { null }
}

private val FORBIDDEN_FOLDER_CHARS = Regex("[<>:\"/\\\\|?*\\u0000-\\u001f]")
private val TRAILING_DOT_OR_SPACE = Regex("[. ]\\z")
private val RESERVED_WINDOWS_NAME = Regex("^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|\\z)", RegexOption.IGNORE_CASE)

/** Un nom de dossier enfant direct, sûr sur tous les systèmes : les règles que
 *  le TypeScript écrit deux fois (calendarPath, calendarDirectory). */
internal fun safeFolderName(value: JsonElement?): String? {
    val name = stringValue(value) ?: return null
    if (name == "." || name == "..") return null
    if (FORBIDDEN_FOLDER_CHARS.containsMatchIn(name)) return null
    if (TRAILING_DOT_OR_SPACE.containsMatchIn(name)) return null
    if (RESERVED_WINDOWS_NAME.containsMatchIn(name)) return null
    return name
}

private fun normalizeIcalUrl(value: String): String {
    val trimmed = value.jsTrim()
    return if (trimmed.startsWith("webcal://")) "https://" + trimmed.removePrefix("webcal://") else trimmed
}

private val HTTP_URL = Regex("^https?://", RegexOption.IGNORE_CASE)

/** Le hash 31 de JavaScript : Int qui déborde comme `| 0`. */
private fun hashString(value: String): Int {
    var hash = 0
    for (c in value) hash = hash * 31 + c.code
    return hash
}

private fun externalCalendarId(source: JsonObject): String {
    val id = (source.getValue("id") as JsonPrimitive).content
    return if ((source.getValue("type") as JsonPrimitive).content == "auto") "auto::$id" else "ical::$id"
}

fun parseExternalCalendarSources(value: JsonElement?): JsonArray {
    if (value !is JsonArray) return JsonArray(emptyList())
    val result = mutableListOf<JsonObject>()
    val ids = HashSet<String>()

    for (item in value) {
        if (item !is JsonObject) continue
        val type = (item["type"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val color = stringValue(item["color"]) ?: "#89b4fa"

        if (type == "ical") {
            val url = stringValue(item["url"]) ?: continue
            val normalizedUrl = normalizeIcalUrl(url)
            if (!HTTP_URL.containsMatchIn(normalizedUrl)) continue
            val fields = LinkedHashMap<String, JsonElement>()
            fields["type"] = JsonPrimitive("ical")
            fields["id"] = JsonPrimitive(
                stringValue(item["id"]) ?: "ical-" + java.lang.Long.toString(Math.abs(hashString(normalizedUrl).toLong()), 36)
            )
            fields["name"] = JsonPrimitive(stringValue(item["name"]) ?: url)
            fields["url"] = JsonPrimitive(url)
            fields["color"] = JsonPrimitive(color)
            safeFolderName(item["directory"])?.let { fields["directory"] = JsonPrimitive(it) }
            val parsed = JsonObject(fields)
            if (ids.add(externalCalendarId(parsed))) result.add(parsed)
            continue
        }

        if (type == "auto") {
            val id = stringValue(item["id"])
            val name = stringValue(item["name"])
            val rawRules = item["rules"]
            if (id == null || name == null || rawRules !is JsonArray) continue
            val rules = rawRules.mapNotNull(::parseHolidayRule)
            if (rules.isEmpty()) continue
            val fields = LinkedHashMap<String, JsonElement>()
            fields["type"] = JsonPrimitive("auto")
            fields["id"] = JsonPrimitive(id)
            stringValue(item["country"])?.let { fields["country"] = JsonPrimitive(it) }
            fields["name"] = JsonPrimitive(name)
            fields["icon"] = JsonPrimitive(stringValue(item["icon"]) ?: "flag")
            fields["color"] = JsonPrimitive(color)
            fields["rules"] = JsonArray(rules)
            val parsed = JsonObject(fields)
            if (ids.add(externalCalendarId(parsed))) result.add(parsed)
        }
    }
    return JsonArray(result)
}

// --- holidayRuleSchema (zod) : les clés inconnues sont retirées, une règle
// --- invalide est écartée en entier.

private val ISO_DATE = Regex("^\\d{4}-\\d{2}-\\d{2}\\z")

/** z.string() : une chaîne, telle quelle (zod ne rogne pas). */
private fun rawString(value: JsonElement?): String? =
    if (value is JsonPrimitive && value.isString) value.content else null

/** z.number().int().min().max() : un nombre JSON entier (2.0 vaut 2 en JS) dans les bornes. */
private fun boundedInt(value: JsonElement?, min: Long? = null, max: Long? = null): Long? {
    if (value !is JsonPrimitive || value is JsonNull || value.isString) return null
    val number = value.content.toDoubleOrNull() ?: return null
    if (number.isNaN() || number.isInfinite() || number != Math.floor(number)) return null
    val integer = number.toLong()
    if (min != null && integer < min) return null
    if (max != null && integer > max) return null
    return integer
}

private fun parseHolidayRule(raw: JsonElement): JsonObject? {
    if (raw !is JsonObject) return null
    val kind = rawString(raw["k"]) ?: return null
    val name = rawString(raw["n"])
    fun int(key: String, min: Long? = null, max: Long? = null) = boundedInt(raw[key], min, max)
    // z.optional() : absent passe, mais null ou un mauvais type échoue.
    fun optionalInt(key: String, out: MutableMap<String, JsonElement>): Boolean {
        if (!raw.containsKey(key)) return true
        val parsed = int(key) ?: return false
        out[key] = JsonPrimitive(parsed)
        return true
    }

    val out = LinkedHashMap<String, JsonElement>()
    fun put(key: String, value: Long?): Boolean {
        if (value == null) return false
        out[key] = JsonPrimitive(value)
        return true
    }

    if (name == null) return null
    out["n"] = JsonPrimitive(name)
    out["k"] = JsonPrimitive(kind)
    val valid = when (kind) {
        "f" -> put("m", int("m", 1, 12)) && put("d", int("d", 1, 31))
        "e" -> put("o", int("o"))
        "n" -> put("m", int("m", 1, 12)) && put("w", int("w", 0, 6)) && put("i", int("i", -1, 5)) && optionalInt("a", out)
        "x" -> {
            val dates = raw["d"] as? JsonArray
            val strings = dates?.map { rawString(it) }
            if (strings == null || strings.any { it == null || !ISO_DATE.containsMatchIn(it) }) {
                false
            } else {
                out["d"] = JsonArray(strings.map { JsonPrimitive(it) })
                true
            }
        }
        "h" -> put("hm", int("hm", 1, 12)) && put("hd", int("hd", 1, 30)) && optionalInt("ln", out)
        "hm" -> put("hd", int("hd", 1, 30)) && optionalInt("ln", out)
        "w" -> put("w", int("w", 0, 6))
        else -> false
    }
    return if (valid) JsonObject(out) else null
}
