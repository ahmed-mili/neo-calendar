package com.ahmed.neocalendar.core.preferences

import com.ahmed.neocalendar.core.notes.jsTrim
import java.net.IDN
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/*
 * Port de icsFeedPreferences.ts : les liens ICS d'un calendrier, tels que le
 * fichier de préférences les porte. Les liens restent des JsonObject, avec les
 * noms de champs du TypeScript ; un champ optionnel absent est absent.
 */

/** Les fréquences de rafraîchissement proposées, en minutes. */
val ICS_REFRESH_MINUTES: List<Int> = listOf(5, 15, 30, 60, 180, 360)

const val MAX_ICS_FEEDS_PER_CALENDAR = 5

/** Un nombre JSON qui est l'une des fréquences (15.0 vaut 15 en JS). */
internal fun refreshMinutes(value: JsonElement?): Int? {
    if (value !is JsonPrimitive || value is JsonNull || value.isString) return null
    val number = value.content.toDoubleOrNull() ?: return null
    return ICS_REFRESH_MINUTES.firstOrNull { it.toDouble() == number }
}

/** Deux segments : le dossier propre d'un lien, sous celui de son calendrier.
 *  Les règles de safeFolderName sur chaque segment, joints par « / » (le format
 *  que `safe_join` attend côté Rust). */
private fun icsDirectory(value: JsonElement?): String? {
    val path = stringValue(value) ?: return null
    val segments = path.split("/")
    if (segments.size != 2) return null
    val calendar = safeFolderName(JsonPrimitive(segments[0]))
    val link = safeFolderName(JsonPrimitive(segments[1]))
    return if (calendar != null && link != null) "$calendar/$link" else null
}

// --- normalizeIcsUrl : `new URL(candidate).toString()` pour http et https.
// Le TypeScript délègue à l'analyseur d'URL du WHATWG ; ici seul ce qu'un lien
// d'agenda peut contenir est reproduit (hôte en minuscules, port par défaut
// retiré, chemin « / », segments point, encodage en pourcentage). Non portés :
// les adresses IPv4 abrégées (« 127.1 ») et la validation fine de l'IDN.

private val SCHEME = Regex("^(https?):", RegexOption.IGNORE_CASE)
private const val HEX = "0123456789ABCDEF"

private fun StringBuilder.appendPercent(byte: Int) {
    append('%').append(HEX[byte shr 4]).append(HEX[byte and 15])
}

/** Encode en UTF-8 les caractères non ASCII et ceux de l'ensemble donné. */
private fun percentEncode(text: String, encodeSet: String): String {
    val out = StringBuilder()
    var index = 0
    while (index < text.length) {
        val codePoint = text.codePointAt(index)
        val width = Character.charCount(codePoint)
        val c = text[index]
        if (codePoint < 0x80 && c.code in 0x20..0x7E && c !in encodeSet) {
            out.append(c)
        } else {
            for (b in text.substring(index, index + width).toByteArray(Charsets.UTF_8)) out.appendPercent(b.toInt() and 0xFF)
        }
        index += width
    }
    return out.toString()
}

// Ensembles d'encodage de la spécification, hors contrôles C0, DEL et non ASCII
// (toujours encodés).
private const val FRAGMENT_SET = " \"<>`"
private const val QUERY_SET = " \"#<>'"
private const val PATH_SET = " \"#<>?`{}^"
private const val USERINFO_SET = " \"#<>?`{}/:;=@[\\]^|"

private fun percentDecode(text: String): String {
    val bytes = java.io.ByteArrayOutputStream()
    var index = 0
    val source = text.toByteArray(Charsets.UTF_8)
    while (index < source.size) {
        val b = source[index].toInt() and 0xFF
        val hi = if (b == '%'.code && index + 2 < source.size) Character.digit((source[index + 1].toInt() and 0xFF).toChar(), 16) else -1
        val lo = if (hi >= 0) Character.digit((source[index + 2].toInt() and 0xFF).toChar(), 16) else -1
        if (hi >= 0 && lo >= 0) {
            bytes.write(hi * 16 + lo)
            index += 3
        } else {
            bytes.write(b)
            index += 1
        }
    }
    return String(bytes.toByteArray(), Charsets.UTF_8)
}

private const val FORBIDDEN_HOST = " #/:<>?@[\\]^|%"

/** L'hôte sérialisé, ou null quand l'analyseur d'URL le refuse. */
private fun parseHost(raw: String): String? {
    if (raw.startsWith("[")) return if (raw.endsWith("]")) raw.lowercase() else null
    val decoded = percentDecode(raw)
    val ascii = if (decoded.all { it.code < 0x80 }) decoded.lowercase() else try {
        IDN.toASCII(decoded.lowercase(), IDN.ALLOW_UNASSIGNED)
    } catch (_: IllegalArgumentException) {
        return null
    }
    if (ascii.isEmpty()) return null
    if (ascii.any { it.code <= 0x1F || it.code == 0x7F || it in FORBIDDEN_HOST }) return null
    return ascii
}

private fun isDotSegment(segment: String) = segment.lowercase() in setOf(".", "%2e")
private fun isDoubleDotSegment(segment: String) =
    segment.lowercase() in setOf("..", ".%2e", "%2e.", "%2e%2e")

private fun serializePath(rawPath: String): String {
    val stack = ArrayList<String>()
    val segments = rawPath.replace('\\', '/').split("/").drop(1)
    for ((position, segment) in segments.withIndex()) {
        val last = position == segments.lastIndex
        when {
            isDoubleDotSegment(segment) -> {
                if (stack.isNotEmpty()) stack.removeAt(stack.lastIndex)
                if (last) stack.add("")
            }
            isDotSegment(segment) -> if (last) stack.add("")
            else -> stack.add(percentEncode(segment, PATH_SET))
        }
    }
    return "/" + stack.joinToString("/")
}

fun normalizeIcsUrl(value: String): String {
    val trimmed = value.jsTrim()
    val candidate = if (trimmed.startsWith("webcal://", ignoreCase = true)) "https://" + trimmed.substring("webcal://".length) else trimmed
    return parseHttpUrl(candidate) ?: ""
}

private fun parseHttpUrl(input: String): String? {
    // L'analyseur retire les tabulations et sauts de ligne, où qu'ils soient.
    val text = input.filter { it != '\t' && it != '\n' && it != '\r' }
    val scheme = SCHEME.find(text)?.groupValues?.get(1)?.lowercase() ?: return null
    var rest = text.substring(scheme.length + 1)

    // Fragment, puis requête ; les schémas spéciaux tolèrent « / » et « \ » en tête.
    var fragment: String? = null
    rest.indexOf('#').let { if (it >= 0) { fragment = rest.substring(it + 1); rest = rest.substring(0, it) } }
    var query: String? = null
    rest.indexOf('?').let { if (it >= 0) { query = rest.substring(it + 1); rest = rest.substring(0, it) } }
    rest = rest.trimStart('/', '\\')

    val authorityEnd = rest.indexOfFirst { it == '/' || it == '\\' }.let { if (it < 0) rest.length else it }
    val authority = rest.substring(0, authorityEnd)
    val path = rest.substring(authorityEnd)

    val at = authority.lastIndexOf('@')
    val userInfo = if (at >= 0) authority.substring(0, at) else ""
    val hostPort = authority.substring(at + 1)

    val portStart = if (hostPort.startsWith("[")) hostPort.indexOf(']').let { if (it < 0) -1 else hostPort.indexOf(':', it) } else hostPort.lastIndexOf(':')
    val hostText = if (portStart >= 0) hostPort.substring(0, portStart) else hostPort
    val portText = if (portStart >= 0) hostPort.substring(portStart + 1) else ""
    val host = parseHost(hostText) ?: return null

    var port: Int? = null
    if (portText.isNotEmpty()) {
        if (!portText.all { it in '0'..'9' }) return null
        port = portText.toBigInteger().let { if (it > 65535.toBigInteger()) return null else it.toInt() }
        if (port == (if (scheme == "https") 443 else 80)) port = null
    }

    val out = StringBuilder(scheme).append("://")
    val colon = userInfo.indexOf(':')
    val username = percentEncode(if (colon >= 0) userInfo.substring(0, colon) else userInfo, USERINFO_SET)
    val password = if (colon >= 0) percentEncode(userInfo.substring(colon + 1), USERINFO_SET) else ""
    if (username.isNotEmpty() || password.isNotEmpty()) {
        out.append(username)
        if (password.isNotEmpty()) out.append(':').append(password)
        out.append('@')
    }
    out.append(host)
    if (port != null) out.append(':').append(port)
    out.append(serializePath(path.ifEmpty { "/" }))
    query?.let { out.append('?').append(percentEncode(it, QUERY_SET)) }
    fragment?.let { out.append('#').append(percentEncode(it, FRAGMENT_SET)) }
    return out.toString()
}

fun parseIcsFeeds(value: JsonElement?): JsonArray {
    if (value !is JsonArray) return JsonArray(emptyList())

    val feeds = mutableListOf<JsonObject>()
    val ids = HashSet<String>()
    val urlsByCalendar = HashMap<String, MutableSet<String>>()
    val countsByCalendar = HashMap<String, Int>()

    for (item in value) {
        if (item !is JsonObject) continue
        val id = stringValue(item["id"])
        val path = safeFolderName(item["calendarPath"])
        val name = stringValue(item["name"])
        val rawUrl = stringValue(item["url"])
        if (id == null || id in ids || path == null || name == null || rawUrl == null) continue

        val url = normalizeIcsUrl(rawUrl)
        // Une fréquence absente est permise ; présente, elle doit être l'une des
        // fréquences proposées (null compte comme présente).
        val refresh = refreshMinutes(item["refreshMinutes"])
        if (url.isEmpty() || (refresh == null && item.containsKey("refreshMinutes"))) continue

        val urls = urlsByCalendar.getOrPut(path) { HashSet() }
        val count = countsByCalendar[path] ?: 0
        if (url in urls || count >= MAX_ICS_FEEDS_PER_CALENDAR) continue

        urls.add(url)
        countsByCalendar[path] = count + 1
        ids.add(id)
        val fields = LinkedHashMap<String, JsonElement>()
        fields["id"] = JsonPrimitive(id)
        fields["calendarPath"] = JsonPrimitive(path)
        fields["name"] = JsonPrimitive(name)
        fields["url"] = JsonPrimitive(url)
        refresh?.let { fields["refreshMinutes"] = JsonPrimitive(it.toLong()) }
        val active = item["active"]
        val isBoolean = active is JsonPrimitive && !active.isString && active.booleanOrNull != null
        fields["active"] = if (isBoolean) active!! else JsonPrimitive(true)
        icsDirectory(item["directory"])?.let { fields["directory"] = JsonPrimitive(it) }
        stringValue(item["address"])?.let { fields["address"] = JsonPrimitive(it) }
        feeds.add(JsonObject(fields))
    }
    return JsonArray(feeds)
}

fun migrateLegacyIcalSources(value: JsonElement?): JsonObject {
    val legacyIcalSources = parseExternalCalendarSources(value).map { it as JsonObject }
        .filter { (it["type"] as JsonPrimitive).content == "ical" }
    val resolved = legacyIcalSources.filter { safeFolderName(it["directory"]) != null }
    val feeds = parseIcsFeeds(
        JsonArray(
            resolved.map {
                JsonObject(
                    mapOf(
                        "id" to it.getValue("id"),
                        "calendarPath" to it.getValue("directory"),
                        "name" to it.getValue("name"),
                        "url" to it.getValue("url"),
                    )
                )
            }
        )
    )
    return JsonObject(
        mapOf(
            "feeds" to feeds,
            "unresolved" to JsonArray(legacyIcalSources.filter { safeFolderName(it["directory"]) == null }),
        )
    )
}
