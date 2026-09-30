package com.ahmed.neocalendar.core.workspace

import java.util.Locale

/*
 * Port des écritures de MainActivity.java (writeEvent, validName, uniqueName,
 * findPath, findOrCreate, createFolder, renameFolder, deleteFolder,
 * savePreferences) sur WritableWorkspaceStorage. Le Java fait foi : mêmes
 * règles, mêmes messages, même ordre des opérations (une interruption laisse
 * un doublon, jamais une perte).
 */

const val MARKDOWN_MIME = "text/markdown"
private const val METADATA_DIR = ".neo-calendar"
private const val PREFERENCES_FILE = ".neo-calendar.json"
private const val LEGACY_PREFERENCES_FILE = ".neo-calendar-desktop.json"

/** Un nom de fichier ou de dossier, sans séparateur ; un fichier de note finit par .md (Java validName). */
fun validName(name: String, markdown: Boolean): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty() || trimmed == "." || trimmed == ".." || trimmed.contains("/") || trimmed.contains("\\")) {
        throw IllegalArgumentException("Nom invalide: $trimmed")
    }
    if (markdown && !trimmed.lowercase(Locale.ROOT).endsWith(".md")) throw IllegalArgumentException("Le fichier doit finir par .md")
    return trimmed
}

private fun child(dir: String, name: String) = if (dir.isEmpty()) name else "$dir/$name"

private fun find(storage: WorkspaceStorage, dir: String, name: String): String? =
    if (storage.list(dir).any { it.name == name }) child(dir, name) else null

/** Le premier nom libre : « nom (1).md », « nom (2).md »... ; le point initial d'un fichier caché n'est pas une extension. */
fun uniqueName(storage: WorkspaceStorage, dir: String, name: String): String {
    if (find(storage, dir, name) == null) return name
    val dot = name.lastIndexOf('.')
    val stem = if (dot > 0) name.substring(0, dot) else name
    val ext = if (dot > 0) name.substring(dot) else ""
    var i = 1
    while (true) {
        val candidate = "$stem ($i)$ext"
        if (find(storage, dir, candidate) == null) return candidate
        i++
    }
}

/**
 * Le chemin tel qu'il existe dans le dossier, ou null s'il n'existe pas. « .. »
 * est refusé (le dossier choisi ne doit jamais être quitté) ; « . » et les
 * parties vides sont ignorés, « \ » vaut « / ».
 */
fun findPath(storage: WorkspaceStorage, relative: String): String? {
    var current = ""
    for (part in relative.replace('\\', '/').split("/")) {
        if (part.isEmpty() || part == ".") continue
        if (part == "..") throw IllegalArgumentException("Chemin invalide")
        current = find(storage, current, part) ?: return null
    }
    return current
}

/** Le fichier ou dossier `name` de `dir`, créé au besoin (Java findOrCreate). */
fun findOrCreate(
    storage: WritableWorkspaceStorage,
    dir: String,
    name: String,
    mimeType: String,
    directory: Boolean = false,
): String = find(storage, dir, name)
    ?: if (directory) storage.createDirectory(dir, name) else storage.createFile(dir, name, mimeType)

/** La note qu'on modifie n'est plus là où la fiche l'a lue : Syncthing l'a renommée ou supprimée. Rien n'est écrit. */
class NoteMovedException : IllegalStateException("Cette note a été déplacée ou supprimée ailleurs. Rechargez et recommencez.")

/**
 * Écrit une note, en la déplaçant quand son calendrier change.
 *
 * Un renommage ne passe pas d'un dossier à un autre : un changement de
 * calendrier écrit le nouveau fichier d'abord et supprime l'ancien après.
 * Une note rangée dans un sous-dossier de son calendrier y reste ; seul un
 * autre calendrier la déplace (à la racine du nouveau).
 * Une note précédente donnée mais absente du dossier n'est jamais recréée :
 * NoteMovedException, rien n'est écrit.
 * Rend le chemin relatif du fichier écrit.
 */
fun writeEvent(
    storage: WritableWorkspaceStorage,
    calendarPath: String,
    fileName: String,
    previousRelativePath: String,
    contents: String,
): String {
    var name = validName(fileName, true)
    val old = if (previousRelativePath.isEmpty()) null else findPath(storage, previousRelativePath) ?: throw NoteMovedException()
    val previousCalendar =
        if (previousRelativePath.contains("/")) previousRelativePath.substring(0, previousRelativePath.lastIndexOf('/')) else ""
    val sameCalendar = old != null &&
        (previousCalendar == calendarPath || (calendarPath.isNotEmpty() && previousRelativePath.startsWith("$calendarPath/")))
    // Même calendrier : le dossier réel de la note (un sous-dossier compris) ; sinon la racine du calendrier cible.
    val dir = if (sameCalendar) old!!.substringBeforeLast('/', "")
    else if (calendarPath.isEmpty()) "" else findPath(storage, calendarPath)
        ?: throw IllegalStateException("Calendrier introuvable: $calendarPath")
    val target = find(storage, dir, name)
    fun written() = child(dir, name)

    if (old != null && sameCalendar) {
        if (target != null && target == old) {
            storage.writeText(old, contents)
            return written()
        }
        if (target != null) name = uniqueName(storage, dir, name)
        val renamed = storage.rename(old, name)
        storage.writeText(renamed, contents)
        return written()
    }

    if (target != null && old == null) {
        storage.writeText(target, contents)
        return written()
    }
    if (target != null) name = uniqueName(storage, dir, name)
    val created = storage.createFile(dir, name, MARKDOWN_MIME)
    try {
        storage.writeText(created, contents)
    } catch (e: Exception) {
        // Pas de note vide laissée à Syncthing ; la note précédente n'a pas été touchée.
        runCatching { storage.delete(created) }
        throw e
    }
    if (old != null) storage.delete(old)
    return written()
}

/** Supprime la note ; un chemin qui n'existe plus n'est pas une erreur. */
fun deleteEvent(storage: WritableWorkspaceStorage, relativePath: String) {
    val path = findPath(storage, relativePath) ?: return
    storage.delete(path)
}

/** Crée un calendrier (un dossier à la racine) et rend son nom. */
fun createFolder(storage: WritableWorkspaceStorage, name: String): String {
    val valid = validName(name, false)
    if (find(storage, "", valid) != null) throw IllegalStateException("Un dossier portant ce nom existe deja.")
    storage.createDirectory("", valid)
    return valid
}

fun renameFolder(storage: WritableWorkspaceStorage, relative: String, name: String): String {
    val valid = validName(name, false)
    val path = findPath(storage, relative) ?: throw IllegalStateException("Calendrier introuvable.")
    if (find(storage, "", valid) != null) throw IllegalStateException("Un dossier portant ce nom existe deja.")
    storage.rename(path, valid)
    return valid
}

fun deleteFolder(storage: WritableWorkspaceStorage, relative: String) {
    val path = findPath(storage, relative) ?: return
    if (storage.list(path).isNotEmpty()) throw IllegalStateException("Ce calendrier nest pas vide.")
    storage.delete(path)
}

/** Écrit le fichier de préférences dans `.neo-calendar/`, puis retire les anciens emplacements à la racine. */
fun savePreferences(storage: WritableWorkspaceStorage, text: String) {
    val metadata = findOrCreate(storage, "", METADATA_DIR, "", directory = true)
    val file = findOrCreate(storage, metadata, PREFERENCES_FILE, "application/json")
    storage.writeText(file, text)
    for (legacy in listOf(PREFERENCES_FILE, LEGACY_PREFERENCES_FILE)) {
        find(storage, "", legacy)?.let { storage.delete(it) }
    }
}
