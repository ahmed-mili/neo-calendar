package com.ahmed.neocalendar.core.workspace

/** Ce que l'app écrit dans `.stignore` : ses temporaires d'écriture, et rien d'autre. */
const val STIGNORE_TEXT = ".neo-tmp-*\n"

private const val MARKER_FILE = ".neo-calendar.json"
private const val MARKER_DIR = ".neo-calendar"

/** Un dossier est un dossier Neo Calendar s'il contient `.neo-calendar.json` ou le sous-dossier `.neo-calendar/`. */
fun isNeoCalendarFolder(storage: WorkspaceStorage): Boolean =
    storage.list("").any { (it.name == MARKER_FILE && !it.isDirectory) || (it.name == MARKER_DIR && it.isDirectory) }

/**
 * Le dossier contient-il de vraies notes (un calendrier, ou une note `.md` à la racine), et pas seulement le marqueur
 * et `.stignore` ? Parcours de `list` seul, sans lire aucun contenu : ni préférences corrompues ni note illisible ne lèvent.
 */
fun workspaceHasNotes(storage: WorkspaceStorage): Boolean =
    storage.list("").any {
        !isSyncArtifact(it.name) &&
            if (it.isDirectory) !it.name.startsWith(".") else it.name.lowercase(java.util.Locale.ROOT).endsWith(".md")
    }

/**
 * Prépare un dossier de notes neuf (première ouverture d'une nouvelle installation) : le marqueur
 * (le sous-dossier `.neo-calendar/`, sans fichier de réglages : le PC a les siens, deux fichiers
 * créés chacun de leur côté produiraient un conflit à la première synchro) et le `.stignore`.
 * Sans effet sur ce qui existe déjà.
 */
fun initNewWorkspace(storage: WritableWorkspaceStorage) {
    if (storage.list("").none { it.name == MARKER_DIR }) storage.createDirectory("", MARKER_DIR)
    writeStignore(storage)
}

/** `.stignore` du dossier : `.neo-tmp-*` et rien d'autre ; réécrit seulement s'il diffère. */
fun writeStignore(storage: WritableWorkspaceStorage) {
    val existing = storage.list("").any { it.name == ".stignore" && !it.isDirectory }
    if (!existing) storage.createFile("", ".stignore", "text/plain")
    if (storage.readText(".stignore") != STIGNORE_TEXT) storage.writeText(".stignore", STIGNORE_TEXT)
}
