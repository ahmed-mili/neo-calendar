package com.ahmed.neocalendar.core.timezones

import com.ahmed.neocalendar.core.format.CoreLanguage
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs

/*
 * Les fuseaux horaires supplémentaires : port de TimezonePicker.tsx (`offsetLabel`), de TimezoneColumn.tsx (étiquettes
 * d'une colonne d'heures) et de la liste de DesktopSettings.tsx (`addTimezone`). Le réglage `secondaryTimezones` est une
 * liste de noms IANA ; une colonne d'heures par fuseau, à droite de celle de l'appareil.
 */

private val KNOWN: Map<String, String> by lazy { ZoneId.getAvailableZoneIds().associateBy { it.lowercase() } }

/** Le nom IANA qui correspond à ce que l'utilisateur a tapé (majuscules libres, espaces autour ôtés), ou null s'il n'existe pas. */
fun canonicalZoneId(input: String): String? {
    val wanted = input.trim()
    if (wanted.isEmpty()) return null
    return KNOWN[wanted.lowercase()]
}

/**
 * La liste après l'ajout de [input] : rien ne change (null) pour un champ vide, un fuseau inconnu ou un fuseau déjà
 * dans la liste (`addTimezone` ignore un doublon).
 */
fun timezoneAdded(current: List<String>, input: String): List<String>? {
    val zone = canonicalZoneId(input) ?: return null
    return if (zone in current) null else current + zone
}

/** « GMT+2 », « GMT−4:30 » : le décalage de [zone] à [at] (`offsetLabel`, signe moins typographique). */
fun offsetLabel(zone: ZoneId, at: Instant): String {
    val minutes = zone.rules.getOffset(at).totalSeconds / 60
    val abs = abs(minutes)
    val rest = if (abs % 60 != 0) ":%02d".format(abs % 60) else ""
    return "GMT${if (minutes >= 0) "+" else "−"}${abs / 60}$rest"
}

/**
 * Le nom court au-dessus d'une colonne supplémentaire (`toFormat("ZZZZ")` de luxon, dans la langue de l'appareil) :
 * « UTC−4 » en français, « GMT−4 » en anglais.
 */
fun zoneShortName(zone: ZoneId, at: Instant): String {
    val label = offsetLabel(zone, at)
    return if (CoreLanguage.english) label else "UTC" + label.removePrefix("GMT")
}

/**
 * L'heure que marque [zone] quand il est [hour] h sur l'horloge de l'appareil le [day] : « 21:00 » en 24 h, « 9 PM »
 * sinon (« 9:30 PM » quand les minutes ne sont pas rondes : `h a` de l'ancienne les perdait).
 */
fun zoneHourLabel(zone: ZoneId, device: ZoneId, day: LocalDate, hour: Int, timeFormat24h: Boolean): String {
    val there = day.atTime(hour, 0).atZone(device).withZoneSameInstant(zone)
    return clockLabel(there.hour, there.minute, timeFormat24h, hourOnly = true)
}

/** L'heure qu'il est dans [zone] : « 21:41 », ou « 9:41 PM ». */
fun zoneNowLabel(zone: ZoneId, now: Instant, timeFormat24h: Boolean): String {
    val there = now.atZone(zone)
    return clockLabel(there.hour, there.minute, timeFormat24h, hourOnly = false)
}

private fun clockLabel(hour: Int, minute: Int, timeFormat24h: Boolean, hourOnly: Boolean): String {
    val minutes = minute.toString().padStart(2, '0')
    if (timeFormat24h) return "${hour.toString().padStart(2, '0')}:$minutes"
    val hour12 = if (hour % 12 == 0) 12 else hour % 12
    val suffix = if (hour < 12) "AM" else "PM"
    return if (hourOnly && minute == 0) "$hour12 $suffix" else "$hour12:$minutes $suffix"
}
