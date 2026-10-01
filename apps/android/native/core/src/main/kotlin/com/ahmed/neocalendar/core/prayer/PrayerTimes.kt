package com.ahmed.neocalendar.core.prayer

import java.text.Normalizer
import java.time.LocalDate
import java.time.LocalDateTime
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int

/*
 * Ports de src/ui/calendar/prayerTimes.ts, prayerCalendarName.ts et prayerTimetables/index.ts :
 * les horaires qu'une mosquée publie, tels quels (aucun calcul). Les tables sont les mêmes que celles
 * de l'ancienne (`res/raw/prayer_timetables.json`, produit depuis les fichiers TypeScript).
 */

/** Une prière, dans l'ordre du jour ; `jumua` remplace `dhuhr` le vendredi. */
enum class PrayerName(val key: String) { Fajr("fajr"), Dhuhr("dhuhr"), Jumua("jumua"), Asr("asr"), Maghrib("maghrib"), Isha("isha") }

/** `days` : par jour « MM-JJ », les minutes depuis minuit de [fajr, chourouk, dhuhr, asr, maghrib, isha]. */
data class PrayerTimetable(val id: String, val name: String, val year: Int, val jumua: List<String>, val days: Map<String, List<Int>>)

/** Une prière posée dans le temps : minutes depuis minuit, heure du mur de l'appareil, et son jour. */
data class PrayerMoment(val name: PrayerName, val minutes: Int, val date: LocalDate)

/** Un trait à poser dans la grille (`PrayerLineSpec`). */
data class PrayerLineSpec(val date: LocalDate, val hours: Double, val minutes: Int, val next: Boolean, val name: PrayerName)

private const val FAJR = 0
private const val DHUHR = 2
private const val ASR = 3
private const val MAGHRIB = 4
private const val ISHA = 5

/** Les tables enregistrées, dans l'ordre des réglages (le plus proche d'abord). */
fun parsePrayerTimetables(json: String): List<PrayerTimetable> =
    Json.parseToJsonElement(json).jsonArray.map { element ->
        val table = element.jsonObject
        PrayerTimetable(
            id = table.getValue("id").jsonPrimitive.content,
            name = table.getValue("name").jsonPrimitive.content,
            year = table.getValue("year").jsonPrimitive.int,
            jumua = table.getValue("jumua").jsonArray.map { it.jsonPrimitive.content },
            days = table.getValue("days").jsonObject.mapValues { (_, minutes) -> minutes.jsonArray.map { it.jsonPrimitive.int } },
        )
    }

fun prayerTimetableById(tables: List<PrayerTimetable>, id: String?): PrayerTimetable? =
    if (id.isNullOrEmpty()) null else tables.firstOrNull { it.id == id }

/** La clé « MM-JJ » d'un jour. */
fun dayKey(date: LocalDate): String = "%02d-%02d".format(date.monthValue, date.dayOfMonth)

private fun minutesOfTime(time: String): Int {
    val (hours, minutes) = time.split(":").map { it.toInt() }
    return hours * 60 + minutes
}

/** Les prières d'un jour, dans l'ordre ; vide hors de l'année couverte (mieux vaut rien qu'une heure inventée). */
fun prayersOn(timetable: PrayerTimetable, date: LocalDate): List<PrayerMoment> {
    if (date.year != timetable.year) return emptyList()
    val minutes = timetable.days[dayKey(date)] ?: return emptyList()
    fun at(name: PrayerName, value: Int) = PrayerMoment(name, value, date)
    val midday = if (date.dayOfWeek.value == 5) timetable.jumua.map { at(PrayerName.Jumua, minutesOfTime(it)) }
    else listOf(at(PrayerName.Dhuhr, minutes[DHUHR]))
    return (listOf(at(PrayerName.Fajr, minutes[FAJR])) + midday + listOf(
        at(PrayerName.Asr, minutes[ASR]), at(PrayerName.Maghrib, minutes[MAGHRIB]), at(PrayerName.Isha, minutes[ISHA]),
    )).sortedBy { it.minutes }
}

/** La prochaine prière à la minute `now` ; passé Isha, le Fajr du lendemain ; null si la table ne couvre pas ce jour. */
fun nextPrayer(timetable: PrayerTimetable, now: LocalDateTime): PrayerMoment? {
    val minutesNow = now.hour * 60 + now.minute
    val today = prayersOn(timetable, now.toLocalDate())
    return today.firstOrNull { it.minutes > minutesNow } ?: prayersOn(timetable, now.toLocalDate().plusDays(1)).firstOrNull()
}

/** La même table avec d'autres séances de Jumu'a (la même instance si rien ne change). */
fun withJumua(timetable: PrayerTimetable, jumua: List<String>?): PrayerTimetable =
    if (jumua == null || jumua == timetable.jumua) timetable else timetable.copy(jumua = jumua)

/** Les traits à poser : celui de la prochaine prière, et avec `showAll` les autres heures du jour qu'on regarde. */
fun prayerLinesFor(timetable: PrayerTimetable?, now: LocalDateTime, showAll: Boolean): List<PrayerLineSpec> {
    if (timetable == null) return emptyList()
    val next = nextPrayer(timetable, now)
    fun line(prayer: PrayerMoment, isNext: Boolean) = PrayerLineSpec(prayer.date, prayer.minutes / 60.0, prayer.minutes, isNext, prayer.name)
    if (!showAll) return next?.let { listOf(line(it, true)) } ?: emptyList()
    val today = now.toLocalDate()
    return prayersOn(timetable, now.toLocalDate()).map { line(it, next != null && next.minutes == it.minutes && next.date == today) }
}

/** Une séance de Jumu'a qu'on peut choisir, et les mosquées qui la tiennent. */
data class JumuaChoice(val time: String, val mosques: List<String>)

/** Les séances des mosquées enregistrées, une heure partagée n'y figure qu'une fois, triées par heure. */
fun jumuaChoices(tables: List<PrayerTimetable>): List<JumuaChoice> {
    val byTime = LinkedHashMap<String, List<String>>()
    for (table in tables) for (time in table.jumua) byTime[time] = (byTime[time] ?: emptyList()) + table.name
    return byTime.entries.sortedBy { it.key }.map { JumuaChoice(it.key, it.value) }
}

private val ARABIC_DIACRITICS = Regex("[ً-ٰٞ]")
private val ALIF_VARIANTS = Regex("[آأإٱ]")
private val ACCEPTED = setOf("islam", "اسلام")

/** Vrai pour « Islam » et « إسلام » (casse, harakat, variantes d'alif et article « ال » mis de côté). */
fun isPrayerCalendarName(name: String?): Boolean {
    if (name == null) return false
    val trimmed = Normalizer.normalize(name.trim().lowercase(), Normalizer.Form.NFC)
    val normalized = trimmed.replace(ARABIC_DIACRITICS, "").replace(ALIF_VARIANTS, "ا").replace(Regex("^ال"), "")
    return normalized in ACCEPTED
}
