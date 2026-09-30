package com.ahmed.neocalendar.core.location

import java.net.URLEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de src/ui/calendar/locationLink.ts (locationDestinationFor, mapsAppsFor,
 * mapsUrlFor, geoUrlFor) : où mène le lieu d'un évènement, et par quelle
 * application de cartes on l'ouvre. Les quatre rangs de la destination et les
 * adresses de chaque application sont celles du TypeScript, à la lettre.
 */

/** Comment on compte s'y rendre ; « auto » est l'absence du paramètre. */
val MAPS_TRAVEL_MODES = listOf("auto", "transit", "driving", "walking", "bicycling")

/** Les applications qu'on sait viser, dans l'ordre du menu. */
val MAPS_APPS = listOf("google", "citymapper", "moovit", "waze")

private val WEB_MAPS_APPS = listOf("google", "citymapper", "waze")

private val COORDINATES = Regex("""^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$""")
private val HTTP_LINK = Regex("""^https?://\S+$""", RegexOption.IGNORE_CASE)
private val SPACES = Regex("""\s+""")

sealed interface LocationDestination {
    val value: String
    val label: String?

    data class Link(override val value: String, override val label: String? = null) : LocationDestination
    data class Point(override val value: String, override val label: String? = null) : LocationDestination
    data class Address(override val value: String, val point: String? = null, override val label: String? = null) : LocationDestination
    data class Search(override val value: String, override val label: String? = null) : LocationDestination
}

/** `encodeURIComponent` : tout sauf A-Z a-z 0-9 - _ . ! ~ * ' ( ). */
internal fun encodeUriComponent(value: String): String {
    val out = StringBuilder()
    for (byte in value.toByteArray(Charsets.UTF_8)) {
        val c = byte.toInt() and 0xff
        val ch = c.toChar()
        if (c < 128 && (ch.isLetterOrDigit() || ch in "-_.!~*'()")) out.append(ch)
        else out.append('%').append("%02X".format(c))
    }
    return out.toString()
}

private fun asPoint(value: String) = value.replace(SPACES, "")

/** Les quatre rangs : un lien, l'adresse réglée sur le lien ICS, les coordonnées du flux, puis le texte du lieu. */
fun locationDestinationFor(location: String, geo: String? = null, linkAddress: String? = null): LocationDestination? {
    val place = location.trim()
    if (HTTP_LINK.matches(place)) return LocationDestination.Link(place)

    val published = (geo ?: "").trim()
    val point = if (COORDINATES.matches(published)) asPoint(published) else null
    // Une paire de coordonnées écrite dans « lieu » se nommerait elle-même.
    val label = if (place.isNotEmpty() && !COORDINATES.matches(place)) place else null

    val address = (linkAddress ?: "").trim()
    if (address.isNotEmpty()) {
        if (COORDINATES.matches(address)) return LocationDestination.Point(asPoint(address), label)
        return LocationDestination.Address(address, point, label)
    }
    if (point != null) return LocationDestination.Point(point, label)
    return if (place.isNotEmpty()) LocationDestination.Search(place) else null
}

private fun pointOf(d: LocationDestination): String? = when (d) {
    is LocationDestination.Point -> d.value
    is LocationDestination.Address -> d.point
    else -> null
}

private fun addressOf(d: LocationDestination): String? = (d as? LocationDestination.Address)?.value

private fun mapsSearch(query: String) = "https://www.google.com/maps/search/?api=1&query=${encodeUriComponent(query)}"

private fun mapsDirections(destination: String, travelMode: String) =
    "https://www.google.com/maps/dir/?api=1&destination=${encodeUriComponent(destination)}" +
        if (travelMode == "auto") "" else "&travelmode=$travelMode"

private fun named(parameter: String, value: String?) = if (!value.isNullOrEmpty()) "&$parameter=${encodeUriComponent(value)}" else ""

/**
 * Les applications à proposer, dans l'ordre du menu. Un lien n'en a aucune ;
 * une destination sans point n'a que Google Maps. `installed` null : rien n'est filtré.
 */
fun mapsAppsFor(destination: LocationDestination, native: Boolean = false, installed: List<String>? = null): List<String> {
    if (destination is LocationDestination.Link) return emptyList()
    val candidates = if (pointOf(destination) != null) MAPS_APPS else listOf("google")
    return candidates.filter { app ->
        if (!native && app !in WEB_MAPS_APPS) return@filter false
        installed == null || app in installed
    }
}

/** L'adresse à ouvrir pour cette destination dans cette application ; null si elle n'en ferait rien. */
fun mapsUrlFor(destination: LocationDestination, app: String, travelMode: String = "auto", native: Boolean = false): String? {
    if (destination is LocationDestination.Link) return destination.value

    if (app == "google") {
        return if (destination is LocationDestination.Search) mapsSearch(destination.value)
        else mapsDirections(destination.value, travelMode)
    }

    val coordinates = pointOf(destination) ?: return null
    val address = addressOf(destination)
    val point = encodeUriComponent(coordinates)

    if (app == "citymapper") {
        val base = if (native) "citymapper://directions" else "https://citymapper.com/directions"
        return "$base?endcoord=$point${named("endaddress", address)}${named("endname", destination.label)}"
    }
    if (app == "moovit") {
        val (latitude, longitude) = coordinates.split(",")
        return "moovit://directions?dest_lat=$latitude&dest_lon=$longitude${named("dest_name", destination.label ?: address)}"
    }
    return "https://waze.com/ul?ll=$point&navigate=yes"
}

/** Le lien que toutes les cartes comprennent : un point et son nom (`geo:`). Null sans point. */
fun geoUrlFor(destination: LocationDestination): String? {
    val point = pointOf(destination) ?: return null
    val address = addressOf(destination)
    return "geo:$point?q=${if (address != null) encodeUriComponent(address) else point}"
}

// ── JSON du corpus ────────────────────────────────────────────────────────────

fun LocationDestination.toJson(): JsonObject {
    val map = LinkedHashMap<String, JsonPrimitive>()
    when (this) {
        is LocationDestination.Link -> { map["kind"] = JsonPrimitive("link"); map["value"] = JsonPrimitive(value) }
        is LocationDestination.Point -> { map["kind"] = JsonPrimitive("point"); map["value"] = JsonPrimitive(value) }
        is LocationDestination.Address -> {
            map["kind"] = JsonPrimitive("address"); map["value"] = JsonPrimitive(value)
            point?.let { map["point"] = JsonPrimitive(it) }
        }
        is LocationDestination.Search -> { map["kind"] = JsonPrimitive("search"); map["value"] = JsonPrimitive(value) }
    }
    label?.let { map["label"] = JsonPrimitive(it) }
    return JsonObject(map)
}

fun locationDestinationOf(json: JsonObject): LocationDestination {
    fun text(key: String) = (json[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
    val label = text("label")
    val value = text("value").orEmpty()
    return when (text("kind")) {
        "link" -> LocationDestination.Link(value, label)
        "point" -> LocationDestination.Point(value, label)
        "address" -> LocationDestination.Address(value, text("point"), label)
        else -> LocationDestination.Search(value, label)
    }
}
