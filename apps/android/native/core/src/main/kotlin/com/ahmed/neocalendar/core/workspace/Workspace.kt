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

/** Port de `loadWorkspace` (MainActivity.java), sans SAF. */
fun loadWorkspace(storage: WorkspaceStorage): LoadedWorkspace {
    val children = storage.list("")
    val calendars = ArrayList<WorkspaceCalendar>()
    val events = ArrayList<WorkspaceEventFile>()
    for (d in children) {
        if (!d.isDirectory || d.name.startsWith(".")) continue
        calendars += WorkspaceCalendar(d.name, d.name)
        collectEvents(storage, d.name, d.name, events)
    }
    if (calendars.isEmpty()) {
        calendars += WorkspaceCalendar("", "Default")
        for (f in children) {
            if (f.isDirectory || !isNote(f.name)) continue
            events += WorkspaceEventFile(f.name, "", f.name, read(storage, f.name))
        }
    }
    return LoadedWorkspace(calendars, events, readPreferences(storage))
}

private fun isNote(name: String) = name.lowercase(java.util.Locale.ROOT).endsWith(".md")

/** Un fichier listé mais illisible est une erreur, pas un texte vide. */
private fun read(storage: WorkspaceStorage, path: String): String =
    storage.readText(path) ?: throw java.io.IOException("Lecture impossible : $path")

/** Toutes les notes d'un calendrier, sous-dossiers compris ; le calendrier reste celui du dossier de tête. */
private fun collectEvents(
    storage: WorkspaceStorage,
    calendarPath: String,
    directory: String,
    out: MutableList<WorkspaceEventFile>,
) {
    for (f in storage.list(directory)) {
        val path = "$directory/${f.name}"
        if (f.isDirectory) {
            if (f.name.startsWith(".")) continue
            collectEvents(storage, calendarPath, path, out)
            continue
        }
        if (!isNote(f.name)) continue
        out += WorkspaceEventFile(path, calendarPath, f.name, read(storage, path))
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
