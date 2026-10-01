package com.ahmed.neocalendar.core.sync

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** « Connecté », « Jamais connecté » ou la dernière connexion d'un appareil (`lastSeen` en texte ISO de Syncthing). */
fun lastSeenLabel(connected: Boolean, lastSeenIso: String?, now: Instant, zone: ZoneId = ZoneId.systemDefault()): String {
    if (connected) return "Connecté"
    val seen = lastSeenIso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return "Jamais connecté"
    val ago = Duration.between(seen, now)
    return when {
        ago.isNegative || ago.toMinutes() < 1 -> "Vu à l'instant"
        ago.toMinutes() < 60 -> "Vu il y a ${ago.toMinutes()} min"
        ago.toHours() < 24 -> "Vu il y a ${ago.toHours()} h"
        ago.toDays() < 7 -> "Vu il y a ${ago.toDays()} j"
        else -> "Vu le " + DateTimeFormatter.ofPattern("d MMM yyyy", Locale.FRENCH).withZone(zone).format(seen)
    }
}
