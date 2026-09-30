package com.ahmed.neocalendar.core.notes

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/*
 * Port de `mergeForSave` (src/ui/calendar/eventScheduling.ts) : le formulaire
 * de la fiche est fusionné par-dessus l'évènement tel qu'il est stocké.
 *
 * Les clés discriminantes, les sous-tâches et la description sont retirées de
 * la base d'abord (un payload qui les omet les supprime de la note) ; tout le
 * reste de la base (id, geo, participants, rappels, lieu) survit à un payload
 * qui ne le mentionne pas. Un évènement sur la journée entière ne porte aucune
 * heure.
 */
fun mergeForSave(base: NeoEvent, payload: JsonObject): JsonObject {
    val merged = LinkedHashMap<String, kotlinx.serialization.json.JsonElement>()
    for ((key, value) in base.toRecord()) if (key !in KEYS_DROPPED_WHEN_ABSENT) merged[key] = value
    merged.putAll(payload)
    if ((merged["allDay"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true) {
        merged.remove("startTime")
        merged.remove("endTime")
    }
    return JsonObject(merged)
}
