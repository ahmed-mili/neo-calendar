package com.ahmed.neocalendar.core.workspace

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

data class WorkspaceCalendar(val relativePath: String, val name: String)

data class WorkspaceEventFile(
    val relativePath: String,
    val calendarPath: String,
    val fileName: String,
    val contents: String,
)

data class LoadedWorkspace(
    val calendars: List<WorkspaceCalendar>,
    val eventFiles: List<WorkspaceEventFile>,
    val preferences: JsonObject,
)

class UnreadablePreferencesException(message: String) : Exception(message)

private const val PREFERENCES_FILE_NAME = ".neo-calendar.json"
private const val LEGACY_PREFERENCES_FILE_NAME = ".neo-calendar-desktop.json"
private const val METADATA_DIR = ".neo-calendar"

/**
 * Port de `loadWorkspace` (MainActivity.java), sans SAF. Les artefacts de synchro (`.stfolder`, `.stversions/`, `.stignore`,
 * temporaires, copies de conflit) ne sont jamais des notes : ignorés, dans les deux modes de stockage. Seul le nettoyage des
 * liens ICS (`keepConflictCopies = true`) garde les copies de conflit, pour supprimer celles de ses propres notes.
 */
fun loadWorkspace(storage: WorkspaceStorage, keepConflictCopies: Boolean = false): LoadedWorkspace {
    val ignored = { name: String -> isSyncArtifact(name) && !(keepConflictCopies && isConflictCopy(name)) }
    val children = storage.list("").filterNot { ignored(it.name) }
    val calendars = ArrayList<WorkspaceCalendar>()
    val notes = ArrayList<PendingNote>()
    for (d in children) {
        if (!d.isDirectory || d.name.startsWith(".")) continue
        calendars += WorkspaceCalendar(d.name, d.name)
        collectNotes(storage, d.name, d.name, notes, ignored)
    }
    if (calendars.isEmpty()) {
        calendars += WorkspaceCalendar("", "Default")
        for (f in children) {
            if (f.isDirectory || !isNote(f.name)) continue
            notes += PendingNote(f.name, "", f.name)
        }
    }
    // Tout est listé d'abord, puis toutes les notes sont lues en un appel : un stockage peut les lire en parallèle.
    val texts = storage.readTexts(notes.map { it.path })
    val events = notes.mapIndexed { i, n ->
        WorkspaceEventFile(n.path, n.calendarPath, n.fileName, texts[i] ?: throw java.io.IOException("Lecture impossible : ${n.path}"))
    }
    return LoadedWorkspace(calendars, events, readPreferences(storage))
}

private fun isNote(name: String) = name.lowercase(java.util.Locale.ROOT).endsWith(".md")

/** Une note listée, pas encore lue. */
private class PendingNote(val path: String, val calendarPath: String, val fileName: String)

/** Toutes les notes d'un calendrier, sous-dossiers compris ; le calendrier reste celui du dossier de tête. */
private fun collectNotes(
    storage: WorkspaceStorage,
    calendarPath: String,
    directory: String,
    out: MutableList<PendingNote>,
    ignored: (String) -> Boolean,
) {
    for (f in storage.list(directory).filterNot { ignored(it.name) }) {
        val path = "$directory/${f.name}"
        if (f.isDirectory) {
            if (f.name.startsWith(".")) continue
            collectNotes(storage, calendarPath, path, out, ignored)
            continue
        }
        if (!isNote(f.name)) continue
        out += PendingNote(path, calendarPath, f.name)
    }
}

/** Fichier absent = premier lancement ; fichier corrompu = erreur, jamais des valeurs par défaut. */
fun readPreferences(storage: WorkspaceStorage): JsonObject {
    val raw = storage.readText("$METADATA_DIR/$PREFERENCES_FILE_NAME")
        ?: storage.readText(PREFERENCES_FILE_NAME)
        ?: storage.readText(LEGACY_PREFERENCES_FILE_NAME)
        ?: return JsonObject(emptyMap())
    if (raw.isBlank()) return JsonObject(emptyMap())
    return parsePreferencesText(raw)
}

private fun parsePreferencesText(raw: String): JsonObject {
    try {
        return Json.parseToJsonElement(raw) as? JsonObject
            ?: throw IllegalArgumentException("A JSONObject text must begin with '{'")
    } catch (e: Exception) {
        throw UnreadablePreferencesException("Le fichier de préférences est illisible : ${e.message}")
    }
}

/**
 * Pour écrire : null = aucun fichier (premier lancement, les défauts). Un fichier PRÉSENT mais vide ou
 * illisible est une erreur : y écrire les défauts détruirait les réglages que Syncthing est en train
 * d'apporter (copie en cours, écriture interrompue).
 */
fun readPreferencesForWrite(storage: WorkspaceStorage): JsonObject? {
    val raw = storage.readText("$METADATA_DIR/$PREFERENCES_FILE_NAME")
        ?: storage.readText(PREFERENCES_FILE_NAME)
        ?: storage.readText(LEGACY_PREFERENCES_FILE_NAME)
        ?: return null
    if (raw.isBlank()) throw UnreadablePreferencesException("Le fichier de préférences est vide : rien n'a été écrit.")
    return parsePreferencesText(raw)
}
