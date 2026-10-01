package com.ahmed.neocalendar.core.tasks

import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.toRecord
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de src/ui/tasks/misfiledEvents.ts : réparer les évènements rangés comme des tâches par l'ancien défaut
 * `completed: false`. Le seul critère sûr est une plage horaire (heure de début ET de fin) : une tâche n'occupe pas de créneau.
 * Les entrées de la journée entière, celles qui ont une échéance et celles qui sont finies restent telles quelles.
 */

/** Cette note est-elle un évènement horodaté déguisé en tâche ? */
fun isMisfiledEvent(event: NeoEvent): Boolean {
    if (event !is NeoEvent.Single) return false
    // Strictement `false` : ni un horodatage de fin, ni « in-progress », ni l'absence du champ (déjà un évènement).
    val completed = event.completed as? JsonPrimitive ?: return false
    if (completed.isString || completed.content != "false") return false
    // Une échéance ne s'écrit pas par erreur : quelqu'un l'a tapée, c'est une vraie tâche.
    val due = event.due
    if (due != null && due !is JsonNull && !(due is JsonPrimitive && due.isString && due.content.isEmpty())) return false
    if (event.allDay) return false
    return !event.startTime.isNullOrEmpty() && !event.endTime.isNullOrEmpty()
}

/** Toutes les notes à convertir, dans les calendriers qu'on peut réécrire (un calendrier en lecture seule n'est pas offert). */
fun misfiledEventsOf(events: List<StoredEvent>): List<StoredEvent> =
    events.filter { it.readOnly != true && it.icsFeedId == null && isMisfiledEvent(it.event) }

/** La même note comme évènement simple : tout est gardé, `completed` et `due` sont retirés (clés supprimées, pas mises à null). */
fun plainEventRecord(event: NeoEvent): JsonObject =
    JsonObject(event.toRecord().filterKeys { it != "completed" && it != "due" })
