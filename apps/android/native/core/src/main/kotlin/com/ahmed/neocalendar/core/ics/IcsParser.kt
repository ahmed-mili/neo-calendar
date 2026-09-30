package com.ahmed.neocalendar.core.ics

import com.ahmed.neocalendar.core.jsNumber
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.jsTrim
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.notes.validateEvent
import java.io.StringReader
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.Temporal
import java.time.temporal.TemporalAdjusters
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import net.fortuna.ical4j.data.CalendarBuilder
import net.fortuna.ical4j.data.CalendarParserFactory
import net.fortuna.ical4j.data.ContentHandler
import net.fortuna.ical4j.model.Recur

/*
 * Port de src/calendars/parsing/ics.ts (ical.js + luxon) avec ical4j.
 *
 * ical4j fournit ce qu'il fait bien : découper les lignes et les paramètres
 * (ContentHandler, sans le modèle typé, qui refuse un ATTENDEE mal formé là où
 * ical.js l'accepte), étendre un RRULE (Recur), et lire un VTIMEZONE en règles
 * de fuseau (TimeZoneRegistry). Le reste reprend ical.js à la lettre : valeurs
 * `ICAL.Time` flottantes, UTC ou à fuseau, clés d'exception, durée, EXDATE.
 *
 * ical4j ne lit ni le réseau ni un fichier : ses fuseaux sont embarqués dans
 * son jar (zoneinfo-global) et aucune de ses classes ne référence java.net ni
 * java.io.File.
 */

/* ------------------------------------------------------------------------- *
 * Modèle brut : composants, propriétés, paramètres
 * ------------------------------------------------------------------------- */

private class Prop(val name: String, val params: Map<String, String>, val value: String)

private class Comp(val name: String) {
    val props = ArrayList<Prop>()
    val subs = ArrayList<Comp>()
    fun first(name: String): Prop? = props.firstOrNull { it.name == name }
    fun all(name: String): List<Prop> = props.filter { it.name == name }
    fun subs(name: String): List<Comp> = subs.filter { it.name == name }
}

private fun unquote(value: String): String =
    if (value.length >= 2 && value.first() == '"' && value.last() == '"') value.substring(1, value.length - 1) else value

/** Les lignes pliées (saut de ligne puis espace ou tabulation) se rejoignent
 *  avant ical4j, dont le dépliage ne connaît que CRLF. */
private fun parseCalendar(text: String): Comp {
    val unfolded = text.replace(Regex("\r?\n[ \t]"), "")
    val stack = ArrayDeque<Comp>()
    var root: Comp? = null
    val handler = object : ContentHandler {
        var name = ""
        var params = LinkedHashMap<String, String>()
        var value = ""
        override fun startCalendar() { stack.addLast(Comp("vcalendar")) }
        override fun endCalendar() {
            val done = stack.removeLast()
            if (root == null) root = done
        }
        override fun startComponent(name: String) { stack.addLast(Comp(name.lowercase())) }
        override fun endComponent(name: String) {
            val done = stack.removeLast()
            stack.last().subs.add(done)
        }
        override fun startProperty(name: String) {
            this.name = name.lowercase()
            params = LinkedHashMap()
            value = ""
        }
        override fun parameter(name: String, value: String) { params.putIfAbsent(name.lowercase(), unquote(value)) }
        override fun propertyValue(value: String) { this.value = value }
        override fun endProperty(name: String) { stack.last().props.add(Prop(this.name, params, value)) }
    }
    CalendarParserFactory.getInstance().get().parse(StringReader(unfolded), handler)
    return root ?: Comp("vcalendar")
}

/** Une valeur de type texte : `\\`, `\;`, `\,`, `\n` et `\N`, en un seul passage. */
private fun unescapeText(value: String): String {
    if (value.indexOf('\\') == -1) return value
    val out = StringBuilder()
    var i = 0
    while (i < value.length) {
        val c = value[i]
        if (c == '\\' && i + 1 < value.length) {
            when (value[i + 1]) {
                '\\' -> { out.append('\\'); i += 2; continue }
                ';' -> { out.append(';'); i += 2; continue }
                ',' -> { out.append(','); i += 2; continue }
                'n', 'N' -> { out.append('\n'); i += 2; continue }
            }
        }
        out.append(c)
        i++
    }
    return out.toString()
}

private fun Comp.text(name: String): String? = first(name)?.let { unescapeText(it.value) }

private fun Comp.tzid(name: String): String? = first(name)?.params?.get("tzid")

/* ------------------------------------------------------------------------- *
 * Temps : l'équivalent de ICAL.Time
 * ------------------------------------------------------------------------- */

/** `zone` null = flottant (et toute date), sinon un fuseau résolu ; `utc` marque
 *  le fuseau UTC d'ical.js (suffixe `Z` ou TZID UTC/GMT). */
private class IcsTime(val wall: LocalDateTime, val isDate: Boolean, val zone: ZoneId?, val utc: Boolean) {
    /** `toUnixTime` : un flottant se lit comme de l'UTC. */
    fun unix(): Long = if (zone != null) wall.atZone(zone).toEpochSecond() else wall.toEpochSecond(ZoneOffset.UTC)

    /** `toJSDate` : un flottant et une date se lisent dans le fuseau de l'appareil. */
    fun instant(): Instant = wall.atZone(zone ?: ZoneId.systemDefault()).toInstant()

    /** `addDuration` : de l'arithmétique sur l'horloge murale, une date retombe à minuit. */
    fun plusSeconds(seconds: Long): IcsTime {
        val moved = wall.plusSeconds(seconds)
        return IcsTime(if (isDate) moved.toLocalDate().atStartOfDay() else moved, isDate, zone, utc)
    }

    private fun wallKey(w: LocalDateTime, isDate: Boolean, suffix: String): String {
        val date = "%d-%02d-%02d".format(w.year, w.monthValue, w.dayOfMonth)
        return if (isDate) date else "%sT%02d:%02d:%02d%s".format(date, w.hour, w.minute, w.second, suffix)
    }

    /** `toString` d'ICAL.Time : `Z` seulement pour le fuseau UTC. */
    fun key(): String = wallKey(wall, isDate, if (utc) "Z" else "")

    /** `convertToZone(UTC).toString()` : un flottant garde son horloge, le reste passe en UTC. */
    fun utcKey(): String = when {
        isDate -> key()
        zone == null || utc -> wallKey(wall, false, "Z")
        else -> wallKey(wall.atZone(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime(), false, "Z")
    }

    fun dateOnly(): String = "%04d-%02d-%02d".format(wall.year, wall.monthValue, wall.dayOfMonth)
}

private val UTC_NAMES = setOf("Z", "UTC", "GMT")

private fun parseTime(value: String, tzid: String?, zones: Map<String, ZoneId>): IcsTime {
    val year = value.substring(0, 4).toInt()
    val month = value.substring(4, 6).toInt()
    val day = value.substring(6, 8).toInt()
    if (value.length <= 10) return IcsTime(LocalDate.of(year, month, day).atStartOfDay(), true, null, false)
    val wall = LocalDateTime.of(
        year, month, day,
        value.substring(9, 11).toInt(), value.substring(11, 13).toInt(), value.substring(13, 15).toInt(),
    )
    val zulu = value.length > 15 && value[15] == 'Z'
    val name = if (zulu) "Z" else tzid
    return when {
        name == null -> IcsTime(wall, false, null, false)
        name in UTC_NAMES -> IcsTime(wall, false, ZoneOffset.UTC, true)
        else -> IcsTime(wall, false, zones[name], false)
    }
}

private fun Comp.time(name: String, zones: Map<String, ZoneId>): IcsTime? =
    first(name)?.let { parseTime(it.value, it.params["tzid"], zones) }

/** Les valeurs d'un EXDATE ou RDATE : plusieurs par propriété, séparées par une virgule. */
private fun Comp.times(name: String, zones: Map<String, ZoneId>): List<IcsTime> =
    all(name).flatMap { prop ->
        prop.value.split(',').filter { it.isNotEmpty() && '/' !in it }.map { parseTime(it, prop.params["tzid"], zones) }
    }

private val DURATION = Regex("^([+-])?P(?:(\\d+)W)?(?:(\\d+)D)?(?:T(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?)?$")

private fun parseDurationSeconds(value: String): Long {
    val m = DURATION.matchEntire(value) ?: throw IllegalArgumentException("DURATION invalide : $value")
    fun part(i: Int) = m.groupValues[i].ifEmpty { "0" }.toLong()
    val seconds = part(2) * 604800 + part(3) * 86400 + part(4) * 3600 + part(5) * 60 + part(6)
    return if (m.groupValues[1] == "-") -seconds else seconds
}

/* ------------------------------------------------------------------------- *
 * Fuseaux : les VTIMEZONE du flux, lus par ical4j
 * ------------------------------------------------------------------------- */

private fun serialize(comp: Comp, out: StringBuilder) {
    out.append("BEGIN:").append(comp.name.uppercase()).append("\r\n")
    for (prop in comp.props) {
        out.append(prop.name.uppercase())
        for ((name, value) in prop.params) {
            val quoted = if (value.any { it == ':' || it == ';' || it == ',' }) "\"$value\"" else value
            out.append(';').append(name.uppercase()).append('=').append(quoted)
        }
        out.append(':').append(prop.value).append("\r\n")
    }
    comp.subs.forEach { serialize(it, out) }
    out.append("END:").append(comp.name.uppercase()).append("\r\n")
}

/** Un TZID n'est qu'un nom : ses décalages vivent dans le VTIMEZONE du flux. Le
 *  premier VTIMEZONE d'un nom l'emporte (`registerTimezones`), et un nom que lit
 *  déjà ical.js (Z, UTC, GMT) n'est pas redéfini. Un VTIMEZONE que ical4j refuse
 *  est ignoré : son TZID retombe alors sur le fuseau IANA, comme sans VTIMEZONE. */
private fun registeredZones(calendar: Comp): Map<String, ZoneId> {
    val zones = LinkedHashMap<String, ZoneId>()
    val seen = HashSet<String>()
    for (vtimezone in calendar.subs("vtimezone")) {
        val tzid = vtimezone.text("tzid")?.takeIf { it.isNotEmpty() } ?: continue
        if (tzid in UTC_NAMES || !seen.add(tzid)) continue
        try {
            val text = StringBuilder("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Neo Calendar//ICS//EN\r\n")
            serialize(vtimezone, text)
            text.append("END:VCALENDAR\r\n")
            val builder = CalendarBuilder()
            builder.build(StringReader(text.toString()))
            zones[tzid] = builder.registry.getZoneId(tzid)
        } catch (_: Exception) {
            // Ignoré : voir ci-dessus.
        }
    }
    return zones
}

/** Un nom IANA que luxon sait résoudre (insensible à la casse, comme Intl). */
private fun ianaZone(tzid: String): ZoneId? {
    try {
        return ZoneId.of(tzid)
    } catch (_: Exception) {
        // Essai insensible à la casse ci-dessous.
    }
    val match = ZoneId.getAvailableZoneIds().firstOrNull { it.equals(tzid, ignoreCase = true) } ?: return null
    return ZoneId.of(match)
}

/** `localDateTime` du TypeScript : un fuseau résolu fait foi ; sinon un TZID IANA
 *  nu ; sinon un flottant, qui veut dire l'horloge du lecteur. */
private fun localDateTime(time: IcsTime, tzid: String?): ZonedDateTime {
    val local = ZoneId.systemDefault()
    if (time.zone != null) return time.wall.atZone(time.zone).withZoneSameInstant(local)
    if (tzid != null) {
        val zone = ianaZone(tzid)
        if (zone != null) return time.wall.atZone(zone).withZoneSameInstant(local)
    }
    return time.wall.atZone(local)
}

/* ------------------------------------------------------------------------- *
 * RRULE : normalisé comme ICAL.Recur#toString, étendu par ical4j
 * ------------------------------------------------------------------------- */

private val NUMERIC_PARTS = mapOf(
    "BYSECOND" to (0L..60L), "BYMINUTE" to (0L..59L), "BYHOUR" to (0L..23L),
    "BYMONTHDAY" to (-31L..31L), "BYYEARDAY" to (-366L..366L), "BYWEEKNO" to (-53L..53L),
    "BYMONTH" to (1L..12L), "BYSETPOS" to (-366L..366L),
)
private val FREQUENCIES = setOf("SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY")
private val DAYS = Regex("^(SU|MO|TU|WE|TH|FR|SA)$")
private val BYDAY_PART = Regex("^([+-])?(5[0-3]|[1-4][0-9]|[1-9])?(SU|MO|TU|WE|TH|FR|SA)$")
private val INTEGER = Regex("^[+-]?\\d+$")

private fun strictInt(value: String): Long {
    if (!INTEGER.matches(value)) throw IllegalArgumentException("entier invalide : $value")
    return value.removePrefix("+").toLong()
}

/** La règle telle que la réécrit ical.js : FREQ, COUNT, INTERVAL (au-dessus de 1),
 *  les parties BY* dans l'ordre d'arrivée, UNTIL, WKST (hors lundi). Les clés
 *  inconnues tombent. */
private fun normalizedRrule(value: String): String {
    var freq: String? = null
    var count = 0L
    var interval = 1L
    var until: String? = null
    var wkst = "MO"
    val parts = LinkedHashMap<String, String>()
    for (piece in value.split(';')) {
        val name = piece.substringBefore('=').uppercase()
        val raw = piece.substringAfter('=', "")
        val range = NUMERIC_PARTS[name]
        when {
            range != null -> parts[name] = raw.split(',').joinToString(",") { strictInt(it).toString() }
            name == "BYDAY" -> parts[name] = raw.split(',').joinToString(",") {
                if (!BYDAY_PART.matches(it)) throw IllegalArgumentException("BYDAY invalide : $it")
                it
            }
            name == "FREQ" -> {
                if (raw !in FREQUENCIES) throw IllegalArgumentException("FREQ invalide : $raw")
                freq = raw
            }
            name == "COUNT" -> count = strictInt(raw)
            name == "INTERVAL" -> interval = maxOf(1L, strictInt(raw))
            name == "UNTIL" -> until = if (raw.length > 10) raw.substring(0, 15) + (if (raw.length > 15 && raw[15] == 'Z') "Z" else "") else raw.substring(0, 8)
            name == "WKST" -> {
                if (!DAYS.matches(raw)) throw IllegalArgumentException("WKST invalide : $raw")
                wkst = raw
            }
        }
    }
    val out = StringBuilder("FREQ=").append(freq ?: throw IllegalArgumentException("FREQ absent"))
    if (count != 0L) out.append(";COUNT=").append(count)
    if (interval > 1) out.append(";INTERVAL=").append(interval)
    parts.forEach { (k, v) -> out.append(';').append(k).append('=').append(v) }
    if (until != null) out.append(";UNTIL=").append(until)
    if (wkst != "MO") out.append(";WKST=").append(wkst)
    return out.toString()
}

private const val MAX_STEPS = 200_000

/** Les occurrences d'une série, dans l'ordre, jusqu'à `endMs` (RDATE fusionnées,
 *  EXDATE retirées) : DTSTART compte comme première occurrence si une règle existe. */
private fun occurrencesOf(
    start: IcsTime,
    rules: List<String>,
    rdates: List<IcsTime>,
    exdates: List<IcsTime>,
    endMs: Long,
): List<IcsTime> {
    val local = ZoneId.systemDefault()
    val end = Instant.ofEpochMilli(endMs)
    val zone = start.zone
    val seed: Temporal
    val bound: Temporal
    when {
        start.isDate -> {
            seed = start.wall.toLocalDate()
            bound = end.atZone(local).toLocalDate().plusDays(2)
        }
        zone != null -> {
            seed = start.wall.atZone(zone)
            bound = end.atZone(zone).plusDays(2)
        }
        else -> {
            seed = start.wall
            bound = end.atZone(local).toLocalDateTime().plusDays(2)
        }
    }

    val fromRules = ArrayList<IcsTime>()
    for (rule in rules) {
        val dates = Recur<Temporal>(rule).getDates(seed, seed, bound, MAX_STEPS)
        for (date in dates) {
            fromRules += when (date) {
                is LocalDate -> IcsTime(date.atStartOfDay(), true, null, false)
                is ZonedDateTime -> IcsTime(date.toLocalDateTime(), false, zone, start.utc)
                else -> IcsTime((date as LocalDateTime), false, null, false)
            }
        }
    }
    val skipped = exdates.map { it.unix() }.toSet()
    return (rdates + fromRules).sortedBy { it.unix() }.filter { it.unix() !in skipped }
}

/* ------------------------------------------------------------------------- *
 * ICAL.Event
 * ------------------------------------------------------------------------- */

private class Ev(val comp: Comp, private val zones: Map<String, ZoneId>) {
    val uid: String? get() = comp.text("uid")
    val summary: String? get() = comp.text("summary")
    val start: IcsTime = comp.time("dtstart", zones)!!
    val recurrenceId: IcsTime? get() = comp.time("recurrence-id", zones)

    /** DTEND, sinon DTSTART + DURATION, sinon (une date) le lendemain, sinon DTSTART. */
    val end: IcsTime by lazy {
        comp.time("dtend", zones) ?: run {
            val duration = comp.first("duration")
            when {
                duration != null -> start.plusSeconds(parseDurationSeconds(duration.value))
                start.isDate -> start.plusSeconds(86400)
                else -> start
            }
        }
    }

    /** En secondes ; DURATION, sinon l'écart exact de DTEND à DTSTART. */
    val durationSeconds: Long by lazy {
        comp.first("duration")?.let { parseDurationSeconds(it.value) } ?: (end.unix() - start.unix())
    }
}

private fun Comp.isCancelled(): Boolean = text("status")?.uppercase() == "CANCELLED"

/* ------------------------------------------------------------------------- *
 * Évènement brut -> NeoEvent
 * ------------------------------------------------------------------------- */

private val HOUR_MINUTE = DateTimeFormatter.ofPattern("HH:mm")
private val DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd")

private fun eventId(uid: String?, startDate: String, kind: String): String = "ics::${uid ?: "null"}::$startDate::$kind"

private fun stringArray(values: List<String>): JsonArray = JsonArray(values.map { JsonPrimitive(it) })

/** `eventFromVEvent` : un VEVENT, sans déplier ses occurrences. */
private fun eventFromVEvent(vevent: Comp, zones: Map<String, ZoneId>): NeoEvent? {
    val ev = Ev(vevent, zones)
    val start = ev.start
    val raw = LinkedHashMap<String, JsonElement>()
    raw["title"] = ev.summary?.let { JsonPrimitive(it) } ?: JsonNull

    val startDate: String
    if (start.isDate) {
        raw["allDay"] = JsonPrimitive(true)
        startDate = start.dateOnly()
    } else {
        val from = localDateTime(start, vevent.tzid("dtstart"))
        val to = localDateTime(ev.end, vevent.tzid("dtend"))
        raw["allDay"] = JsonPrimitive(false)
        raw["startTime"] = JsonPrimitive(from.format(HOUR_MINUTE))
        raw["endTime"] = JsonPrimitive(to.format(HOUR_MINUTE))
        startDate = from.format(DATE_FORMAT)
    }

    val rrule = vevent.first("rrule")
    if (rrule != null) {
        raw["id"] = JsonPrimitive(eventId(ev.uid, startDate, "recurring"))
        raw["type"] = JsonPrimitive("rrule")
        raw["startDate"] = JsonPrimitive(startDate)
        raw["rrule"] = JsonPrimitive("RRULE:" + normalizedRrule(rrule.value))
        raw["skipDates"] = stringArray(vevent.times("exdate", zones).map { it.dateOnly() })
        return validateEvent(JsonObject(raw))
    }

    raw["id"] = JsonPrimitive(eventId(ev.uid, startDate, "single"))
    raw["type"] = JsonPrimitive("single")
    raw["date"] = JsonPrimitive(startDate)
    val endDate: String? = if (start.isDate) {
        // Seul un DTEND explicite prolonge une journée entière.
        vevent.time("dtend", zones)?.dateOnly()
    } else {
        val endDay = localDateTime(ev.end, vevent.tzid("dtend")).format(DATE_FORMAT)
        if (endDay == startDate) null else endDay
    }
    raw["endDate"] = endDate?.let { JsonPrimitive(it) } ?: JsonNull
    return validateEvent(JsonObject(raw))
}

/** Toutes les VEVENT d'un document iCalendar, en évènements normalisés. */
fun getEventsFromICS(text: String): List<NeoEvent> {
    val calendar = parseCalendar(text)
    val zones = registeredZones(calendar)
    return calendar.subs("vevent").filter { it.first("dtstart") != null }.mapNotNull { eventFromVEvent(it, zones) }
}

/** Ce qui identifie une occurrence à un lecteur : son titre, son jour, son créneau. */
fun occurrenceSignature(event: NeoEvent): String? {
    if (event !is NeoEvent.Single) return null
    val whenText = if (event.allDay) "allday" else "${event.startTime ?: ""}-${event.endTime ?: ""}"
    return "${event.title}::${event.date}::$whenText"
}

/* ------------------------------------------------------------------------- *
 * Instantané borné
 * ------------------------------------------------------------------------- */

private class Occurrence(val key: String, val uid: String, val recurrenceId: String?, val event: NeoEvent.Single)

private val UTC_SECONDS: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC)

/** `utcInstant` : l'instant à la seconde, `2026-09-01T08:00:00Z`. */
private fun utcInstant(time: IcsTime): String = UTC_SECONDS.format(time.instant())

private fun occurrenceKey(uid: String, recurrenceId: String?): String =
    if (recurrenceId == null) uid else "$uid::$recurrenceId"

/** `GEO` s'écrit « latitude;longitude » ; une carte attend « latitude,longitude ».
 *  Les nombres passent par la mise en forme de String(nombre) de JS. */
private fun geoOf(vevent: Comp): String? {
    val parts = vevent.first("geo")?.value?.split(';') ?: return null
    if (parts.size != 2) return null
    fun number(text: String): String = text.toDoubleOrNull()?.let { jsNumber(it) } ?: "NaN"
    return "${number(parts[0])},${number(parts[1])}"
}

private fun attendeesOf(vevent: Comp): List<String>? {
    val values = vevent.all("attendee")
        .map { it.value.replace(Regex("^mailto:", RegexOption.IGNORE_CASE), "").jsTrim() }
        .filter { it.isNotEmpty() }
    return values.ifEmpty { null }
}

private fun textOf(vevent: Comp, name: String): String? = vevent.text(name)?.takeIf { it.jsTrim().isNotEmpty() }

/** Une occurrence datée en évènement unique : début et fin sont les siens (déjà
 *  décalés pour une instance détachée), tout le reste vient du VEVENT qui la porte. */
private fun singleOccurrenceEvent(vevent: Comp, start: IcsTime, end: IcsTime): NeoEvent.Single? {
    val raw = LinkedHashMap<String, JsonElement>()
    raw["title"] = JsonPrimitive(vevent.text("summary") ?: "")
    textOf(vevent, "description")?.let { raw["description"] = JsonPrimitive(it) }
    textOf(vevent, "location")?.let { raw["location"] = JsonPrimitive(it) }
    geoOf(vevent)?.let { raw["geo"] = JsonPrimitive(it) }
    attendeesOf(vevent)?.let { raw["attendees"] = stringArray(it) }

    val startDate: String
    val endDate: String?
    if (start.isDate) {
        raw["allDay"] = JsonPrimitive(true)
        startDate = start.dateOnly()
        endDate = if (end.unix() == start.unix()) null else end.dateOnly()
    } else {
        val from = localDateTime(start, vevent.tzid("dtstart"))
        val to = localDateTime(end, vevent.tzid("dtend") ?: vevent.tzid("dtstart"))
        raw["allDay"] = JsonPrimitive(false)
        raw["startTime"] = JsonPrimitive(from.format(HOUR_MINUTE))
        raw["endTime"] = JsonPrimitive(to.format(HOUR_MINUTE))
        startDate = from.format(DATE_FORMAT)
        val endDay = to.format(DATE_FORMAT)
        endDate = if (endDay == startDate) null else endDay
    }
    raw["type"] = JsonPrimitive("single")
    raw["date"] = JsonPrimitive(startDate)
    raw["endDate"] = endDate?.let { JsonPrimitive(it) } ?: JsonNull
    return validateEvent(JsonObject(raw)) as NeoEvent.Single?
}

private fun sortKey(event: NeoEvent.Single): String = "${event.date} ${if (event.allDay) "00:00" else event.startTime}"

/** `DateTime.fromISO(...)` dans le fuseau de l'appareil : une date seule, ou un instant. */
private fun parseLocal(text: String): ZonedDateTime {
    val local = ZoneId.systemDefault()
    try {
        return LocalDate.parse(text).atStartOfDay(local)
    } catch (_: Exception) {
        // Un instant ou une heure locale, ci-dessous.
    }
    try {
        return OffsetDateTime.parse(text).atZoneSameInstant(local)
    } catch (_: Exception) {
        // Une heure locale, ci-dessous.
    }
    return LocalDateTime.parse(text).atZone(local)
}

private const val MATERIALIZED_CAP = 5000

/**
 * Le flux en occurrences datées dans `[from, to]`. Les séries s'étendent du lundi
 * de la semaine de `from` à la fin de `to` ; les instances détachées et les EXDATE
 * s'appliquent pendant l'expansion et toute annulation explicite va dans
 * `cancelledKeys`. Un évènement simple fini reste toujours, même hors fenêtre.
 *
 * Forme rendue (IcsSnapshot du TypeScript) : `events` (key, uid, recurrenceId,
 * event), `cancelledKeys` (triées), `latestOccurrenceDate`.
 */
fun parseIcsSnapshot(text: String, from: String, to: String): JsonObject {
    val calendar = parseCalendar(text)
    val zones = registeredZones(calendar)
    val local = ZoneId.systemDefault()

    val startMs = parseLocal(from).toLocalDate()
        .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(local).toInstant().toEpochMilli()
    val endMs = parseLocal(to).toLocalDate().plusDays(1).atStartOfDay(local).toInstant().toEpochMilli() - 1

    val vevents = calendar.subs("vevent").filter { it.first("dtstart") != null }
    val masters = LinkedHashMap<String, Comp>()
    val detached = ArrayList<Comp>()
    for (vevent in vevents) {
        if (vevent.first("recurrence-id") != null) {
            detached += vevent
        } else {
            val uid = vevent.text("uid")
            if (!uid.isNullOrEmpty()) masters[uid] = vevent
        }
    }

    val occurrences = ArrayList<Occurrence>()
    val cancelledKeys = LinkedHashSet<String>()
    val usedDetached = HashSet<Comp>()

    fun detachedFor(uid: String, recurrenceId: String): Comp? = detached.firstOrNull {
        it.text("uid") == uid && utcInstant(Ev(it, zones).recurrenceId!!) == recurrenceId
    }

    for ((uid, vevent) in masters) {
        val event = Ev(vevent, zones)
        // ICAL.Event relie d'abord TOUTES les exceptions du calendrier (quel que soit
        // leur UID), puis celles du même UID, qui l'emportent à clé égale.
        val exceptions = LinkedHashMap<String, Ev>()
        for (exception in detached) exceptions[Ev(exception, zones).recurrenceId!!.key()] = Ev(exception, zones)
        for (exception in detached) {
            if (exception.text("uid") == uid) exceptions[Ev(exception, zones).recurrenceId!!.key()] = Ev(exception, zones)
        }

        val recurring = vevent.first("rrule") != null || vevent.first("rdate") != null
        if (!recurring) {
            val key = occurrenceKey(uid, null)
            if (vevent.isCancelled()) {
                cancelledKeys += key
                continue
            }
            singleOccurrenceEvent(vevent, event.start, event.end)?.let {
                occurrences += Occurrence(key, uid, null, it)
            }
            continue
        }

        // EXDATE est une annulation déclarée : on la note avant de développer.
        for (value in vevent.times("exdate", zones)) cancelledKeys += "$uid::${utcInstant(value)}"

        val rules = vevent.all("rrule").map { normalizedRrule(it.value) }
        val series = occurrencesOf(
            event.start, rules, vevent.times("rdate", zones), vevent.times("exdate", zones), endMs,
        )
        var steps = 0
        var materialized = 0
        for (next in series) {
            if (materialized >= MATERIALIZED_CAP) break
            steps += 1
            if (steps > MAX_STEPS) break
            val ms = next.instant().toEpochMilli()
            if (ms > endMs) break
            if (ms < startMs) continue
            materialized += 1

            val recurrenceId = utcInstant(next)
            val key = "$uid::$recurrenceId"
            val exception = detachedFor(uid, recurrenceId)
            if (exception != null) usedDetached += exception

            val item = exceptions[next.key()] ?: exceptions[next.utcKey()]
            val source = item?.comp ?: vevent
            val itemStart = item?.start ?: next
            val itemEnd = item?.end ?: next.plusSeconds(event.durationSeconds)

            if (source.isCancelled()) {
                cancelledKeys += key
            } else {
                singleOccurrenceEvent(source, itemStart, itemEnd)?.let {
                    occurrences += Occurrence(key, uid, recurrenceId, it)
                }
            }
        }
    }

    // Une instance détachée dont la série n'a pas paru dans le flux vaut par elle-même.
    for (vevent in detached) {
        if (vevent in usedDetached) continue
        val uid = vevent.text("uid")
        val ev = Ev(vevent, zones)
        val recurrenceTime = ev.recurrenceId
        if (uid.isNullOrEmpty() || recurrenceTime == null) continue
        val recurrenceId = utcInstant(recurrenceTime)
        val key = "$uid::$recurrenceId"
        if (vevent.isCancelled()) {
            cancelledKeys += key
            continue
        }
        singleOccurrenceEvent(vevent, ev.start, ev.end)?.let {
            occurrences += Occurrence(key, uid, recurrenceId, it)
        }
    }

    // Deux VEVENT pour la même occurrence n'en font qu'une : l'ordre du document
    // décide quel UID la représente.
    val seenSignatures = HashSet<String>()
    val distinct = occurrences.filter { occurrence ->
        val signature = occurrenceSignature(occurrence.event)
        signature == null || seenSignatures.add(signature)
    }.sortedBy { sortKey(it.event) }

    val latest = distinct.map { it.event.date }.reduceOrNull { latest, date -> if (date > latest) date else latest }

    return JsonObject(
        mapOf(
            "events" to JsonArray(
                distinct.map {
                    JsonObject(
                        mapOf(
                            "key" to JsonPrimitive(it.key),
                            "uid" to JsonPrimitive(it.uid),
                            "recurrenceId" to (it.recurrenceId?.let { id -> JsonPrimitive(id) } ?: JsonNull),
                            "event" to it.event.toRecord(),
                        )
                    )
                }
            ),
            "cancelledKeys" to stringArray(cancelledKeys.sorted()),
            "latestOccurrenceDate" to (latest?.let { JsonPrimitive(it) } ?: JsonNull),
        )
    )
}
