package com.ahmed.neocalendar.core.grid

import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.toRecord
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.floor
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Déplacer, redimensionner et créer sur la grille : la part de calcul des
 * gestes, sans l'écran. Ports de `projectGridDrag` et `dayShiftFromAnchor`
 * (dragProjection.ts), `positionToDate` (CalendarUtils.ts),
 * `computeSnapped` (useTimeGridResize.ts), `applyEventDrag` et
 * `applyEventResize` (useEventDragResize.ts).
 *
 * Écarts voulus avec le TypeScript, tous du côté des données :
 * - un jour de série déplacé ou redimensionné garde toute la fiche de la série
 *   (lieu, rappels, description...), le TypeScript n'en recopie que le titre et la
 *   description ;
 * - un redimensionnement qui passe minuit écrit aussi la date de fin.
 */

/** Pas des déplacements et des redimensionnements. */
const val SNAP_MINUTES = 15

/** Durée d'un évènement créé d'un appui sur un créneau vide. */
const val DRAFT_MINUTES = 30

/** Un évènement ne descend jamais sous cette durée en se redimensionnant. */
const val MIN_EVENT_MINUTES = 15

private val CLOCK = DateTimeFormatter.ofPattern("HH:mm")

/** `Math.round` de JavaScript : les moitiés vont vers le haut. */
private fun jsRound(x: Double): Double = floor(x + 0.5)

/** Un déplacement vertical en pixels, calé au quart d'heure le plus proche, en minutes. */
fun snappedMinutes(deltaPx: Double, hourPx: Double): Int =
    (jsRound(((deltaPx / hourPx) * 60) / SNAP_MINUTES) * SNAP_MINUTES).toInt()

/**
 * `dayShiftFromAnchor` : de combien de jours le doigt a bougé entre deux
 * positions mesurées en jours (le jour, et la part de la colonne déjà parcourue).
 */
fun dayShiftFromAnchor(anchorDay: Long, anchorFraction: Double, day: Long, fraction: Double): Int =
    jsRound((day - anchorDay).toDouble() + (fraction - anchorFraction)).toInt()

/** Où atterrit un évènement horodaté déplacé : début et fin. */
data class MovedSlot(val start: Instant, val end: Instant)

/**
 * `projectGridDrag`, déplacement horodaté ordinaire : `dayShift` jours
 * (l'heure murale est conservée), puis `deltaMinutes` ; la durée reste la même.
 */
fun movedSlot(start: Instant, end: Instant, dayShift: Int, deltaMinutes: Int, zone: ZoneId): MovedSlot {
    val duration = Duration.between(start, end)
    val moved = start.atZone(zone).plusDays(dayShift.toLong()).toInstant().plus(Duration.ofMinutes(deltaMinutes.toLong()))
    return MovedSlot(moved, moved.plus(duration))
}

enum class ResizeEdge { Top, Bottom }

/**
 * `computeSnapped` : une poignée tirée de `deltaMinutes` (déjà calés) ; le
 * bord ne passe jamais à moins d'un quart d'heure de l'autre.
 */
fun resizedSlot(start: Instant, end: Instant, edge: ResizeEdge, deltaMinutes: Int): MovedSlot {
    val delta = Duration.ofMinutes(deltaMinutes.toLong())
    val min = Duration.ofMinutes(MIN_EVENT_MINUTES.toLong())
    return if (edge == ResizeEdge.Top) {
        MovedSlot(minOf(start.plus(delta), end.minus(min)), end)
    } else {
        MovedSlot(start, maxOf(end.plus(delta), start.plus(min)))
    }
}

/**
 * `positionToDate` : l'heure d'un appui à `yPx` dans la colonne du jour,
 * bornée à la journée et calée au pas ; 24 h devient minuit du lendemain.
 */
fun positionToDateTime(yPx: Double, hourPx: Double, day: LocalDate, snap: Int = SNAP_MINUTES): LocalDateTime {
    val clamped = maxOf(0.0, minOf(yPx, 24 * hourPx))
    val totalMinutes = (clamped / hourPx) * 60
    val hours = floor(totalMinutes / 60).toLong()
    val minutes = (jsRound((totalMinutes % 60) / snap) * snap).toLong()
    return day.atStartOfDay().plusHours(hours).plusMinutes(minutes)
}

/** Le créneau d'un appui sur un créneau vide : le début calé au quart d'heure, trente minutes. */
fun draftSlotAt(yPx: Double, hourPx: Double, day: LocalDate): Pair<LocalDateTime, LocalDateTime> {
    val start = positionToDateTime(yPx, hourPx, day)
    return start to start.plusMinutes(DRAFT_MINUTES.toLong())
}

private fun clock(instant: Instant, zone: ZoneId): String = instant.atZone(zone).format(CLOCK)

private fun dayOf(instant: Instant, zone: ZoneId): String = instant.atZone(zone).toLocalDate().toString()

/**
 * `applyEventDrag`, évènement ponctuel : la note reprise telle quelle, la
 * date, les heures et la fin changées. Une fin le lendemain est une fin de
 * date ; sinon la date de fin s'efface.
 */
fun rescheduledRecord(record: JsonObject, start: Instant, end: Instant, zone: ZoneId): JsonObject {
    val startDate = dayOf(start, zone)
    val endDate = dayOf(end, zone)
    val updated = LinkedHashMap<String, JsonElement>(record)
    updated["date"] = JsonPrimitive(startDate)
    updated["allDay"] = JsonPrimitive(false)
    updated["startTime"] = JsonPrimitive(clock(start, zone))
    updated["endTime"] = JsonPrimitive(clock(end, zone))
    updated["endDate"] = if (endDate > startDate) JsonPrimitive(endDate) else JsonNull
    return JsonObject(updated)
}

/**
 * `applyEventResize`, évènement ponctuel : les deux heures sont écrites à
 * chaque fois. La date et la date de fin ne bougent que si un bord a passé minuit.
 */
fun resizedRecord(record: JsonObject, start: Instant, end: Instant, zone: ZoneId): JsonObject {
    val updated = LinkedHashMap<String, JsonElement>(record)
    updated["startTime"] = JsonPrimitive(clock(start, zone))
    updated["endTime"] = JsonPrimitive(clock(end, zone))
    val startDate = dayOf(start, zone)
    val endDate = dayOf(end, zone)
    val wantedEnd: JsonElement = if (endDate > startDate) JsonPrimitive(endDate) else JsonNull
    val currentDate = (record["date"] as? JsonPrimitive)?.takeIf { it.isString }?.content
    val currentEnd = (record["endDate"] as? JsonPrimitive)?.takeIf { it.isString }?.content
    val sameEnd = (wantedEnd as? JsonPrimitive)?.takeIf { it.isString }?.content == currentEnd
    if (currentDate != startDate) updated["date"] = JsonPrimitive(startDate)
    if (!sameEnd) updated["endDate"] = wantedEnd
    return JsonObject(updated)
}

/**
 * Un jour de série déplacé ou redimensionné : la fiche de la série, sans son
 * identifiant, aux nouvelles heures. `WorkspaceWriter` en fait un évènement
 * ponctuel (`detachedOccurrence`) et ajoute le jour aux exclusions de la série.
 */
fun seriesOccurrenceRecord(series: NeoEvent, start: Instant, end: Instant, zone: ZoneId): JsonObject {
    val record = LinkedHashMap<String, JsonElement>(series.toRecord())
    record.remove("id")
    record["allDay"] = JsonPrimitive(false)
    record["startTime"] = JsonPrimitive(clock(start, zone))
    record["endTime"] = JsonPrimitive(clock(end, zone))
    return JsonObject(record)
}
