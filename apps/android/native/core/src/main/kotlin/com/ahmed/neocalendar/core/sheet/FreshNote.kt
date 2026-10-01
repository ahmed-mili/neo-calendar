package com.ahmed.neocalendar.core.sheet

import com.ahmed.neocalendar.core.notes.StoredEvent

/**
 * La note qu'une fiche tient ouverte, telle que le dossier la rend maintenant : par son chemin, puis par son
 * identifiant (une note renommée par une autre écriture garde son `id`), puis par son nom de fichier dans le
 * calendrier visé (une note déplacée dont l'écriture suivante a échoué). Null quand rien ne la désigne sans ambiguïté.
 */
fun freshNote(events: List<StoredEvent>, note: StoredEvent, calendarPath: String): StoredEvent? {
    events.firstOrNull { it.relativePath == note.relativePath }?.let { return it }
    if (!note.id.startsWith("path:")) events.singleOrNull { it.id == note.id }?.let { return it }
    return events.singleOrNull { it.fileName == note.fileName && it.calendarPath == calendarPath }
}
