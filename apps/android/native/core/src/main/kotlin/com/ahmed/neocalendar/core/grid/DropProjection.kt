package com.ahmed.neocalendar.core.grid

import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.toRecord
import java.time.Instant
import java.time.ZoneId
import kotlin.math.floor
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Glisser un évènement vers ou depuis la bande « journée entière » : port de `projectGridDrag` (dragProjection.ts) et de la
 * conversion d'`applyEventDrag` (useEventDragResize.ts). Le déplacement se projette sur la bande (le jour devient « toute la
 * journée ») ou, depuis la bande, sur la grille (un bloc de 30 minutes à l'heure lâchée).
 *
 * Écart voulu : une barre de plusieurs jours déplacée dans la bande garde sa durée (l'ancienne la ramène à un jour).
 */

/** Un évènement journée entière lâché dans la grille y devient un bloc de cette durée, jamais une journée entière. */
const val ALLDAY_DROP_MINUTES = 30

/** La tolérance au-dessus de la bande, en dp : le bord haut compte encore comme « dans la bande » (`ALLDAY_BAND_SLOP_PX`). */
const val ALLDAY_BAND_SLOP_DP = 12

/** Où atterrit un évènement déplacé : début, fin (exclusive pour une journée entière) et si c'est une journée entière. */
data class DropSlot(val start: Instant, val end: Instant, val allDay: Boolean)

/**
 * `isInAllDayBand` : le doigt est dans la bande, ou au-dessus (en-têtes), jusqu'à [slopPx] sous son bord haut.
 * [pointerY] se mesure depuis le haut du corps de la grille (négatif au-dessus) ; la bande le touche par en haut.
 */
fun isInAllDayBand(pointerY: Float, bandHeightPx: Float, slopPx: Float): Boolean =
    pointerY <= 0f && pointerY >= -(bandHeightPx + slopPx)

/** `computeDropHour` : l'heure sous le doigt en minutes depuis minuit, calée au quart d'heure, au plus 23:45. */
fun dropMinuteOfDay(contentYPx: Double, hourPx: Double): Int {
    val minutes = (contentYPx / hourPx) * 60
    val snapped = floor(minutes / SNAP_MINUTES + 0.5).toInt() * SNAP_MINUTES
    return snapped.coerceIn(0, 23 * 60 + (60 - SNAP_MINUTES))
}

/**
 * Où tombe un évènement lâché. [dayShift] : de combien de jours il se décale ; [deltaMinutes] : le déplacement vertical
 * calé (évènement horodaté seulement) ; [inBand] : le doigt est sur la bande ; [dropMinutes] : l'heure sous le doigt
 * (barre lâchée dans la grille).
 */
fun projectDrop(
    start: Instant,
    end: Instant,
    allDay: Boolean,
    dayShift: Int,
    deltaMinutes: Int,
    inBand: Boolean,
    dropMinutes: Int,
    zone: ZoneId,
): DropSlot {
    fun day(instant: Instant, shift: Int): java.time.ZonedDateTime =
        instant.atZone(zone).toLocalDate().plusDays(shift.toLong()).atStartOfDay(zone)
    if (allDay) {
        val first = day(start, dayShift)
        if (inBand) {
            // La durée en jours est gardée : la barre glisse, elle ne se raccourcit pas.
            val span = java.time.temporal.ChronoUnit.DAYS.between(start.atZone(zone).toLocalDate(), end.atZone(zone).toLocalDate()).coerceAtLeast(1)
            return DropSlot(first.toInstant(), first.plusDays(span).toInstant(), true)
        }
        val dropped = first.plusMinutes(dropMinutes.toLong()).toInstant()
        return DropSlot(dropped, dropped.plusSeconds(ALLDAY_DROP_MINUTES * 60L), false)
    }
    if (inBand) {
        // Le jour vient du décalage du geste, jamais de l'heure projetée : elle peut franchir minuit.
        val first = day(start, dayShift)
        return DropSlot(first.toInstant(), first.plusDays(1).toInstant(), true)
    }
    val moved = movedSlot(start, end, dayShift, deltaMinutes, zone)
    return DropSlot(moved.start, moved.end, false)
}

private val CLOCK_FORMAT = java.time.format.DateTimeFormatter.ofPattern("HH:mm")

/**
 * `applyEventDrag` quand le drapeau « journée entière » change : l'évènement ponctuel devient une journée entière (heures
 * retirées, `endDate` seulement pour une vraie plage) ou reprend des heures (le créneau lâché).
 */
fun convertedRecord(record: JsonObject, slot: DropSlot, zone: ZoneId): JsonObject {
    val startDate = slot.start.atZone(zone).toLocalDate().toString()
    val updated = LinkedHashMap<String, JsonElement>(record)
    updated["date"] = JsonPrimitive(startDate)
    updated["allDay"] = JsonPrimitive(slot.allDay)
    if (slot.allDay) {
        val lastDay = slot.end.atZone(zone).toLocalDate().minusDays(1).toString()
        updated["endDate"] = if (lastDay > startDate) JsonPrimitive(lastDay) else JsonNull
        updated.remove("startTime")
        updated.remove("endTime")
    } else {
        val endDate = slot.end.atZone(zone).toLocalDate().toString()
        updated["startTime"] = JsonPrimitive(slot.start.atZone(zone).format(CLOCK_FORMAT))
        updated["endTime"] = JsonPrimitive(slot.end.atZone(zone).format(CLOCK_FORMAT))
        updated["endDate"] = if (endDate > startDate) JsonPrimitive(endDate) else JsonNull
    }
    return JsonObject(updated)
}

/** Un jour de série déplacé sur la bande ou depuis elle : la fiche de la série, sans son identifiant, au nouveau créneau. */
fun seriesConvertedRecord(series: NeoEvent, slot: DropSlot, zone: ZoneId): JsonObject {
    val record = LinkedHashMap<String, JsonElement>(series.toRecord())
    record.remove("id")
    return convertedRecord(JsonObject(record), slot, zone)
}
